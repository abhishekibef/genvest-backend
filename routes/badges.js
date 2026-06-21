import express from 'express';

export function getBadgesRouter(prisma) {
  const router = express.Router();

  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      // 1. Fetch User details, holdings, transactions
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: {
          holdings: {
            include: { stock: true }
          },
          transactions: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      // 2. Calculate User Net Worth
      let userHoldingsValue = 0;
      user.holdings.forEach(h => {
        userHoldingsValue += h.quantity * h.stock.price;
      });
      const userNetWorth = user.cash + userHoldingsValue;

      // Calculate overall P&L percentage (Starting Capital = ₹10L)
      const startingCapital = 1000000;
      const totalPnL = userNetWorth - startingCapital;
      const pnlPct = (totalPnL / startingCapital) * 100;

      let maxReturnPct = pnlPct;

      // Check active holdings return
      user.holdings.forEach(h => {
        const retPct = h.avgPrice > 0 ? ((h.stock.price - h.avgPrice) / h.avgPrice) * 100 : 0;
        if (retPct > maxReturnPct) maxReturnPct = retPct;
      });

      // Check completed sell trades return
      const sells = user.transactions.filter(t => t.type === 'SELL');
      sells.forEach(s => {
        const buysBefore = user.transactions.filter(t => t.type === 'BUY' && t.stockId === s.stockId && new Date(t.timestamp) < new Date(s.timestamp));
        if (buysBefore.length > 0) {
          const avgBuyPrice = buysBefore.reduce((sum, b) => sum + b.price, 0) / buysBefore.length;
          const retPct = ((s.price - avgBuyPrice) / avgBuyPrice) * 100;
          if (retPct > maxReturnPct) maxReturnPct = retPct;
        }
      });

      // 3. Determine if user is Rank 1 globally
      const competitors = await prisma.competitor.findMany({
        include: {
          holdings: {
            include: { stock: true }
          }
        }
      });

      const stocks = await prisma.stock.findMany();
      const stockPrices = {};
      stocks.forEach(s => {
        stockPrices[s.id] = s.price;
      });

      let isRankOne = true;
      for (const comp of competitors) {
        let compHoldingsValue = 0;
        comp.holdings.forEach(h => {
          const currentPrice = stockPrices[h.stockId] || h.avgPrice;
          compHoldingsValue += h.quantity * currentPrice;
        });
        const compNetWorth = comp.cash + compHoldingsValue;
        if (compNetWorth > userNetWorth) {
          isRankOne = false;
          break;
        }
      }

      // 4. Fetch learning progress
      const completedCount = await prisma.userLesson.count({
        where: {
          userId: user.id,
          completed: true
        }
      });
      const totalLessons = await prisma.lesson.count();
      const isScholar = completedCount === totalLessons && totalLessons > 0;

      // 5. Build earned badges list
      const earnedBadges = [];

      if (user.transactions.length > 0) {
        earnedBadges.push({
          badgeName: 'First Trade',
          badgeIcon: '🎯',
          description: 'Completed first trade'
        });
      }

      // Requirement updated to 20% overall profit as per user instruction
      if (maxReturnPct >= 20) {
        earnedBadges.push({
          badgeName: 'Profit Master',
          badgeIcon: '📈',
          description: '20% overall profit'
        });
      }

      if (isRankOne) {
        earnedBadges.push({
          badgeName: 'Daily Champion',
          badgeIcon: '🏆',
          description: 'Won a competition (Rank #1)'
        });
      }

      if (isScholar) {
        earnedBadges.push({
          badgeName: 'Scholar',
          badgeIcon: '📚',
          description: 'All tutorials done'
        });
      }

      if (user.streak >= 7) {
        earnedBadges.push({
          badgeName: 'Streak Master',
          badgeIcon: '🔥',
          description: '7 day streak'
        });
      }

      if (userNetWorth >= 5000000) {
        earnedBadges.push({
          badgeName: 'High Roller',
          badgeIcon: '💰',
          description: '₹50L portfolio'
        });
      }

      return res.status(200).json(earnedBadges);
    } catch (error) {
      console.error(`❌ Failed to retrieve badges for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve achievements' });
    }
  });

  return router;
}
