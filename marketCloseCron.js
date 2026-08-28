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
  console.log("Running Post-Market AI Push Notifications...");
  if (!messaging) return;

  try {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      include: { holdings: { include: { stock: true } } }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Fetch market context once for all users to save API calls
    const marketNewsContext = await fetchTodayMarketNews();

    for (const user of users) {
      const isActiveToday = user.lastLogin >= today;

      if (!isActiveToday) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: {
              title: "Market is Closed! ??",
              body: "Come back to see today`s biggest movers and claim your daily XP."
            },
            data: { route: "/portfolio" }
          });
        } catch (err) { }
        continue;
      }

      let portfolioContext = "";
      let totalValue = user.cashBalance;
      
      if (user.holdings.length === 0) {
        portfolioContext = "No active investments. 100% cash.";
      } else {
        const holdingStrs = user.holdings.map(h => {
          const currentVal = h.quantity * h.stock.price;
          const profit = currentVal - (h.quantity * h.avgPrice);
          totalValue += currentVal;
          return `${h.stock.symbol}: ?${currentVal.toFixed(0)} (Profit: ?${profit.toFixed(0)})`;
        });
        portfolioContext = holdingStrs.join("; ");
      }

      const prompt = `You are a financial advisor for a Gen-Z virtual trading app. The Indian stock market just closed.
User: ${user.name}
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

        await messaging.send({
          token: user.fcmToken,
          notification: {
            title: "Your Daily Market Analysis ??",
            body: aiMessage
          },
          data: { route: "/portfolio" }
        });
      } catch (err) { }
    }
    console.log(`Sent post-market notifications to ${users.length} users.`);
  } catch (error) { }
};

