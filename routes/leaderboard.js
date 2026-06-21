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
          }
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

      // 2. Fetch all real users with their holdings and stock relations
      const users = await prisma.user.findMany({
        include: {
          holdings: {
            include: { stock: true }
          }
        }
      });

      // 3. Fetch all stocks to make sure price calculations are precise
      const stocks = await prisma.stock.findMany();
      const stockPrices = {};
      stocks.forEach(s => {
        stockPrices[s.id] = s.price;
      });

      // 4. Calculate Net Worth for each real user dynamically
      const leaderboardEntries = [];

      users.forEach(u => {
        let uHoldingsValue = 0;
        u.holdings.forEach(h => {
          const currentPrice = stockPrices[h.stockId] || h.avgPrice;
          uHoldingsValue += h.quantity * currentPrice;
        });

        const totalNetWorth = u.cash + uHoldingsValue;
        const isCurrentUser = Number(userId) === u.id;

        // Clean username from email if not defined
        const displayName = u.username || u.email.split('@')[0];

        leaderboardEntries.push({
          id: `user-${u.id}`,
          username: isCurrentUser ? `${displayName} (You)` : displayName,
          avatar: u.id % 2 === 0 ? '#6366F1' : '#10B981', // Indigo or Emerald green
          totalValue: Math.round(totalNetWorth * 100) / 100,
          streak: u.streak || 1,
          isUser: isCurrentUser
        });
      });

      // 5. Sort by total value descending
      leaderboardEntries.sort((a, b) => b.totalValue - a.totalValue);

      // 6. Map rank indices (1-indexed)
      const rankedLeaderboard = leaderboardEntries.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      // Find user specific rank info
      const userRankInfo = rankedLeaderboard.find(entry => entry.isUser);

      res.status(200).json({
        userRank: userRankInfo ? userRankInfo.rank : 1,
        userNetWorth: Math.round(userNetWorth * 100) / 100,
        leaderboard: rankedLeaderboard
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve leaderboard for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
    }
  });

  return router;
}
