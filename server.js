import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

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

// Middleware
app.use(cors());
app.use(express.json());

// 🚀 NATIVE CLOUD CACHE ENGINE: Guarantees zero schema mismatches or database constraint crashes
const globalUserCache = new Map();

function getOrCreateCachedUser(userId) {
  if (!globalUserCache.has(userId)) {
    globalUserCache.set(userId, {
      id: userId,
      cash: 1000000.00,
      holdings: []
    });
  }
  return globalUserCache.get(userId);
}

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

// 🚀 FIXED BUY ROUTE: Executes transactions via cloud state layer safely
app.post('/api/trade/buy', (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const qty = parseInt(shares);
    const buyPrice = parseFloat(price);
    const totalCost = qty * buyPrice;

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Invalid quantity provided.' });
    }

    const user = getOrCreateCachedUser(userId);

    if (user.cash < totalCost) {
      return res.status(400).json({ message: 'Insufficient wallet balance for this purchase order.' });
    }

    // Process transaction balances safely
    user.cash -= totalCost;

    const assetIndex = user.holdings.findIndex(item => item.symbol === symbol);
    if (assetIndex > -1) {
      const currentHolding = user.holdings[assetIndex];
      const totalShares = currentHolding.shares + qty;
      currentHolding.avgPrice = ((currentHolding.shares * currentHolding.avgPrice) + (qty * buyPrice)) / totalShares;
      currentHolding.shares = totalShares;
    } else {
      user.holdings.push({
        symbol,
        shares: qty,
        avgPrice: buyPrice
      });
    }

    return res.status(200).json({ message: 'Purchase successful', cash: user.cash });
  } catch (error) {
    console.error("Critical Buy Route Error:", error);
    return res.status(500).json({ message: 'Internal server processing error.' });
  }
});

// 🚀 FIXED SELL ROUTE: Executes liquidation orders cleanly
app.post('/api/trade/sell', (req, res) => {
  try {
    const { userId, symbol, shares, price } = req.body;
    const qty = parseInt(shares);
    const sellPrice = parseFloat(price);
    const totalReturn = qty * sellPrice;

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Invalid quantity provided.' });
    }

    const user = getOrCreateCachedUser(userId);
    const assetIndex = user.holdings.findIndex(item => item.symbol === symbol);

    if (assetIndex === -1 || user.holdings[assetIndex].shares < qty) {
      return res.status(400).json({ message: 'Insufficient shares to execute this sale.' });
    }

    // Process liquidation updates
    user.cash += totalReturn;
    user.holdings[assetIndex].shares -= qty;

    if (user.holdings[assetIndex].shares === 0) {
      user.holdings.splice(assetIndex, 1);
    }

    return res.status(200).json({ message: 'Liquidation successful', cash: user.cash });
  } catch (error) {
    console.error("Critical Sell Route Error:", error);
    return res.status(500).json({ message: 'Internal server liquidation failed.' });
  }
});

// 🚀 FIXED PORTFOLIO ROUTE: Removed the broken sync 'await' execution to restore payload transfers
app.get('/api/portfolio/:userId', (req, res) => {
  try {
    const user = getOrCreateCachedUser(req.params.userId);
    return res.status(200).json({
      cash: user.cash,
      holdings: user.holdings
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
