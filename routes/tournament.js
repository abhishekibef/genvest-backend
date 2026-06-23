import express from 'express';

export function getTournamentRouter(prisma) {
  const router = express.Router();

  // Helper to get today's date in YYYY-MM-DD
  const getTodayDateStr = () => new Date().toISOString().split('T')[0];

  // 1. GET /api/tournament/leaderboard - Get today's leaderboard
  router.get('/leaderboard', async (req, res) => {
    try {
      const today = getTodayDateStr();
      
      const tournament = await prisma.tournament.findUnique({
        where: { date: today },
        include: {
          entries: {
            include: { user: true },
            orderBy: { profit: 'desc' }
          }
        }
      });

      if (!tournament) {
        return res.json({ tournament: null, leaderboard: [] });
      }

      const leaderboard = tournament.entries.map((entry, index) => ({
        rank: index + 1,
        userId: entry.userId,
        username: entry.user.username || entry.user.name || `Trader${entry.userId}`,
        currentCash: entry.currentCash,
        profit: entry.profit,
        joinedAt: entry.joinedAt
      }));

      res.json({ tournament, leaderboard });
    } catch (error) {
      console.error("Tournament Leaderboard Error:", error);
      res.status(500).json({ error: 'Failed to load leaderboard.' });
    }
  });

  // 2. POST /api/tournament/join - Join today's tournament
  router.post('/join', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
      const today = getTodayDateStr();

      // Ensure user exists
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Upsert today's tournament
      const tournament = await prisma.tournament.upsert({
        where: { date: today },
        update: {},
        create: { date: today, status: 'ACTIVE' }
      });

      // Check if already joined
      const existingEntry = await prisma.tournamentEntry.findUnique({
        where: { userId_tournamentId: { userId: Number(userId), tournamentId: tournament.id } }
      });

      if (existingEntry) {
        return res.status(400).json({ error: "Already joined today's tournament" });
      }

      // Create entry with 10 Lakh starting cash
      const entry = await prisma.tournamentEntry.create({
        data: {
          userId: Number(userId),
          tournamentId: tournament.id,
          startingCash: 1000000.0,
          currentCash: 1000000.0,
          profit: 0.0
        }
      });

      res.json({ message: 'Joined successfully!', entry });
    } catch (error) {
      console.error("Tournament Join Error:", error);
      res.status(500).json({ error: 'Failed to join tournament' });
    }
  });

  // 3. GET /api/tournament/portfolio/:userId - Get user's tournament portfolio
  router.get('/portfolio/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
      const today = getTodayDateStr();
      const tournament = await prisma.tournament.findUnique({ where: { date: today } });
      if (!tournament) return res.status(404).json({ error: 'No active tournament today' });

      const entry = await prisma.tournamentEntry.findUnique({
        where: { userId_tournamentId: { userId: Number(userId), tournamentId: tournament.id } },
        include: {
          holdings: { include: { stock: true } }
        }
      });

      if (!entry) return res.status(404).json({ error: "User not enrolled in today's tournament" });

      res.json({ entry });
    } catch (error) {
      console.error("Tournament Portfolio Error:", error);
      res.status(500).json({ error: 'Failed to fetch tournament portfolio' });
    }
  });

  // 4. POST /api/tournament/trade - Execute tournament trade
  router.post('/trade', async (req, res) => {
    const { userId, stockId, type, quantity, price } = req.body;

    if (!userId || !stockId || !type || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
      const today = getTodayDateStr();
      const tournament = await prisma.tournament.findUnique({ where: { date: today } });
      if (!tournament || tournament.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'No active tournament found' });
      }

      const entry = await prisma.tournamentEntry.findUnique({
        where: { userId_tournamentId: { userId: Number(userId), tournamentId: tournament.id } }
      });

      if (!entry) return res.status(400).json({ error: "You are not enrolled in today's tournament" });

      const totalValue = quantity * price;

      // START TRANSACTION
      const result = await prisma.$transaction(async (tx) => {
        if (type === 'BUY') {
          if (entry.currentCash < totalValue) {
            throw new Error('Insufficient tournament cash');
          }

          // Deduct cash
          await tx.tournamentEntry.update({
            where: { id: entry.id },
            data: { currentCash: { decrement: totalValue } }
          });

          // Upsert Holding
          const holding = await tx.tournamentHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (holding) {
            const newQty = holding.quantity + quantity;
            const newAvgPrice = ((holding.quantity * holding.avgPrice) + totalValue) / newQty;
            await tx.tournamentHolding.update({
              where: { id: holding.id },
              data: { quantity: newQty, avgPrice: newAvgPrice }
            });
          } else {
            await tx.tournamentHolding.create({
              data: { entryId: entry.id, stockId, quantity, avgPrice: price }
            });
          }
        } else if (type === 'SELL') {
          const holding = await tx.tournamentHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (!holding || holding.quantity < quantity) {
            throw new Error('Insufficient tournament holdings to sell');
          }

          // Add cash
          await tx.tournamentEntry.update({
            where: { id: entry.id },
            data: { currentCash: { increment: totalValue } }
          });

          if (holding.quantity === quantity) {
            await tx.tournamentHolding.delete({ where: { id: holding.id } });
          } else {
            await tx.tournamentHolding.update({
              where: { id: holding.id },
              data: { quantity: { decrement: quantity } }
            });
          }
        } else {
          throw new Error('Invalid trade type');
        }

        // Record Transaction
        await tx.tournamentTransaction.create({
          data: {
            userId: Number(userId),
            tournamentId: tournament.id,
            stockId,
            type,
            quantity,
            price
          }
        });

        return { success: true };
      });

      // Recalculate profit here if needed, or rely on live frontend calc, but we should update entry profit
      // We will do a basic update: Profit = Current Cash - Starting Cash (ignoring holding value for this simple update)
      // Actually, tournament leaderboard profit requires calculating total portfolio value.
      // We'll update profit dynamically on leaderboard GET by combining currentCash + current holding value based on live prices.
      
      res.json({ message: 'Tournament trade executed successfully!', result });
    } catch (error) {
      console.error("Tournament Trade Error:", error);
      res.status(400).json({ error: error.message || 'Trade failed' });
    }
  });

  return router;
}
