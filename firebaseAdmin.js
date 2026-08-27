import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { b64Key } from "./encodedKey.js";

let messaging = null;

try {
  const serviceAccount = JSON.parse(Buffer.from(b64Key, "base64").toString("utf-8"));
  const app = initializeApp({
    credential: cert(serviceAccount)
  });
  messaging = getMessaging(app);
  console.log("Firebase Admin Initialized Successfully");
} catch (error) {
  console.error("Firebase Admin Initialization Error:", error);
}

export { messaging };

