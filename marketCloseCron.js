import { PrismaClient } from "@prisma/client";
import { messaging } from "./firebaseAdmin.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { b64Gemini } from "./geminiConfig.js";
import { isIndianTradingDay } from "./simulation.js";

const prisma = new PrismaClient();
const fallbackKey = Buffer.from(b64Gemini, "base64").toString("utf-8");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || fallbackKey);

// Unicode-safe emojis (avoids encoding corruption during git/deployment)
const EMOJI = {
  chart:     "\uD83D\uDCC8",
  chartDown: "\uD83D\uDCC9",
  rocket:    "\uD83D\uDE80",
};

const NEWS_RSS_FEED = "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms";

async function fetchTodayMarketNews() {
  try {
    const res = await fetch(NEWS_RSS_FEED, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const clean = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim());
    let snippets = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/g;
    const titleRx = /<title>(.*?)<\/title>/;
    let m;
    while ((m = itemRx.exec(clean)) !== null && snippets.length < 5) {
      const t = titleRx.exec(m[1]);
      if (t && t[1]) snippets.push(t[1].replace(/<[^>]*>/g, "").trim());
    }
    return snippets.join(". ");
  } catch (e) {
    console.error("News fetch failed:", e.message);
    return "Market closed with mixed global cues.";
  }
}

export const runMarketClosePushNotifications = async (forceSend = false) => {
  let logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  if (!forceSend && !isIndianTradingDay()) {
    log("💤 Indian Stock Market was closed today (Weekend or Holiday). Skipping post-market push notifications.");
    return { success: true, logs, skipped: true, reason: "Market was closed today" };
  }

  log("Running Post-Market AI Push Notifications...");
  if (!messaging) { log("Firebase messaging is null."); return { success: false, logs }; }

  try {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      include: { holdings: { include: { stock: true } } },
    });
    log(`Found ${users.length} users with FCM tokens.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const marketNews = await fetchTodayMarketNews();
    log(`Market news: ${marketNews.substring(0, 80)}...`);

    for (const user of users) {
      // Skip users already notified today (duplicate prevention)
      if (user.lastNotifiedAt && new Date(user.lastNotifiedAt) >= today) {
        log(`Skipping ${user.email} — already notified today.`);
        continue;
      }

      // Calculate portfolio metrics
      let holdingsValue = 0;
      let totalCostBasis = 0;
      let portfolioContext = "";

      if (!user.holdings || user.holdings.length === 0) {
        portfolioContext = "No active holdings, 100% cash.";
      } else {
        const lines = user.holdings.map((h) => {
          const val = h.quantity * h.stock.price;
          const cost = h.quantity * h.avgPrice;
          holdingsValue += val;
          totalCostBasis += cost;
          const posPnl = val - cost;
          return `${h.stock.symbol}: \u20B9${val.toFixed(0)} (P&L \u20B9${posPnl.toFixed(0)})`;
        });
        portfolioContext = lines.join("; ");
      }

      const netWorth = (user.cash || 0) + holdingsValue;
      const totalUnrealizedPnl = holdingsValue - totalCostBasis;
      
      // Calculate true Day's Gain/Loss (compared to start of day)
      const startOfDay = user.startOfDayNetWorth || netWorth;
      const todayPnl = netWorth - startOfDay;
      const hasMeaningfulTodayPnl = Math.abs(todayPnl) >= 5;
      const todayPnlSign = todayPnl >= 0 ? "+" : "-";
      const pnlEmoji = todayPnl >= 0 ? EMOJI.rocket : EMOJI.chartDown;

      // Dynamic title showing true today P&L or steady status
      let title = "";
      if (hasMeaningfulTodayPnl) {
        title = `Portfolio: ${todayPnlSign}\u20B9${Math.abs(todayPnl).toFixed(0)} Today ${pnlEmoji}`;
      } else if (user.holdings && user.holdings.length > 0) {
        title = `Portfolio: \u20B9${Math.round(netWorth).toLocaleString('en-IN')} Net Worth \u2022 Steady Today`;
      } else {
        title = `Market Closed ${EMOJI.chart} \u2014 See Today's Movers`;
      }

      const prompt = `You are a sharp, Gen-Z financial advisor for Moolzen, a virtual stock trading app. Indian stock market just closed for the day.

User: ${user.name || "Trader"}
Net Worth: \u20B9${netWorth.toFixed(0)}
Today's Gain/Loss: \u20B9${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(0)}
Overall Unrealized Return: \u20B9${totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(0)}
Holdings: ${portfolioContext}
Today's Headlines: ${marketNews}

Write a push notification body (2 sentences, max 30 words total).
Sentence 1: Accurately comment on this user's portfolio movement today. If today's gain/loss is 0 or negligible, mention that their portfolio held steady today. Never claim they made profit today if Today's Gain/Loss is 0.
Sentence 2: Give ONE reason WHY the market moved today based on the news.
Use 1-2 emojis. Conversational tone. No hashtags.`;

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
        const result = await model.generateContent(prompt);
        const body = result.response.text().trim();
        log(`AI for ${user.email}: ${body}`);

        await messaging.send({
          token: user.fcmToken,
          notification: { title, body },
          android: { notification: { sound: "default", priority: "high" } },
          data: { route: "/portfolio" },
        });

        // Save notification to DB for in-app history
        await prisma.notification.create({
          data: { userId: user.id, title, body, route: "/portfolio" },
        });

        // Mark notified today
        await prisma.user.update({
          where: { id: user.id },
          data: { lastNotifiedAt: new Date() },
        });

        log(`Sent to ${user.email}`);
      } catch (err) {
        log(`Error for ${user.email}: ${err.message}`);
      }

      // Add a 12-second delay between users to respect the Gemini API free-tier rate limit (5 RPM)
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }

    log(`Done. Processed ${users.length} users.`);
    return { success: true, logs };
  } catch (error) {
    log(`CRITICAL: ${error.message}`);
    return { success: false, logs, error: error.message };
  }
};
