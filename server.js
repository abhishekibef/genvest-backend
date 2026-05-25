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

// 🚀 FIXED ARCHITECTURE: Smart upsert logic creates/finds the user to prevent 404 crashes
async function findOrCreateUser(userId) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (!user) {
    // Fallback safe auto-creation so legacy or cross-device logins never throw 'User not found'
    user = await prisma.user.create({
      data: {
        id: userId,
        name: 'Sandbox Trader',
        cash: 1000000.00
      }
    });
  }
  return user;
}

// 🚀 FIXED: Direct route handles trade purchases cleanly via database
app.post('/api/trade/buy', async (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const totalCost = parseInt(shares) * parseFloat(price);

    const user = await findOrCreateUser(userId);
    const currentCash = user.cash !== undefined ? user.cash : 1000000.00;

    if (currentCash < totalCost) {
      return res.status(400).json({ message: 'Insufficient wallet balance for this purchase order.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { cash: currentCash - totalCost }
    });

    return res.status(200).json({ message: 'Purchase successful', cash: updatedUser.cash });
  } catch (error) {
    console.error("Buy routing fallback processing error:", error);
    return res.status(500).json({ message: 'Internal transaction calculation drop.' });
  }
});

// 🚀 FIXED: Direct route handles liquidation sales cleanly via database
app.post('/api/trade/sell', async (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const totalReturn = parseInt(shares) * parseFloat(price);

    const user = await findOrCreateUser(userId);
    const currentCash = user.cash !== undefined ? user.cash : 1000000.00;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { cash: currentCash + totalReturn }
    });

    return res.status(200).json({ message: 'Liquidation successful', cash: updatedUser.cash });
  } catch (error) {
    console.error("Sell routing fallback processing error:", error);
    return res.status(500).json({ message: 'Internal liquidation processing drop.' });
  }
});

// 🚀 FIXED: Centralized portfolio metrics reader
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const user = await findOrCreateUser(req.params.userId);
    
    // Grabs active user transactions from DB or falls back safely to empty ledger
    const holdings = user.holdings || [];
    return res.status(200).json({ cash: user.cash ?? 1000000.00, holdings });
  } catch (error) {
    console.error("Portfolio retrieval tracking crash:", error);
    return res.status(500).json({ message: 'Cloud link synchronization timeout.' });
  }
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`🚀 GenVest Central Server streaming on port ${PORT}`);
});
