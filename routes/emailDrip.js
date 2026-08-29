import express from "express";
import { DRIP_LESSONS } from "../emailDripTemplates.js";
import {
  generateApprovalToken,
  verifyApprovalToken,
  sendPreviewToOwner,
  executeDripBroadcast,
  getCurrentCampaign,
  setCampaignStatus
} from "../emailDripCron.js";

export function getEmailDripRouter(prisma) {
  const router = express.Router();

  // 1. Interactive Dashboard: /api/email-drip/dashboard
  router.get("/dashboard", async (req, res) => {
    try {
      const userCount = await prisma.user.count({ where: { email: { not: "" } } });
      const currentCampaign = getCurrentCampaign();

      const lessonsHtml = DRIP_LESSONS.map(l => `
        <div style="background:#151922; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="background:rgba(37,99,235,0.2); color:#60a5fa; font-weight:800; font-size:11px; padding:3px 8px; border-radius:999px;">${l.badge}</span>
              <span style="color:#94a3b8; font-size:12px;">Scheduled Day ${l.day}</span>
            </div>
            <h3 style="margin:0 0 4px; font-size:16px; color:#ffffff;">${l.subject}</h3>
            <p style="margin:0; font-size:13px; color:#94a3b8;">${l.summary}</p>
          </div>
          <div style="display:flex; gap:8px;">
            <a href="/api/email-drip/preview/${l.id}" style="background:#2563eb; color:#ffffff; font-weight:700; font-size:13px; padding:10px 18px; border-radius:10px; text-decoration:none;">
              📩 Send Preview to My Email
            </a>
          </div>
        </div>
      `).join("");

      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moolzen Automated Email Drip Control Center</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background: #0b0e14;
      color: #ffffff;
      min-height: 100vh;
      padding: 32px 20px;
      display: flex;
      justify-content: center;
    }
    .container {
      max-width: 760px;
      width: 100%;
    }
    .header {
      margin-bottom: 28px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(37, 99, 235, 0.15);
      border: 1px solid rgba(37, 99, 235, 0.3);
      color: #60a5fa;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 8px; }
    p.subtitle { color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.5; }
    .status-card {
      background: rgba(37,99,235,0.08);
      border: 1px solid rgba(37,99,235,0.3);
      border-radius: 16px;
      padding: 18px 20px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">
        <span class="pulse-dot"></span>
        <span>Auto-Drip Active • ${userCount} Registered Users</span>
      </div>
      <h1>Moolzen Educational Email Sequence</h1>
      <p class="subtitle">
        Emails are scheduled every 2 days. The server will <b>always send a preview email to you first</b>. No email is sent to users until you click <b>Approve</b> inside your email.
      </p>
    </div>

    <div class="status-card">
      <div>
        <div style="font-size:12px; font-weight:700; color:#60a5fa; text-transform:uppercase;">Owner Approval Email</div>
        <div style="font-size:15px; font-weight:700; color:#ffffff; margin-top:2px;">abhishekibef@gmail.com</div>
      </div>
      <a href="/api/email-drip/preview/1" style="background:#22c55e; color:#0b0e14; font-weight:800; font-size:13px; padding:10px 20px; border-radius:10px; text-decoration:none;">
        ▶ Trigger Next Preview Now
      </a>
    </div>

    <h2 style="font-size:18px; font-weight:800; margin-bottom:16px;">The 6 App Feature Lessons</h2>
    ${lessonsHtml}
  </div>
</body>
</html>
      `);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Trigger Preview on Demand: /api/email-drip/preview/:id?
  router.get("/preview/:id?", async (req, res) => {
    const lessonId = req.params.id || 1;
    try {
      const result = await sendPreviewToOwner(lessonId, prisma);
      if (result.success) {
        res.send(`
          <div style="font-family:-apple-system, sans-serif; background:#0b0e14; color:#ffffff; padding:40px 20px; text-align:center; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="font-size:48px; margin-bottom:16px;">📩</div>
            <h1 style="font-size:24px; font-weight:800; margin-bottom:8px;">Preview Email Sent!</h1>
            <p style="color:#94a3b8; font-size:15px; max-width:440px; margin-bottom:24px; line-height:1.5;">
              We sent a preview of <b>Lesson ${result.lesson.id}: ${result.lesson.tag}</b> to <b>abhishekibef@gmail.com</b>.<br><br>
              Check your inbox, review the design, and tap <b>Approve</b> inside the email to broadcast to users!
            </p>
            <a href="/api/email-drip/dashboard" style="background:#2563eb; color:#ffffff; padding:12px 24px; border-radius:12px; font-weight:700; text-decoration:none;">
              Return to Control Center ➔
            </a>
          </div>
        `);
      } else {
        res.status(500).send(`
          <div style="font-family:sans-serif; background:#0b0e14; color:#ffffff; padding:40px; text-align:center;">
            <h2 style="color:#ef4444;">Failed to send preview</h2>
            <p style="color:#94a3b8;">${result.error}</p>
            <a href="/api/email-drip/dashboard" style="color:#60a5fa;">Back to Dashboard</a>
          </div>
        `);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. 1-Click Approval: /api/email-drip/approve?token=...&id=...
  router.get("/approve", async (req, res) => {
    const { token, id } = req.query;
    const lessonId = Number(id) || 1;

    if (!token || !verifyApprovalToken(lessonId, token)) {
      return res.status(403).send(`
        <div style="font-family:sans-serif; background:#0b0e14; color:#ffffff; padding:60px 20px; text-align:center; min-height:100vh;">
          <h2 style="color:#ef4444; font-size:24px;">❌ Invalid or Expired Token</h2>
          <p style="color:#94a3b8; margin-top:8px;">This approval link is invalid or has already been used.</p>
          <a href="/api/email-drip/dashboard" style="color:#60a5fa; margin-top:16px; display:inline-block;">Go to Control Center</a>
        </div>
      `);
    }

    try {
      const result = await executeDripBroadcast(lessonId, prisma);
      res.send(`
        <div style="font-family:-apple-system, sans-serif; background:#0b0e14; color:#ffffff; padding:40px 20px; text-align:center; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <div style="font-size:56px; margin-bottom:16px;">🎉</div>
          <h1 style="font-size:26px; font-weight:800; margin-bottom:8px; color:#4ade80;">Campaign Approved & Delivered!</h1>
          <p style="color:#cbd5e1; font-size:16px; max-width:500px; margin-bottom:12px; line-height:1.6;">
            <b>${result.lesson.tag}</b> (${result.lesson.subject}) has been successfully broadcasted to your users!
          </p>
          <div style="background:#151922; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px 24px; margin-bottom:24px; font-size:14px; color:#94a3b8;">
            ✅ Successfully delivered: <b style="color:#ffffff;">${result.sent} users</b> ${result.failed > 0 ? `(${result.failed} failed)` : ""}
          </div>
          <a href="/api/email-drip/dashboard" style="background:#2563eb; color:#ffffff; padding:12px 24px; border-radius:12px; font-weight:700; text-decoration:none;">
            View Next Scheduled Lesson ➔
          </a>
        </div>
      `);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. 1-Click Reject / Skip: /api/email-drip/reject?token=...&id=...
  router.get("/reject", async (req, res) => {
    const { token, id } = req.query;
    const lessonId = Number(id) || 1;

    if (!token || !verifyApprovalToken(lessonId, token)) {
      return res.status(403).send("Invalid or expired token.");
    }

    setCampaignStatus("rejected");

    res.send(`
      <div style="font-family:-apple-system, sans-serif; background:#0b0e14; color:#ffffff; padding:40px 20px; text-align:center; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="font-size:48px; margin-bottom:16px;">🛑</div>
        <h1 style="font-size:24px; font-weight:800; margin-bottom:8px;">Broadcast Skipped</h1>
        <p style="color:#94a3b8; font-size:15px; max-width:440px; margin-bottom:24px;">
          This lesson was cancelled. No emails have been sent to your users.
        </p>
        <a href="/api/email-drip/dashboard" style="background:#2563eb; color:#ffffff; padding:12px 24px; border-radius:12px; font-weight:700; text-decoration:none;">
          Return to Dashboard
        </a>
      </div>
    `);
  });

  return router;
}
