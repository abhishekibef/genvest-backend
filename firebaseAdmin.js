import admin from "firebase-admin";
import { b64Key } from "./encodedKey.js";

let initialized = false;

try {
  const serviceAccount = JSON.parse(Buffer.from(b64Key, "base64").toString("utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  initialized = true;
  console.log("Firebase Admin Initialized Successfully");
} catch (error) {
  console.error("Firebase Admin Initialization Error:", error);
}

export const messaging = initialized ? admin.messaging() : null;

