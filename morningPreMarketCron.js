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

// Helper delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Send FCM with 1 automatic retry on temporary network failure
async function sendFCMWithRetry(fcmToken, title, body, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await messaging.send({
        token: fcmToken,
        notification: { title, body },
        android: { notification: { sound: "default", priority: "high" } },
        data: { route: "/trade" },
      });
      return { success: true };
    } catch (err) {
      if (attempt < maxRetries) {
        // Wait 2 seconds before retry
        await sleep(2000);
      } else {
        return { success: false, error: err.message };
      }
    }
  }
}

export const runMorningPreMarketPushNotifications = async (forceSend = false) => {
  let logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  log("🌅 Starting Morning Market Push Broadcast (with Rate-Limiting & Batching)...");

  try {
    const users = await prisma.user.findMany({
      include: { holdings: { include: { stock: true } } },
    });
    log(`Found ${users.length} total users in database.`);

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

    // Batch Configuration: Process in chunks of 20 with small pacing delays to prevent throttling
    const BATCH_SIZE = 20;
    const BATCH_PAUSE_MS = 1500; // 1.5 seconds pause between batches
    const USER_DELAY_MS = 50;     // 50ms delay between individual notifications

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} users)...`);

      for (const user of batch) {
        try {
          if (!forceSend) {
            // Avoid duplicate notifications today
            const existingNotif = await prisma.notification.findFirst({
              where: {
                userId: user.id,
                title,
                createdAt: { gte: today },
              },
            });

            if (existingNotif) {
              log(`Skipping ${user.email} — already received today.`);
              continue;
            }
          }

          const body = globalBrief;

          // 1. Send native mobile push if FCM token exists with retry
          if (messaging && user.fcmToken) {
            const pushRes = await sendFCMWithRetry(user.fcmToken, title, body);
            if (pushRes.success) {
              sentPushCount++;
              log(`📲 Push notification delivered to ${user.email}`);
            } else {
              log(`FCM send skipped for ${user.email}: ${pushRes.error}`);
            }
          }

          // 2. Save in-app notification in DB
          await prisma.notification.create({
            data: {
              userId: user.id,
              title,
              body,
              route: "/trade",
            },
          });
          createdInAppCount++;

          // Small inter-user delay
          await sleep(USER_DELAY_MS);
        } catch (userErr) {
          log(`Error processing user ${user.email}: ${userErr.message}`);
        }
      }

      // If more batches remain, pause a few seconds to respect network rate limits
      if (i + BATCH_SIZE < users.length) {
        log(`⏳ Pausing ${BATCH_PAUSE_MS / 1000}s before next batch to prevent network throttling...`);
        await sleep(BATCH_PAUSE_MS);
      }
    }

    log(`✅ Broadcast complete: ${sentPushCount} mobile push alerts delivered, ${createdInAppCount} in-app notifications created.`);
    return { success: true, logs, totalUsers: users.length, sentPushCount, createdInAppCount };
  } catch (error) {
    log(`❌ CRITICAL Morning Push Error: ${error.message}`);
    return { success: false, logs, error: error.message };
  }
};
