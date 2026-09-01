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

export const runMorningPreMarketPushNotifications = async (forceSend = false) => {
  let logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  log("🌅 Starting Morning Market Push & In-App Notification Broadcast...");

  try {
    // Find all registered users so in-app bell notification is delivered to everyone
    const users = await prisma.user.findMany({
      include: { holdings: { include: { stock: true } } },
    });
    log(`Found ${users.length} total users in Moolzen database.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const marketNews = await fetchMorningMarketNews();
    log(`Morning Market Cues: ${marketNews.substring(0, 90)}...`);

    // Generate a punchy AI Morning Trading Brief
    let globalBrief = "Markets are buzzing! Check today's key levels for NIFTY 50 & top momentum stocks. Place your virtual trades now ⚡";
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
      const prompt = `You are a sharp, energetic Gen-Z market coach for Moolzen (a stock market learning & virtual trading app).
Today's Indian Market News Headlines: ${marketNews}

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

    const title = "🔔 Market Alert: Today's Trading Setup 📈";
    let sentPushCount = 0;
    let createdInAppCount = 0;

    for (const user of users) {
      if (!forceSend) {
        // Avoid duplicate morning notifications today
        const existingNotif = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            title,
            createdAt: { gte: today },
          },
        });

        if (existingNotif) {
          log(`Skipping ${user.email} — already received morning notification today.`);
          continue;
        }
      }

      const body = globalBrief;

      // 1. Send native mobile push if FCM token exists
      if (messaging && user.fcmToken) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: { title, body },
            android: { notification: { sound: "default", priority: "high" } },
            data: { route: "/trade" },
          });
          sentPushCount++;
          log(`📲 Push notification delivered to ${user.email}`);
        } catch (fcmErr) {
          log(`FCM send skipped for ${user.email}: ${fcmErr.message}`);
        }
      }

      // 2. Save notification to DB for in-app bell badge & notification inbox
      await prisma.notification.create({
        data: {
          userId: user.id,
          title,
          body,
          route: "/trade",
        },
      });
      createdInAppCount++;
    }

    log(`✅ Broadcast complete: ${sentPushCount} mobile push alerts delivered, ${createdInAppCount} in-app notifications created.`);
    return { success: true, logs, totalUsers: users.length, sentPushCount, createdInAppCount };
  } catch (error) {
    log(`❌ CRITICAL Morning Push Error: ${error.message}`);
    return { success: false, logs, error: error.message };
  }
};
