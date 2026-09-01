import { PrismaClient } from "@prisma/client";
import { messaging } from "./firebaseAdmin.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { b64Gemini } from "./geminiConfig.js";

const prisma = new PrismaClient();
const fallbackKey = Buffer.from(b64Gemini, "base64").toString("utf-8");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || fallbackKey);

const NEWS_RSS_FEEDS = [
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  "https://www.moneycontrol.com/rss/marketreports.xml",
  "https://www.business-standard.com/rss/markets-106.rss",
];

async function fetchMorningMarketNews() {
  for (const url of NEWS_RSS_FEEDS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const text = await res.text();
      const clean = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim());
      let snippets = [];
      const itemRx = /<item>([\s\S]*?)<\/item>/g;
      const titleRx = /<title>(.*?)<\/title>/;
      let m;
      while ((m = itemRx.exec(clean)) !== null && snippets.length < 5) {
        const t = titleRx.exec(m[1]);
        if (t && t[1]) {
          const title = t[1].replace(/<[^>]*>/g, "").trim();
          if (title.length > 10) snippets.push(title);
        }
      }
      if (snippets.length > 0) return snippets.join(". ");
    } catch (e) {
      console.error(`Pre-market news fetch failed for ${url}:`, e.message);
    }
  }
  return "GIFT Nifty and Asian markets indicate an active trading day ahead.";
}

export const runMorningPreMarketPushNotifications = async () => {
  let logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  log("🌅 [8:50 AM IST] Starting Morning Pre-Market Push Notifications...");

  try {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      include: { holdings: { include: { stock: true } } },
    });
    log(`Found ${users.length} users with active FCM device tokens.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const marketNews = await fetchMorningMarketNews();
    log(`Morning Market Cues: ${marketNews.substring(0, 90)}...`);

    // Generate a punchy AI Morning Trading Brief
    let globalBrief = "Markets open in 25 mins! Check today's key levels for NIFTY 50 & top stocks before the opening bell ⚡";
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
      const prompt = `You are a sharp, energetic Gen-Z market coach for Moolzen (a stock market learning & virtual trading app).
The Indian stock market opens in 25 minutes (at 9:15 AM IST).
Morning News Headlines: ${marketNews}

Write a morning pre-market push notification body (1-2 crisp sentences, max 25 words total).
Energize the user to check the opening setup and place virtual trades.
Use 1-2 trading emojis (📈, ⚡, 🚀, 🔔). No hashtags.`;

      const result = await model.generateContent(prompt);
      const generated = result.response.text().trim();
      if (generated && generated.length > 10) {
        globalBrief = generated;
      }
      log(`AI Generated Morning Brief: ${globalBrief}`);
    } catch (err) {
      log(`AI brief generation fallback: ${err.message}`);
    }

    const title = "🔔 Market Opens in 25 Mins! 📈";

    for (const user of users) {
      // Avoid duplicate morning notifications today
      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          title,
          createdAt: { gte: today },
        },
      });

      if (existingNotif) {
        log(`Skipping ${user.email} — morning push already sent today.`);
        continue;
      }

      const body = globalBrief;

      if (messaging && user.fcmToken) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: { title, body },
            android: { notification: { sound: "default", priority: "high" } },
            data: { route: "/trade" },
          });
          log(`📲 Push notification delivered to ${user.email}`);
        } catch (fcmErr) {
          log(`FCM send failed for ${user.email}: ${fcmErr.message}`);
        }
      }

      // Save notification to DB for in-app bell badge & notifications page
      await prisma.notification.create({
        data: {
          userId: user.id,
          title,
          body,
          route: "/trade",
        },
      });

      log(`💾 Saved in-app morning notification for ${user.email}`);
    }

    log(`✅ [8:50 AM IST] Morning Pre-Market notifications completed for ${users.length} users.`);
    return { success: true, logs, totalUsers: users.length };
  } catch (error) {
    log(`❌ CRITICAL Morning Push Error: ${error.message}`);
    return { success: false, logs, error: error.message };
  }
};
