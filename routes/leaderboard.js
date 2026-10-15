import express from 'express';
import { leaderboardCache, invalidateLeaderboardCache } from '../cron.js';

// ============================================================
// HELPERS
// ============================================================

const INITIAL_CAPITAL = 1000000; // ₹10,00,000

export function calculateTier(roi) {
  if (roi >= 15) return 'A';
  if (roi > 0) return 'B';
  return 'C';
}

export function calculateLearningLeague(totalXP) {
  if (totalXP >= 1000) return 'DIAMOND';
  if (totalXP >= 500) return 'PLATINUM';
  if (totalXP >= 250) return 'GOLD';
  if (totalXP >= 100) return 'SILVER';
  return 'BRONZE';
}

export const TIER_CONFIG = {
  A: { label: 'Tier A (Elite)', icon: 'crown', color: '#FFD700' },
  B: { label: 'Tier B (Solid)', icon: 'star', color: '#3B82F6' },
  C: { label: 'Tier C (Learning)', icon: 'learn', color: '#A78BFA' },
};

// ─── STRICT TRADING PERFORMANCE CALCULATOR ────────────────────────────
// Calculates REAL trading P&L from actual transactions and open stock holdings.
// "Set Balance" or virtual cash adjustments NEVER artificially inflate trading ROI.
export function calculateTradingPerformance(user, stockPrices, timeframe = 'alltime', snapshotMap = {}) {
  const transactions = user.transactions || [];
  const holdings = user.holdings || [];

  const tradesCount = transactions.length;
  const hasHoldings = holdings.length > 0;
  const hasTraded = tradesCount > 0 || hasHoldings;

  // STRICT RULE 1: If user has 0 trades and 0 holdings, they CANNOT have non-zero ROI!
  if (!hasTraded) {
    return {
      hasTraded: false,
      tradesCount: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      roi: 0.0,
      tier: 'C',
    };
  }

  // 1. Calculate Unrealized P&L from current open stock holdings
  let unrealizedPnL = 0;
  let holdingsCurrentValue = 0;
  let holdingsCostBasis = 0;

  holdings.forEach(h => {
    const livePrice = stockPrices[h.stockId] || h.avgPrice || 0;
    const cost = h.quantity * (h.avgPrice || 0);
    const value = h.quantity * livePrice;
    unrealizedPnL += (value - cost);
    holdingsCurrentValue += value;
    holdingsCostBasis += cost;
  });

  // 2. Calculate Realized P&L from closed trades (transactions) using FIFO cost matching
  let realizedPnL = 0;
  const buyQueues = {}; // stockId -> [{ qty, price }]

  // Filter transactions by timeframe if applicable
  let filteredTx = transactions;
  if (timeframe !== 'alltime') {
    const daysAgo = timeframe === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    filteredTx = transactions.filter(t => new Date(t.timestamp) >= cutoff);
  }

  const sortedTx = [...filteredTx].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  for (const tx of sortedTx) {
    const sym = tx.stockId;
    if (!buyQueues[sym]) buyQueues[sym] = [];

    if (tx.type === 'BUY') {
      buyQueues[sym].push({ qty: tx.quantity, price: tx.price });
    } else if (tx.type === 'SELL') {
      let sellQty = tx.quantity;
      while (sellQty > 0 && buyQueues[sym].length > 0) {
        const oldestBuy = buyQueues[sym][0];
        const matchQty = Math.min(sellQty, oldestBuy.qty);
        realizedPnL += matchQty * (tx.price - oldestBuy.price);
        oldestBuy.qty -= matchQty;
        sellQty -= matchQty;
        if (oldestBuy.qty <= 0) {
          buyQueues[sym].shift();
        }
      }
    }
  }

  // Pure trading P&L = Realized gains/losses + Unrealized paper gains/losses
  const totalPnL = realizedPnL + unrealizedPnL;

  // Baseline practice capital (standard base ₹10,00,000)
  let baseCapital = INITIAL_CAPITAL;
  if (timeframe !== 'alltime' && snapshotMap[user.id]) {
    baseCapital = snapshotMap[user.id];
  }

  const roi = (totalPnL / baseCapital) * 100;
  const tier = calculateTier(roi);

  return {
    hasTraded: true,
    tradesCount,
    realizedPnL: Math.round(realizedPnL * 100) / 100,
    unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
    totalPnL: Math.round(totalPnL * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    tier,
  };
}

// ============================================================
// LEADERBOARD ROUTER
// ============================================================

export function getLeaderboardRouter(prisma) {
  const router = express.Router();

  // GET /:userId?view=global|tierA|tierB|tierC&timeframe=alltime|7d|30d
  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    const view = req.query.view || 'global';           // global | tierA | tierB | tierC
    const timeframe = req.query.timeframe || 'alltime'; // alltime | 7d | 30d

    try {
      // ── 1. Check cache (1-minute TTL) ───────────────────────────────────
      const cacheKey = `trading:${timeframe}:v3`;
      const cached = leaderboardCache.get(cacheKey);
      const now = Date.now();
      let allTradingEntries = null;

      if (cached && cached.expiresAt > now) {
        allTradingEntries = cached.data;
      }

      // ── 2. Get current user's profile with transactions ─────────────────
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: {
          holdings: { include: { stock: true } },
          transactions: { select: { id: true, stockId: true, type: true, quantity: true, price: true, timestamp: true } },
          lessons: true,
        }
      });

      if (!user) return res.status(404).json({ error: 'User not found!' });

      // ── 3. Get stock prices ───────────────────────────────────────────────
      const stocks = await prisma.stock.findMany();
      const stockPrices = {};
      stocks.forEach(s => { stockPrices[s.id] = s.price; });

      // ── 4. Build trading entries if not cached ────────────────────────────
      if (!allTradingEntries) {
        const users = await prisma.user.findMany({
          include: {
            holdings: { include: { stock: true } },
            transactions: { select: { id: true, stockId: true, type: true, quantity: true, price: true, timestamp: true } },
          }
        });

        // Get historical snapshots for timeframe-based ROI
        let snapshotMap = {};
        if (timeframe !== 'alltime') {
          const daysAgo = timeframe === '7d' ? 7 : 30;
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - daysAgo);

          const snapshots = await prisma.portfolioSnapshot.findMany({
            where: { snapshot: { lte: cutoff } },
            orderBy: { snapshot: 'desc' },
          });

          // Get most recent snapshot at or before cutoff for each user
          snapshots.forEach(s => {
            if (!snapshotMap[s.userId]) {
              snapshotMap[s.userId] = s.netWorth;
            }
          });
        }

        const entries = users
          .map(u => {
            const displayName = u.username || (u.email ? u.email.split('@')[0] : `Trader${u.id}`);
            let holdingsValue = 0;
            u.holdings.forEach(h => {
              holdingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice || 0);
            });
            const netWorth = u.cash + holdingsValue;

            // Compute pure trading performance (immune to virtual cash reset)
            const perf = calculateTradingPerformance(u, stockPrices, timeframe, snapshotMap);

            return {
              id: `user-${u.id}`,
              userId: u.id,
              username: displayName,
              avatar: u.id % 2 === 0 ? '#6366F1' : '#10B981',
              streak: u.streak || 1,
              league: u.league || 'BRONZE',
              roi: perf.roi,
              profitLoss: perf.totalPnL,
              netWorth: Math.round(netWorth * 100) / 100,
              tier: perf.tier,
              tierConfig: TIER_CONFIG[perf.tier],
              createdAt: u.createdAt,
              tradesCount: perf.tradesCount,
              hasTraded: perf.hasTraded,
            };
          })
          // Active Traders Only: STRICTLY exclude accounts with 0 trades and 0 holdings!
          .filter(e => e.hasTraded);

        // Sort: ROI DESC → profitLoss DESC → createdAt ASC (older account wins tie)
        entries.sort((a, b) => {
          if (b.roi !== a.roi) return b.roi - a.roi;
          if (b.profitLoss !== a.profitLoss) return b.profitLoss - a.profitLoss;
          return new Date(a.createdAt) - new Date(b.createdAt);
        });

        // Assign global ranks
        entries.forEach((e, i) => { e.globalRank = i + 1; });

        // Assign tier ranks
        const tierGroups = { A: 0, B: 0, C: 0 };
        entries.forEach(e => {
          tierGroups[e.tier]++;
          e.tierRank = tierGroups[e.tier];
        });

        allTradingEntries = entries;

        // Store in cache for 60 seconds
        leaderboardCache.set(cacheKey, { data: entries, expiresAt: now + 60 * 1000 });
      }

      // ── 5. Filter by view ─────────────────────────────────────────────────
      let filteredEntries = allTradingEntries;
      if (view === 'tierA') filteredEntries = allTradingEntries.filter(e => e.tier === 'A');
      else if (view === 'tierB') filteredEntries = allTradingEntries.filter(e => e.tier === 'B');
      else if (view === 'tierC') filteredEntries = allTradingEntries.filter(e => e.tier === 'C');

      // Mark current user
      const tradingLeaderboard = filteredEntries.map(e => ({
        ...e,
        isUser: e.userId === Number(userId),
        username: e.userId === Number(userId) ? `${e.username} (You)` : e.username,
      }));

      // ── 6. User-specific data (always fresh & strictly based on trading) ──
      const userEntry = allTradingEntries.find(e => e.userId === Number(userId));
      const userPerf = calculateTradingPerformance(user, stockPrices, timeframe);

      let userHoldingsValue = 0;
      user.holdings.forEach(h => {
        userHoldingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice || 0);
      });
      const userNetWorth = user.cash + userHoldingsValue;
      const userProfitLoss = userPerf.totalPnL;
      const userROI = userPerf.roi;
      const userTier = userPerf.tier;

      // ── 7. Learning Leaderboard (Active Learners Only) ───────────────────
      const allUsersForLearning = await prisma.user.findMany({
        include: { lessons: true }
      });

      const activeLearners = allUsersForLearning
        .map(u => {
          const totalXP = u.totalXP || 0;
          return {
            id: `user-${u.id}`,
            userId: u.id,
            username: u.id === Number(userId)
              ? `${u.username || u.email.split('@')[0]} (You)`
              : (u.username || u.email.split('@')[0]),
            avatar: u.id % 2 === 0 ? '#6366F1' : '#10B981',
            totalXP,
            streak: u.streak || 1,
            completedCount: u.lessons.length,
            isUser: u.id === Number(userId),
            league: calculateLearningLeague(totalXP),
          };
        })
        .filter(u => u.totalXP > 0 || u.completedCount > 0)
        .sort((a, b) => {
          if (b.totalXP !== a.totalXP) return b.totalXP - a.totalXP;
          return b.completedCount - a.completedCount;
        })
        .map((e, i) => ({ ...e, rank: i + 1 }));

      const userLearningRankInfo = activeLearners.find(e => e.isUser);
      const userXP = user.totalXP || 0;

      // ── 8. Respond ────────────────────────────────────────────────────────
      res.status(200).json({
        // User-specific
        userRank: userEntry?.globalRank ?? null,
        userTierRank: userEntry?.tierRank ?? null,
        userTier,
        userTierConfig: TIER_CONFIG[userTier],
        userROI: Math.round(userROI * 100) / 100,
        userProfitLoss: Math.round(userProfitLoss * 100) / 100,
        userNetWorth: Math.round(userNetWorth * 100) / 100,
        userTradesCount: user.transactions?.length || 0,
        isUnranked: !userEntry,
        totalUsers: allTradingEntries.length,

        // Learning
        userXP,
        userLeague: calculateLearningLeague(userXP),
        userLearningRank: userLearningRankInfo?.rank ?? null,
        completedLessonsCount: user.lessons.length,
        totalActiveLearners: activeLearners.length,

        // Lists
        tradingLeaderboard,
        learningLeaderboard: activeLearners,

        // Meta
        view,
        timeframe,
      });
    } catch (error) {
      console.error(`❌ Leaderboard error for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
  });

  // POST /recalculate - Manually trigger an immediate tier & leaderboard audit and cache flush
  router.post('/recalculate', async (req, res) => {
    try {
      const { runWeeklyTierRecalculation } = await import('../cron.js');
      await runWeeklyTierRecalculation();
      res.json({ success: true, message: 'Leaderboard and tiers recalculated successfully.' });
    } catch (err) {
      console.error('Manual recalculation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
