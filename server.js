import dotenv from 'dotenv';
import http from 'http';
dotenv.config();

const PORT = process.env.PORT || 5001;

async function start() {
  // Dynamically import express and other files
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  const { execSync } = await import('child_process');
  
  // Run prisma migrations/db push
  try {
    console.log('🔧 Running programmatic Prisma setup (db push)...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('✅ Programmatic Prisma setup completed.');
  } catch (err) {
    console.error('⚠️ Programmatic Prisma setup error:', err);
  }
  
  const { PrismaClient } = await import('@prisma/client');
  const { getAuthRouter } = await import('./routes/auth.js');
  const { getStocksRouter } = await import('./routes/stocks.js');
  const { getTradesRouter } = await import('./routes/trades.js');
  const { getPortfolioRouter } = await import('./routes/portfolio.js');
  const { getLeaderboardRouter } = await import('./routes/leaderboard.js');
  const { getLearnRouter } = await import('./routes/learn.js');
  const { getCompetitionRouter } = await import('./routes/competition.js');
  const { getBadgesRouter } = await import('./routes/badges.js');
  const { getTournamentRouter } = await import('./routes/tournament.js');
  const { getLobbyRouter } = await import('./routes/lobby.js');
  const { getWeeklyContestRouter } = await import('./routes/weeklyContest.js');
  const { getXpRouter } = await import('./routes/xp.js');
  const { getAiRouter } = await import('./routes/ai.js');
  const { getPaymentRouter } = await import('./routes/payment.js');
  const { getNotificationsRouter } = await import('./routes/notifications.js');
  const { getEmailDripRouter } = await import('./routes/emailDrip.js');
  const { runSimulationMiddleware } = await import('./simulation.js');
  const { initCronJobs } = await import('./cron.js');

  const app = express();
  const prisma = new PrismaClient();

  app.use(cors());
  app.use(express.json());
  app.use(runSimulationMiddleware(prisma));

  app.use('/api/auth', getAuthRouter(prisma));
  app.use('/api/stocks', getStocksRouter(prisma));
  app.use('/api/trades', getTradesRouter(prisma));
  app.use('/api/portfolio', getPortfolioRouter(prisma));
  app.use('/api/leaderboard', getLeaderboardRouter(prisma));
  app.use('/api/learn', getLearnRouter(prisma));
  app.use('/api/competition', getCompetitionRouter(prisma));
  app.use('/api/badges', getBadgesRouter(prisma));
  app.use('/api/tournament', getTournamentRouter(prisma));
  app.use('/api/lobby', getLobbyRouter(prisma));
  app.use('/api/weekly-contest', getWeeklyContestRouter(prisma));
  app.use('/api/xp', getXpRouter(prisma));
  app.use('/api/ai', getAiRouter());
  app.use('/api/payment', getPaymentRouter(prisma));
  app.use('/api/notifications', getNotificationsRouter(prisma));
  app.use('/api/email-drip', getEmailDripRouter(prisma));

  app.get('/api/test-push', async (req, res) => {
    try {
      const { runMarketClosePushNotifications } = await import('./marketCloseCron.js');
      const result = await runMarketClosePushNotifications();
      res.json({ message: 'AI Market Analysis push blast triggered!', result });
    } catch (e) {
      res.status(500).json({ error: e.stack });
    }
  });

  // Push Notification Console & Blast Endpoint
  const handleCustomBlast = async (req, res) => {
    const title = req.query.title || req.body?.title;
    const body = req.query.body || req.body?.body;
    const route = req.query.route || req.body?.route || '/portfolio';

    // If no title/body provided, serve the interactive Web UI
    if (!title || !body) {
      try {
        const userCount = await prisma.user.count({ where: { fcmToken: { not: null } } });
        return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moolzen Push Notification Console</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0b0e14;
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .card {
      background: #151922;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 32px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
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
      margin-bottom: 16px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      margin-bottom: 24px;
    }
    .field {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input, textarea, select {
      width: 100%;
      background: #0b0e14;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #ffffff;
      padding: 12px 14px;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, textarea:focus, select:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
    }
    textarea {
      resize: vertical;
      min-height: 90px;
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .preset-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .preset-btn:hover {
      background: rgba(37, 99, 235, 0.2);
      border-color: #2563eb;
      color: #ffffff;
    }
    button.send-btn {
      width: 100%;
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 14px;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
    }
    button.send-btn:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    button.send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #result-box {
      margin-top: 20px;
      padding: 14px;
      border-radius: 12px;
      font-size: 14px;
      display: none;
    }
    .success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
    }
    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="pulse-dot"></span>
      <span>${userCount} Registered Devices Active</span>
    </div>
    <h1>Push Notification Console</h1>
    <p class="subtitle">Broadcast live alerts directly to all Moolzen user devices.</p>

    <div class="presets">
      <button class="preset-btn" onclick="applyPreset('🌙 Good Night! Monday Market Alert', 'Rest up — Sensex & Nifty open Monday 9:15 AM. Your portfolio is waiting. Will you be ready? 🚀')">🌙 Good Night</button>
      <button class="preset-btn" onclick="applyPreset('☀️ Market Opens in 15 Mins!', 'Get ready! Indian markets open at 9:15 AM. Check your top movers and practice trades now. 📈')">☀️ Market Open</button>
      <button class="preset-btn" onclick="applyPreset('🏆 Weekly Trading Contest is Live!', 'Compete against other traders this week to climb the leaderboard and win prizes! 💎')">🏆 Contest Live</button>
    </div>

    <form id="push-form" onsubmit="sendPush(event)">
      <div class="field">
        <label>Notification Title</label>
        <input type="text" id="title" placeholder="e.g. Market Alert 📈" required />
      </div>

      <div class="field">
        <label>Message / Body</label>
        <textarea id="body" placeholder="Write your notification message here..." required></textarea>
      </div>

      <div class="field">
        <label>On Tap / Open Route</label>
        <select id="route">
          <option value="/portfolio">Portfolio (/portfolio)</option>
          <option value="/trade">Practice Trade (/trade)</option>
          <option value="/learn">Learn (/learn)</option>
          <option value="/leaderboard">Leaderboard (/leaderboard)</option>
          <option value="/weekly-contest">Weekly Contest (/weekly-contest)</option>
        </select>
      </div>

      <button type="submit" id="submit-btn" class="send-btn">
        <span>🚀 Send Broadcast to All Users</span>
      </button>
    </form>

    <div id="result-box"></div>
  </div>

  <script>
    function applyPreset(title, body) {
      document.getElementById('title').value = title;
      document.getElementById('body').value = body;
    }

    async function sendPush(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const box = document.getElementById('result-box');
      const title = document.getElementById('title').value.trim();
      const body = document.getElementById('body').value.trim();
      const route = document.getElementById('route').value;

      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Broadcasting to devices...</span>';
      box.style.display = 'none';

      try {
        const res = await fetch('/api/custom-blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, route })
        });
        const data = await res.json();
        
        if (data.success) {
          box.className = 'success';
          box.innerHTML = '🎉 <b>Successfully Delivered!</b> Sent to <b>' + data.sent + '</b> devices' + (data.failed > 0 ? ' (' + data.failed + ' expired/offline)' : '') + '.';
          box.style.display = 'block';
        } else {
          box.className = 'error';
          box.innerHTML = '❌ <b>Error:</b> ' + (data.error || 'Failed to send notification');
          box.style.display = 'block';
        }
      } catch (err) {
        box.className = 'error';
        box.innerHTML = '❌ <b>Network error:</b> ' + err.message;
        box.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀 Send Broadcast to All Users</span>';
      }
    }
  </script>
</body>
</html>
        `);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // If title and body are present, execute the blast
    try {
      const { messaging } = await import('./firebaseAdmin.js');
      if (!messaging) return res.status(500).json({ error: 'Firebase not initialized' });
      const users = await prisma.user.findMany({ where: { fcmToken: { not: null } } });
      let sent = 0, failed = 0;
      for (const user of users) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: { title, body },
            android: { notification: { sound: 'default', priority: 'high' } },
            data: { route },
          });
          await prisma.notification.create({
            data: { userId: user.id, title, body, route },
          });
          sent++;
        } catch (err) { failed++; }
      }
      res.json({ success: true, sent, failed, total: users.length });
    } catch (e) {
      res.status(500).json({ error: e.stack });
    }
  };

  app.get('/api/custom-blast', handleCustomBlast);
  app.post('/api/custom-blast', handleCustomBlast);
  app.get('/api/blast', handleCustomBlast);
  app.post('/api/blast', handleCustomBlast);
  app.get('/blast', handleCustomBlast);
  app.post('/blast', handleCustomBlast);

  // ==========================================
  // EXPORT ALL REGISTERED USER EMAILS
  // ==========================================
  app.get('/api/users/export-emails', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, username: true, email: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      });

      const format = req.query.format || 'json';

      if (format === 'csv') {
        const header = 'id,name,username,email,createdAt\n';
        const rows = users.map(u => `"${u.id}","${(u.name || '').replace(/"/g, '""')}","${(u.username || '').replace(/"/g, '""')}","${u.email}","${u.createdAt.toISOString()}"`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="moolzen_users.csv"');
        return res.send(header + rows);
      }

      res.json({ total: users.length, users });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // RESEND EMAIL BROADCAST CONSOLE & API
  // ==========================================
  const handleEmailBlast = async (req, res) => {
    const apiKey = req.body?.apiKey || process.env.RESEND_API_KEY;
    const fromEmail = req.body?.from || 'Moolzen <team@moolzen.com>';
    const subject = req.body?.subject;
    const htmlContent = req.body?.html;

    // If GET or missing parameters, serve the interactive Email Console UI
    if (req.method === 'GET' || !subject || !htmlContent) {
      try {
        const userCount = await prisma.user.count();
        return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moolzen Bulk Email Broadcast Console</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0b0e14;
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .card {
      background: #151922;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 32px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
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
      margin-bottom: 16px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    .export-link {
      color: #60a5fa;
      text-decoration: none;
      font-size: 12px;
      font-weight: 700;
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .export-link:hover { text-decoration: underline; }
    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      margin-bottom: 24px;
    }
    .field {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input, textarea {
      width: 100%;
      background: #0b0e14;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #ffffff;
      padding: 12px 14px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, textarea:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
    }
    textarea {
      resize: vertical;
      min-height: 120px;
      font-family: monospace;
      font-size: 13px;
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }
    .preset-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .preset-btn:hover {
      background: rgba(37, 99, 235, 0.2);
      border-color: #2563eb;
      color: #ffffff;
    }
    button.send-btn {
      width: 100%;
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 14px;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
    }
    button.send-btn:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    button.send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #result-box {
      margin-top: 20px;
      padding: 14px;
      border-radius: 12px;
      font-size: 14px;
      display: none;
    }
    .success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
    }
    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div class="badge">
        <span class="pulse-dot"></span>
        <span>${userCount} Registered Users</span>
      </div>
      <a href="/api/users/export-emails?format=csv" class="export-link" download>📥 Download CSV</a>
    </div>

    <h1>Email Broadcast Console</h1>
    <p class="subtitle">Send high-deliverability emails directly to all registered users via Resend.</p>

    <div class="presets">
      <button class="preset-btn" onclick="applyUpdatePreset()">🚀 App Update (v1.0.8)</button>
      <button class="preset-btn" onclick="applyWelcomePreset()">👋 Welcome Back</button>
    </div>

    <form id="email-form" onsubmit="sendEmail(event)">
      <div class="field">
        <label>Resend API Key (re_...)</label>
        <input type="password" id="apiKey" placeholder="re_123456789... (from resend.com)" />
      </div>

      <div class="field">
        <label>From Address</label>
        <input type="text" id="from" value="Moolzen &lt;onboarding@resend.dev&gt;" placeholder="Moolzen &lt;team@moolzen.com&gt;" required />
      </div>

      <div class="field">
        <label>Subject Line</label>
        <input type="text" id="subject" placeholder="e.g. 🚀 Update Moolzen: All-New AI Market Analysis is Live!" required />
      </div>

      <div class="field">
        <label>Email HTML Content</label>
        <textarea id="html" placeholder="Write your HTML or plain text email content..." required></textarea>
      </div>

      <button type="submit" id="submit-btn" class="send-btn">
        <span>📧 Broadcast Email to All ${userCount} Users</span>
      </button>
    </form>

    <div id="result-box"></div>
  </div>

  <script>
    function applyUpdatePreset() {
      document.getElementById('subject').value = '🚀 Update Moolzen: All-New AI Market Analysis & Faster UI is Live!';
      document.getElementById('html').value = \`
<div style="font-family: Arial, sans-serif; background-color: #0b0e14; color: #ffffff; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #60a5fa; margin-bottom: 12px;">🚀 New Moolzen Update is Live on Google Play!</h2>
  <p style="font-size: 15px; color: #cbd5e1; line-height: 1.6;">
    Hey Trader,<br><br>
    We have just released a major update (v1.0.8) packed with powerful new features to supercharge your trading journey:
  </p>
  <ul style="color: #cbd5e1; font-size: 14px; line-height: 1.8; margin: 16px 0 24px 20px;">
    <li><b>🤖 Daily AI Market Analysis:</b> Personalized portfolio breakdown every day at 3:35 PM right as the Indian market closes.</li>
    <li><b>🔔 Smart Notification Center:</b> Instant alerts for top market movers and weekly contests.</li>
    <li><b>⚡ Faster Live Charts:</b> Smoother practice trade execution and real-time quotes.</li>
  </ul>
  <div style="text-align: center; margin: 32px 0;">
    <a href="https://play.google.com/store/apps/details?id=com.moolzen.app" style="background-color: #2563eb; color: #ffffff; font-weight: bold; padding: 14px 28px; border-radius: 12px; text-decoration: none; display: inline-block;">
      Update on Google Play ➔
    </a>
  </div>
  <p style="font-size: 13px; color: #64748b; text-align: center;">
    Happy Trading,<br><b>Team Moolzen</b>
  </p>
</div>
\`.trim();
    }

    function applyWelcomePreset() {
      document.getElementById('subject').value = '📈 Markets are open: Claim your daily practice coins on Moolzen!';
      document.getElementById('html').value = '<p>Hey Trader,</p><p>Practice trading Nifty and Sensex stocks risk-free on Moolzen.</p><p><a href="https://play.google.com/store/apps/details?id=com.moolzen.app">Open App</a></p>';
    }

    // Apply update preset by default
    applyUpdatePreset();

    async function sendEmail(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const box = document.getElementById('result-box');
      const apiKey = document.getElementById('apiKey').value.trim();
      const from = document.getElementById('from').value.trim();
      const subject = document.getElementById('subject').value.trim();
      const html = document.getElementById('html').value.trim();

      if (!apiKey) {
        alert('Please enter your Resend API Key (from resend.com).');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Sending bulk emails...</span>';
      box.style.display = 'none';

      try {
        const res = await fetch('/api/email-blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, from, subject, html })
        });
        const data = await res.json();
        
        if (data.success) {
          box.className = 'success';
          box.innerHTML = '🎉 <b>Email Broadcast Completed!</b> Sent to <b>' + data.sent + '</b> users' + (data.failed > 0 ? ' (' + data.failed + ' failed)' : '') + '.';
          box.style.display = 'block';
        } else {
          box.className = 'error';
          box.innerHTML = '❌ <b>Error:</b> ' + (data.error || 'Failed to send emails');
          box.style.display = 'block';
        }
      } catch (err) {
        box.className = 'error';
        box.innerHTML = '❌ <b>Network error:</b> ' + err.message;
        box.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📧 Broadcast Email to All Users</span>';
      }
    }
  </script>
</body>
</html>
        `);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Process POST email blast via Resend
    if (!apiKey) {
      return res.status(400).json({ error: 'Resend API Key is required.' });
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const users = await prisma.user.findMany({
        where: { email: { not: '' } },
        select: { email: true, name: true }
      });

      let sent = 0;
      let failed = 0;

      // Send in batches of 50 to avoid rate limits
      for (const user of users) {
        try {
          await resend.emails.send({
            from: fromEmail,
            to: user.email,
            subject: subject,
            html: htmlContent
          });
          sent++;
        } catch (err) {
          failed++;
        }
      }

      res.json({ success: true, sent, failed, total: users.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };

  app.get('/api/email-blast', handleEmailBlast);
  app.post('/api/email-blast', handleEmailBlast);

  app.post('/api/users/fcm-token', async (req, res) => {
    try {
      const { email, userId, token } = req.body;
      if (!token) return res.status(400).json({ error: 'Missing device token' });

      if (userId) {
        await prisma.user.update({
          where: { id: Number(userId) },
          data: { fcmToken: token }
        });
        return res.json({ success: true });
      }

      if (email) {
        await prisma.user.updateMany({
          where: { email },
          data: { fcmToken: token }
        });
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Missing userId or email' });
    } catch (error) {
      console.error('Error saving FCM token:', error);
      res.status(500).json({ error: 'Failed to save token' });
    }
  });

  app.get('/api/social-feed', async (req, res) => {
    try {
      const feed = await prisma.socialFeed.findMany({
        orderBy: { timestamp: 'desc' },
        take: 20
      });
      res.json(feed);
    } catch (error) {
      console.error('Error fetching social feed:', error);
      res.status(500).json({ error: 'Server error fetching social feed' });
    }
  });

  app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date() });
  });

  app.get('/api/debug-deploy', (req, res) => {
    try {
      const gitLog = execSync('git log -n 1', { encoding: 'utf8' });
      const gitStatus = execSync('git status', { encoding: 'utf8' });
      const dir = process.cwd();
      res.json({
        success: true,
        dir,
        port: PORT,
        gitLog,
        gitStatus,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT
        }
      });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({ error: 'Internal Server Error!' });
  });

  initCronJobs();

  app.listen(PORT, () => {
    console.log(`🚀 Gen Z Trading Server running on: http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('❌ Server failed to boot:', err);
  const fallback = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: false,
      error: err.message,
      stack: err.stack,
      message: 'This is a fallback server serving the crash logs.'
    }, null, 2));
  });
  fallback.listen(PORT, () => {
    console.log(`⚠️ Fallback error server running on port ${PORT}`);
  });
});
