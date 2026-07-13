import express from 'express';
import { leaderboardCache, invalidateLeaderboardCache } from '../cron.js';

// ============================================================
// HELPERS
// ============================================================

const INITIAL_CAPITAL = 1000000; // ₹10,00,000

function calculateTier(roi) {
  if (roi >= 20) return 'A';
  if (roi >= -5) return 'B';
  return 'C';
}

const TIER_CONFIG = {
  A: { label: 'Tier A (Elite)', icon: '👑', color: '#FFD700' },
  B: { label: 'Tier B (Solid)', icon: '⭐', color: '#3B82F6' },
  C: { label: 'Tier C (Learning)', icon: '📚', color: '#A78BFA' },
};

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
      // ── 1. Check cache (skip for user-specific data) ─────────────────────
      const cacheKey = `${view}:${timeframe}`;
      const cached = leaderboardCache.get(cacheKey);
      const now = Date.now();
      let allTradingEntries = null;

      if (cached && cached.expiresAt > now) {
        allTradingEntries = cached.data;
      }

      // ── 2. Fetch current user (always fresh) ──────────────────────────────
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: { holdings: { include: { stock: true } }, lessons: true }
      });

      if (!user) return res.status(404).json({ error: 'User not found!' });

      // ── 3. Get stock prices ───────────────────────────────────────────────
      const stocks = await prisma.stock.findMany();
      const stockPrices = {};
      stocks.forEach(s => { stockPrices[s.id] = s.price; });

      // ── 4. Build trading entries if not cached ────────────────────────────
      if (!allTradingEntries) {
        const users = await prisma.user.findMany({
          include: { holdings: { include: { stock: true } } }
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

        const entries = users.map(u => {
          const displayName = u.username || u.email.split('@')[0];
          let holdingsValue = 0;
          u.holdings.forEach(h => {
            holdingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice);
          });
          const netWorth = u.cash + holdingsValue;

          // Determine base for ROI calculation
          let baseCapital = INITIAL_CAPITAL;
          if (timeframe !== 'alltime' && snapshotMap[u.id]) {
            baseCapital = snapshotMap[u.id];
          }

          const profitLoss = netWorth - baseCapital;
          const roi = (profitLoss / baseCapital) * 100;
          const tier = calculateTier(roi);

          return {
            id: `user-${u.id}`,
            userId: u.id,
            username: displayName,
            avatar: u.id % 2 === 0 ? '#6366F1' : '#10B981',
            streak: u.streak || 1,
            league: u.league || 'BRONZE', // kept for Learning tab
            roi: Math.round(roi * 100) / 100,
            profitLoss: Math.round(profitLoss * 100) / 100,
            netWorth: Math.round(netWorth * 100) / 100,
            tier,
            tierConfig: TIER_CONFIG[tier],
            createdAt: u.createdAt,
          };
        });

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

        // Store in cache for 5 minutes
        leaderboardCache.set(cacheKey, { data: entries, expiresAt: now + 5 * 60 * 1000 });
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

      // ── 6. User-specific data (always fresh) ─────────────────────────────
      const userEntry = allTradingEntries.find(e => e.userId === Number(userId));

      let userHoldingsValue = 0;
      user.holdings.forEach(h => {
        userHoldingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice);
      });
      const userNetWorth = user.cash + userHoldingsValue;
      const userProfitLoss = userNetWorth - INITIAL_CAPITAL;
      const userROI = (userProfitLoss / INITIAL_CAPITAL) * 100;
      const userTier = calculateTier(userROI);

      // ── 7. Learning Leaderboard (unchanged logic) ─────────────────────────
      const allUsersForLearning = await prisma.user.findMany({
        include: { lessons: true }
      });

      const learningLeaderboard = allUsersForLearning
        .map(u => ({
          id: `user-${u.id}`,
          username: u.id === Number(userId)
            ? `${u.username || u.email.split('@')[0]} (You)`
            : (u.username || u.email.split('@')[0]),
          avatar: u.id % 2 === 0 ? '#6366F1' : '#10B981',
          totalXP: u.totalXP || 0,
          streak: u.streak || 1,
          completedCount: u.lessons.length,
          isUser: u.id === Number(userId),
          league: u.league || 'BRONZE',
        }))
        .sort((a, b) => b.totalXP - a.totalXP)
        .map((e, i) => ({ ...e, rank: i + 1 }));

      const userLearningRankInfo = learningLeaderboard.find(e => e.isUser);

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
        totalUsers: allTradingEntries.length,

        // Learning (unchanged)
        userXP: user.totalXP || 0,
        userLearningRank: userLearningRankInfo?.rank ?? null,
        completedLessonsCount: user.lessons.length,

        // Lists
        tradingLeaderboard,
        learningLeaderboard,

        // Meta
        view,
        timeframe,
      });
    } catch (error) {
      console.error(`❌ Leaderboard error for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
  });

  return router;
}
