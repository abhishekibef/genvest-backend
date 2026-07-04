import express from 'express';

export function getLeaderboardRouter(prisma) {
  const router = express.Router();

  // Get active leaderboard ranking including the user
  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      // 1. Fetch User and calculate current Net Worth
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: {
          holdings: {
            include: { stock: true }
          },
          lessons: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      let userHoldingsValue = 0;
      user.holdings.forEach(h => {
        userHoldingsValue += h.quantity * h.stock.price;
      });
      const userNetWorth = user.cash + userHoldingsValue;

      // 2. Fetch all real users with their holdings, stock relations, and completed lessons
      const users = await prisma.user.findMany({
        include: {
          holdings: {
            include: { stock: true }
          },
          lessons: true
        }
      });

      // 3. Fetch all stocks to make sure price calculations are precise
      const stocks = await prisma.stock.findMany();
      const stockPrices = {};
      stocks.forEach(s => {
        stockPrices[s.id] = s.price;
      });

      // 4. Calculate Trading & Learning Leaderboard entries
      const tradingEntries = [];
      const learningEntries = [];

      users.forEach(u => {
        const isCurrentUser = Number(userId) === u.id;
        const displayName = u.username || u.email.split('@')[0];
        const avatarColor = u.id % 2 === 0 ? '#6366F1' : '#10B981'; // Indigo or Emerald green

        // Trading calculation
        let uHoldingsValue = 0;
        u.holdings.forEach(h => {
          const currentPrice = stockPrices[h.stockId] || h.avgPrice;
          uHoldingsValue += h.quantity * currentPrice;
        });
        const totalNetWorth = u.cash + uHoldingsValue;

        tradingEntries.push({
          id: `user-${u.id}`,
          username: isCurrentUser ? `${displayName} (You)` : displayName,
          avatar: avatarColor,
          totalValue: Math.round(totalNetWorth * 100) / 100,
          streak: u.streak || 1,
          isUser: isCurrentUser,
          league: u.league || 'BRONZE'
        });

        // Learning calculation
        learningEntries.push({
          id: `user-${u.id}`,
          username: isCurrentUser ? `${displayName} (You)` : displayName,
          avatar: avatarColor,
          totalXP: u.totalXP || 0,
          streak: u.streak || 1,
          completedCount: u.lessons.length,
          isUser: isCurrentUser,
          league: u.league || 'BRONZE'
        });
      });

      // 5. Sort Trading by Net Worth DESCENDING
      tradingEntries.sort((a, b) => b.totalValue - a.totalValue);

      // 6. Sort Learning by XP DESCENDING
      learningEntries.sort((a, b) => b.totalXP - a.totalXP);

      // 7. Map rank indices (1-indexed)
      const rankedTrading = tradingEntries.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      const rankedLearning = learningEntries.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      // Find user specific rank info
      const userTradingRankInfo = rankedTrading.find(entry => entry.isUser);
      const userLearningRankInfo = rankedLearning.find(entry => entry.isUser);

      res.status(200).json({
        userRank: userTradingRankInfo ? userTradingRankInfo.rank : 1,
        userNetWorth: Math.round(userNetWorth * 100) / 100,
        userXP: user.totalXP || 0,
        userLearningRank: userLearningRankInfo ? userLearningRankInfo.rank : 1,
        completedLessonsCount: user.lessons.length,
        tradingLeaderboard: rankedTrading,
        learningLeaderboard: rankedLearning
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve leaderboard for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
  });

  return router;
}
