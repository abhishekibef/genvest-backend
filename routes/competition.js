import express from 'express';

export function getCompetitionRouter(prisma) {
  const router = express.Router();

  // Helper to get today's YYYY-MM-DD date string safely in local/server time
  function getTodayDateStr() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Generates a stable but fluctuating daily profit based on time to simulate live action
  function getCompetitorDailyProfit(username) {
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    // Base profit
    let baseProfit = 10000;
    if (username === 'stonks_queen') baseProfit = 45000;
    else if (username === 'crypto_charlie') baseProfit = 12000;
    else if (username === 'sip_soldier') baseProfit = 15000;
    else if (username === 'dividend_daddy') baseProfit = 8000;
    else if (username === 'fomo_felix') baseProfit = -5000;

    const date = new Date();
    const mins = date.getHours() * 60 + date.getMinutes();
    const fluctuation = Math.sin((mins + hash) * 0.1) * 3000; // Fluctuate up to +/- ₹3000
    return Math.round(baseProfit + fluctuation);
  }

  // 1. Get today's competition standings
  router.get('/today', async (req, res) => {
    const todayDateStr = getTodayDateStr();

    try {
      // Fetch all real user entries for today
      const dbEntries = await prisma.competitionEntry.findMany({
        where: { date: todayDateStr }
      });

      const topEntries = [];

      // Calculate live profit for each real user who joined
      for (const entry of dbEntries) {
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          include: {
            holdings: {
              include: { stock: true }
            }
          }
        });

        if (user) {
          let userHoldingsValue = 0;
          user.holdings.forEach(h => {
            userHoldingsValue += h.quantity * h.stock.price;
          });
          const currentNetWorth = user.cash + userHoldingsValue;
          const liveProfit = Math.round((currentNetWorth - entry.startingValue) * 100) / 100;

          // Sync back to database so we have persistent profit state
          await prisma.competitionEntry.update({
            where: { id: entry.id },
            data: { profit: liveProfit }
          });

          topEntries.push({
            userId: entry.userId,
            userName: entry.userName,
            profit: liveProfit
          });
        }
      }

      // Replaced fake competitor injection loop with zero-filler to maintain professional feed.
      // We only display real user entries who registered in database.

      // Sort by profit descending
      topEntries.sort((a, b) => b.profit - a.profit);

      res.status(200).json({
        prizePool: '🏆 Virtual Trophy + Badge',
        topEntries
      });
    } catch (error) {
      console.error('❌ Failed to retrieve daily competition:', error);
      res.status(500).json({ error: 'Failed to retrieve daily competition' });
    }
  });

  // 2. Join today's competition
  router.post('/join', async (req, res) => {
    const { userId, userName } = req.body;

    if (!userId || !userName) {
      return res.status(400).json({ error: 'Missing userId or userName!' });
    }

    const todayDateStr = getTodayDateStr();

    try {
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

      // Check if user already joined today
      const existingEntry = await prisma.competitionEntry.findUnique({
        where: {
          userId_date: {
            userId: Number(userId),
            date: todayDateStr
          }
        }
      });

      if (existingEntry) {
        return res.status(200).json({ success: true, message: 'Already joined today\'s competition!' });
      }

      // Calculate initial starting net worth when joining
      let userHoldingsValue = 0;
      user.holdings.forEach(h => {
        userHoldingsValue += h.quantity * h.stock.price;
      });
      const initialNetWorth = user.cash + userHoldingsValue;

      // Register the entry
      await prisma.competitionEntry.create({
        data: {
          userId: Number(userId),
          userName: userName,
          date: todayDateStr,
          startingValue: initialNetWorth,
          profit: 0.0
        }
      });

      res.status(200).json({ success: true, message: 'Successfully joined today\'s competition!' });
    } catch (error) {
      console.error('❌ Failed to join daily competition:', error);
      res.status(500).json({ error: 'Failed to join competition' });
    }
  });

  return router;
}
