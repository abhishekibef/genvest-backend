import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

// Run database migrations/schema push on boot before initializing PrismaClient
try {
  console.log('🔧 Running programmatic Prisma setup (db push)...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  console.log('✅ Programmatic Prisma setup completed.');
} catch (err) {
  console.error('⚠️ Programmatic Prisma setup error:', err);
}

import { PrismaClient } from '@prisma/client';

// Imports custom routes
import { getAuthRouter } from './routes/auth.js';
import { getStocksRouter } from './routes/stocks.js';
import { getTradesRouter } from './routes/trades.js';
import { getPortfolioRouter } from './routes/portfolio.js';
import { getLeaderboardRouter } from './routes/leaderboard.js';
import { getLearnRouter } from './routes/learn.js';
import { getCompetitionRouter } from './routes/competition.js';
import { getBadgesRouter } from './routes/badges.js';
import { getTournamentRouter } from './routes/tournament.js';
import { getLobbyRouter } from './routes/lobby.js';
import { runSimulationMiddleware } from './simulation.js';
import { initCronJobs } from './cron.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Initialize Prisma
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Simulation trigger middleware (fluctuates prices on active routing requests)
app.use(runSimulationMiddleware(prisma));

// Register API Routes
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

// Social Feed API
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

// Health Ping endpoint
app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error!' });
});

// Initialize gamification engine
initCronJobs();

// Boot the server
app.listen(PORT, async () => {
  console.log(`🚀 Gen Z Trading Server running on: http://localhost:${PORT}`);
  
  // Seed check
  try {
    const stockCount = await prisma.stock.count();
    if (stockCount === 0) {
      console.log('🌱 Database is empty. Seeding data...');
      execSync('node prisma/seed.js', { stdio: 'inherit' });
      console.log('✅ Seeding completed.');
    } else {
      console.log(`📊 Database has ${stockCount} stocks. Skipping seed.`);
    }
  } catch (e) {
    console.error('⚠️ Failed checking or seeding database:', e);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔌 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
