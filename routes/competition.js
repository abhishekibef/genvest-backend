import express from 'express';

export function getCompetitionRouter(prisma) {
  const router = express.Router();

  const getTodayDateStr = () => new Date().toISOString().split('T')[0];

  // 1. Get today's competition standings (delegates to tournament)
  router.get('/today', async (req, res) => {
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
        return res.json({ prizePool: '🏆 Virtual Trophy + Badge', topEntries: [] });
      }

      const topEntries = tournament.entries.map(entry => ({
        userId: entry.userId,
        userName: entry.user.username || entry.user.name || `Trader${entry.userId}`,
        profit: entry.profit
      }));

      res.status(200).json({
        prizePool: '🏆 Virtual Trophy + Badge',
        topEntries
      });
    } catch (error) {
      console.error('❌ Failed to retrieve daily competition:', error);
      res.status(500).json({ error: 'Failed to retrieve daily competition' });
    }
  });

  // 2. Join today's competition (delegates to tournament join)
  router.post('/join', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId!' });
    }

    try {
      const today = getTodayDateStr();
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      // Upsert today's tournament
      const tournament = await prisma.tournament.upsert({
        where: { date: today },
        update: {},
        create: { date: today, status: 'ACTIVE' }
      });

      // Check if already joined
      const existingEntry = await prisma.tournamentEntry.findUnique({
        where: {
          userId_tournamentId: {
            userId: Number(userId),
            tournamentId: tournament.id
          }
        }
      });

      if (existingEntry) {
        return res.status(200).json({ success: true, message: 'Already joined today\'s competition!' });
      }

      // Join
      await prisma.tournamentEntry.create({
        data: {
          userId: Number(userId),
          tournamentId: tournament.id,
          startingCash: 1000000.0,
          currentCash: 1000000.0,
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
