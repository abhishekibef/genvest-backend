import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Imports custom routes
import { getAuthRouter } from './routes/auth.js';
import { getStocksRouter } from './routes/stocks.js';
import { getTradesRouter } from './routes/trades.js';
import { getPortfolioRouter } from './routes/portfolio.js';
import { getLeaderboardRouter } from './routes/leaderboard.js';
import { getLearnRouter } from './routes/learn.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Base Health Check Route
app.get('/', (req, res) => {
  res.send('GenVest Central Cloud Engine is running live.');
});

// Use registered sub-routers
app.use('/api/auth', getAuthRouter());
app.use('/api/stocks', getStocksRouter());
app.use('/api/trades', getTradesRouter());
app.use('/api/portfolio', getPortfolioRouter());
app.use('/api/leaderboard', getLeaderboardRouter());
app.use('/api/learn', getLearnRouter());

// 🚀 FIXED BUY ROUTE: Uses standard Prisma upsert logic to avoid profile entry drop crashes
app.post('/api/trade/buy', async (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const totalCost = parseInt(shares) * parseFloat(price);

    // 1. Fetch current user or assume default balance if brand new session key
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const currentCash = user ? (user.cash ?? 1000000.00) : 1000000.00;

    if (currentCash < totalCost) {
      return res.status(400).json({ message: 'Insufficient wallet balance for this purchase order.' });
    }

    const nextCashBalance = currentCash - totalCost;

    // 2. Native Upsert: Safely Handles Create/Update state logic smoothly
    const updatedUser = await prisma.user.upsert({
      where: { id: userId },
      update: { cash: nextCashBalance },
      create: {
        id: userId,
        name: 'Sandbox Trader',
        cash: nextCashBalance
      }
    });

    return res.status(200).json({ message: 'Purchase successful', cash: updatedUser.cash });
  } catch (error) {
    console.error("Critical Buy Route Error:", error);
    return res.status(500).json({ message: 'Internal server calculation failed.' });
  }
});

// 🚀 FIXED SELL ROUTE: Uses standard Prisma upsert logic to clear liquidation drops
app.post('/api/trade/sell', async (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const totalReturn = parseInt(shares) * parseFloat(price);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const currentCash = user ? (user.cash ?? 1000000.00) : 1000000.00;

    const nextCashBalance = currentCash + totalReturn;

    const updatedUser = await prisma.user.upsert({
      where: { id: userId },
      update: { cash: nextCashBalance },
      create: {
        id: userId,
        name: 'Sandbox Trader',
        cash: nextCashBalance
      }
    });

    return res.status(200).json({ message: 'Liquidation successful', cash: updatedUser.cash });
  } catch (error) {
    console.error("Critical Sell Route Error:", error);
    return res.status(500).json({ message: 'Internal server liquidation failed.' });
  }
});

// 🚀 FIXED PORTFOLIO ROUTE: Returns safe custom values even if user doesn't exist in tables yet
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    
    if (!user) {
      return res.status(200).json({ cash: 1000000.00, holdings: [] });
    }
    return res.status(200).json({ 
      cash: user.cash ?? 1000000.00, 
      holdings: user.holdings || [] 
    });
  } catch (error) {
    console.error("Critical Portfolio Route Error:", error);
    return res.status(500).json({ message: 'Cloud link synchronization timeout.' });
  }
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`🚀 GenVest Central Server streaming on port ${PORT}`);
});
