import { PrismaClient } from "@prisma/client";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { b64Key } from "./encodedKey.js";

const prisma = new PrismaClient();

const serviceAccount = JSON.parse(Buffer.from(b64Key, "base64").toString("utf-8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const messaging = getMessaging(app);

const TITLE = "Good Night! \uD83C\uDF19 Market Opens Monday";
const BODY = "Rest up \u2014 Sensex & Nifty open Monday 9:15 AM. Your portfolio is ready. Will you be? \uD83D\uDE80";

async function sendBlast() {
  const users = await prisma.user.findMany({ where: { fcmToken: { not: null } } });
  console.log(`Sending to ${users.length} users...`);
  let sent = 0, failed = 0;
  for (const user of users) {
    try {
      await messaging.send({
        token: user.fcmToken,
        notification: { title: TITLE, body: BODY },
        android: { notification: { sound: "default", priority: "high" } },
        data: { route: "/portfolio" },
      });
      // Save to notification history
      await prisma.notification.create({
        data: { userId: user.id, title: TITLE, body: BODY, route: "/portfolio" },
      });
      console.log(`✅ Sent to ${user.email}`);
      sent++;
    } catch (err) {
      console.log(`❌ Failed for ${user.email}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
  await prisma.$disconnect();
  process.exit(0);
}

sendBlast().catch(console.error);
