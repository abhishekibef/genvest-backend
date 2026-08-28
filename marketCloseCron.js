import { PrismaClient } from "@prisma/client";
import { messaging } from "./firebaseAdmin.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { b64Gemini } from "./geminiConfig.js";

const prisma = new PrismaClient();
const fallbackKey = Buffer.from(b64Gemini, "base64").toString("utf-8");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || fallbackKey);

const NEWS_RSS_FEEDS = [
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  "https://www.moneycontrol.com/rss/latestnews.xml"
];

async function fetchTodayMarketNews() {
  try {
    const res = await fetch(NEWS_RSS_FEEDS[0], { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const clean = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content) => content.trim());
    
    let newsSnippets = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(.*?)<\/title>/;
    
    let match;
    while ((match = itemRegex.exec(clean)) !== null && newsSnippets.length < 5) {
      const titleMatch = titleRegex.exec(match[1]);
      if (titleMatch && titleMatch[1]) {
        newsSnippets.push(titleMatch[1].replace(/<[^>]*>/g, "").trim());
      }
    }
    return newsSnippets.join(". ");
  } catch (e) {
    console.error("Failed to fetch market news", e);
    return "Market closed with mixed global cues.";
  }
}

export const runMarketClosePushNotifications = async () => {
  let debugLogs = [];
  const log = (msg) => { console.log(msg); debugLogs.push(msg); };
  
  log("Running Post-Market AI Push Notifications...");
  if (!messaging) { log("Firebase messaging is null"); return { success: false, logs: debugLogs }; }

  try {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      include: { holdings: { include: { stock: true } } }
    });
    
    log(`Found ${users.length} users with tokens.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const marketNewsContext = await fetchTodayMarketNews();
    log(`Fetched news: ${marketNewsContext.substring(0, 50)}...`);

    for (const user of users) {
      const isActiveToday = user.lastActive >= today;
      log(`User ${user.email} active today: ${isActiveToday}`);

      if (!isActiveToday) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: {
              title: "Market is Closed! 📉",
              body: "Come back to see today's biggest movers and claim your daily XP."
            },
            data: { route: "/portfolio" }
          });
          log(`Sent inactive push to ${user.email}`);
        } catch (err) { log(`Error sending inactive push to ${user.email}: ${err.message}`); }
        continue;
      }

      let portfolioContext = "";
      let totalValue = user.cash || 0;
      
      if (!user.holdings || user.holdings.length === 0) {
        portfolioContext = "No active investments. 100% cash.";
      } else {
        const holdingStrs = user.holdings.map(h => {
          const currentVal = h.quantity * h.stock.price;
          const profit = currentVal - (h.quantity * h.avgPrice);
          totalValue += currentVal;
          return `${h.stock.symbol}: ₹${currentVal.toFixed(0)} (Profit: ₹${profit.toFixed(0)})`;
        });
        portfolioContext = holdingStrs.join("; ");
      }

      const prompt = `You are a financial advisor for a Gen-Z virtual trading app. The Indian stock market just closed.
User: ${user.name || 'Trader'}
Total Net Worth: ₹${totalValue.toFixed(0)}
Holdings: ${portfolioContext}
Today Market News: ${marketNewsContext}

Write a very short, exciting 2-sentence push notification. 
Sentence 1: Analyze how their specific portfolio did.
Sentence 2: Explain WHY the overall market went up or down today based on the news.
Use emojis. No hashtags. Keep it under 25 words if possible.`;

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const aiMessage = result.response.text().trim();
        log(`Generated AI Message for ${user.email}: ${aiMessage}`);

        await messaging.send({
          token: user.fcmToken,
          notification: {
            title: "Your Daily Market Analysis 🤖",
            body: aiMessage
          },
          data: { route: "/portfolio" }
        });
        log(`Sent AI push to ${user.email}`);
      } catch (err) { log(`Error sending AI push to ${user.email}: ${err.message}`); }
    }
    log(`Sent post-market notifications to ${users.length} users.`);
    return { success: true, logs: debugLogs };
  } catch (error) { 
    log(`CRITICAL ERROR: ${error.message}`);
    return { success: false, logs: debugLogs, error: error.message };
  }
};

