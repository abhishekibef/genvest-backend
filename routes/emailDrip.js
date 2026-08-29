import express from "express";
import { DRIP_LESSONS } from "../emailDripTemplates.js";
import { getResendApiKey, setResendApiKey } from "../resendConfig.js";
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

  // Save Resend API Key: POST /api/email-drip/save-key
  router.post("/save-key", (req, res) => {
    const { apiKey } = req.body;
    if (setResendApiKey(apiKey)) {
      res.json({ success: true, message: "API Key saved successfully!" });
    } else {
      res.status(400).json({ error: "Invalid Resend API Key format (must start with re_)" });
    }
  });

  // 1. Interactive Dashboard: /api/email-drip/dashboard
  router.get("/dashboard", async (req, res) => {
    try {
      const userCount = await prisma.user.count({ where: { email: { not: "" } } });
      const currentCampaign = getCurrentCampaign();
      const currentKey = getResendApiKey();
      const isKeyConfigured = Boolean(currentKey && currentKey.startsWith("re_"));

      const lessonsHtml = DRIP_LESSONS.map(l => `
        <div style="background:#151922; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="background:rgba(37,99,235,0.2); color:#60a5fa; font-weight:800; font-size:11px; padding:3px 8px; border-radius:999px;">${l.badge}</span>
              <span style="color:#94a3b8; font-size:12px;">Scheduled Day ${l.day}</span>
            </div>
            <h3 style="margin:0 0 4px; font-size:16px; color:#ffffff;">${l.subject}</h3>
            <p style="margin:0; font-size:13px; color:#94a3b8;">${l.summary}</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="sendPreview(${l.id})" style="background:#2563eb; color:#ffffff; font-weight:700; font-size:13px; padding:10px 18px; border-radius:10px; border:none; cursor:pointer;">
              📩 Send Preview to My Email
            </button>
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
    .container { max-width: 760px; width: 100%; }
    .header { margin-bottom: 24px; }
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
      background: #151922;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .key-box {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    input {
      flex: 1;
      background: #0b0e14;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      color: #ffffff;
      padding: 10px 14px;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: #2563eb; }
    button.save-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 700;
      cursor: pointer;
    }
    #msg-box {
      margin-top: 10px;
      font-size: 13px;
      display: none;
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

    <!-- API Key Configuration -->
    <div class="status-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span style="font-size:13px; font-weight:700; color:#e2e8f0; text-transform:uppercase; letter-spacing:0.04em;">
          🔑 Resend API Key Status: ${isKeyConfigured ? '<span style="color:#4ade80;">Active (Configured) ✅</span>' : '<span style="color:#f87171;">Not Saved ⚠️</span>'}
        </span>
        <span style="font-size:12px; color:#94a3b8;">Owner: <b>abhishekibef@gmail.com</b></span>
      </div>
      
      <div class="key-box">
        <input type="password" id="apiKeyInput" placeholder="re_123456789... (Paste your Resend API Key here)" value="${isKeyConfigured ? currentKey : ''}" />
        <button class="save-btn" onclick="saveApiKey()">Save Key</button>
      </div>
      <div id="msg-box"></div>
    </div>

    <h2 style="font-size:18px; font-weight:800; margin-bottom:16px;">The 6 App Feature Lessons</h2>
    ${lessonsHtml}
  </div>

  <script>
    async function saveApiKey() {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      const msgBox = document.getElementById('msg-box');
      if (!apiKey) {
        alert('Please enter your Resend API Key (starts with re_)');
        return;
      }
      try {
        const res = await fetch('/api/email-drip/save-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
        const data = await res.json();
        if (data.success) {
          msgBox.style.color = '#4ade80';
          msgBox.innerText = '✅ Resend API Key saved! You can now send previews and broadcasts.';
          msgBox.style.display = 'block';
          localStorage.setItem('moolzen_resend_key', apiKey);
        } else {
          msgBox.style.color = '#f87171';
          msgBox.innerText = '❌ ' + (data.error || 'Failed to save');
          msgBox.style.display = 'block';
        }
      } catch (err) {
        msgBox.style.color = '#f87171';
        msgBox.innerText = '❌ Error: ' + err.message;
        msgBox.style.display = 'block';
      }
    }

    // Auto-restore saved key from local storage if available
    window.addEventListener('DOMContentLoaded', () => {
      const saved = localStorage.getItem('moolzen_resend_key');
      const input = document.getElementById('apiKeyInput');
      if (saved && !input.value) {
        input.value = saved;
        saveApiKey();
      }
    });

    async function sendPreview(lessonId) {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      if (apiKey) {
        await fetch('/api/email-drip/save-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
      }
      window.location.href = '/api/email-drip/preview/' + lessonId + (apiKey ? '?apiKey=' + encodeURIComponent(apiKey) : '');
    }
  </script>
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
    if (req.query.apiKey) {
      setResendApiKey(req.query.apiKey);
    }
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
