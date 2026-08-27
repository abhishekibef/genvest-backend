import { PrismaClient } from "@prisma/client";
import { messaging } from "./firebaseAdmin.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const runMarketClosePushNotifications = async () => {
  console.log("Running Post-Market AI Push Notifications...");
  if (!messaging) {
    console.warn("Firebase Messaging not initialized. Skipping push notifications.");
    return;
  }
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn("No Gemini API key found. Skipping AI analysis.");
    return;
  }

  try {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      include: { holdings: { include: { stock: true } } }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const user of users) {
      // Check if active today (lastLogin >= today)
      const isActiveToday = user.lastLogin >= today;

      if (!isActiveToday) {
        // Send Inactive re-engagement notification
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: {
              title: "Market is Closed! ??",
              body: "Come back to see today`s biggest movers and claim your daily XP."
            },
            data: { route: "/portfolio" }
          });
        } catch (err) {
          console.error("Failed to send inactive push to", user.email, err);
        }
        continue;
      }

      // If Active, send AI Portfolio Analysis
      let portfolioContext = "";
      let totalValue = user.cashBalance;
      
      if (user.holdings.length === 0) {
        portfolioContext = "No active investments. 100% cash.";
      } else {
        const holdingStrs = user.holdings.map(h => {
          const currentVal = h.quantity * h.stock.price;
          const invested = h.quantity * h.avgPrice;
          const profit = currentVal - invested;
          totalValue += currentVal;
          return `${h.stock.symbol}: ${h.quantity} shares, Current Val: ?${currentVal.toFixed(0)}, Profit: ?${profit.toFixed(0)}`;
        });
        portfolioContext = holdingStrs.join("; ");
      }

      const prompt = `You are a financial advisor for a virtual trading app. The market just closed.
User: ${user.name}
Total Net Worth: ?${totalValue.toFixed(0)}
Holdings: ${portfolioContext}

Write a very short, exciting 1-2 sentence push notification summarizing their portfolio performance today. Use emojis. Do not use hashtags. Be direct.`;

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const aiMessage = result.response.text().trim();

        await messaging.send({
          token: user.fcmToken,
          notification: {
            title: "Your Post-Market AI Analysis ??",
            body: aiMessage
          },
          data: { route: "/portfolio" }
        });
      } catch (err) {
        console.error("AI or Push Error for", user.email, err);
      }
    }
    
    console.log(`Sent post-market notifications to ${users.length} users.`);
  } catch (error) {
    console.error("Error in runMarketClosePushNotifications:", error);
  }
};

