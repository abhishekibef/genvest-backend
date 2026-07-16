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
