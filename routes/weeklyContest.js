import express from 'express';

export function getWeeklyContestRouter(prisma) {
  const router = express.Router();

  // Helper to get current week start (Monday 00:00:00) and end (Sunday 23:59:59)
  const getCurrentWeekRange = () => {
    const now = new Date();
    // getDay() is 0 (Sun) to 6 (Sat). We want Monday to be start.
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  };

  // 1. GET /current - Get active batch(es) for this week
  router.get('/current', async (req, res) => {
    try {
      const { weekStart, weekEnd } = getCurrentWeekRange();
      
      const contests = await prisma.weeklyContest.findMany({
        where: {
          weekStart: weekStart,
          weekEnd: weekEnd,
          status: 'ACTIVE'
        },
        include: {
          _count: {
            select: { entries: true }
          }
        },
        orderBy: { batchNumber: 'asc' }
      });

      res.json({ contests });
    } catch (error) {
      console.error('Fetch Current Weekly Contest Error:', error);
      res.status(500).json({ error: 'Failed to fetch weekly contests.' });
    }
  });

  // 2. POST /join - Join the current open batch
  router.post('/join', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    try {
      const { weekStart, weekEnd } = getCurrentWeekRange();
      
      // Prevent joining if it's already past Sunday 11:59 (should be handled by weekEnd, but safe check)
      if (new Date() > weekEnd) {
        return res.status(400).json({ error: 'This week’s contest is closed.' });
      }

      // Check if user already joined ANY batch this week
      const existingEntry = await prisma.weeklyContestEntry.findFirst({
        where: {
          userId: Number(userId),
          contest: {
            weekStart: weekStart,
            weekEnd: weekEnd
          }
        }
      });

      if (existingEntry) {
        return res.status(400).json({ error: 'You have already joined this week’s contest.' });
      }

      // Find the latest open batch
      let currentContest = await prisma.weeklyContest.findFirst({
        where: {
          weekStart: weekStart,
          status: 'ACTIVE'
        },
        orderBy: { batchNumber: 'desc' },
        include: {
          _count: { select: { entries: true } }
        }
      });

      // If no contest exists, create Batch 1
      if (!currentContest) {
        currentContest = await prisma.weeklyContest.create({
          data: {
            weekStart,
            weekEnd,
            batchNumber: 1,
            status: 'ACTIVE',
            maxSlots: 100
          },
          include: { _count: { select: { entries: true } } }
        });
      } else if (currentContest._count.entries >= currentContest.maxSlots) {
        // If current batch is full, create the next batch
        currentContest = await prisma.weeklyContest.create({
          data: {
            weekStart,
            weekEnd,
            batchNumber: currentContest.batchNumber + 1,
            status: 'ACTIVE',
            maxSlots: 100
          },
          include: { _count: { select: { entries: true } } }
        });
      }

      // Join the contest
      const entry = await prisma.weeklyContestEntry.create({
        data: {
          contestId: currentContest.id,
          userId: Number(userId),
          startingCash: 1000000.0,
          currentCash: 1000000.0,
          profit: 0.0
        }
      });

      res.status(200).json({ message: 'Joined weekly contest successfully!', entry, batchNumber: currentContest.batchNumber });
    } catch (error) {
      console.error('Weekly Contest Join Error:', error);
      res.status(500).json({ error: 'Failed to join weekly contest' });
    }
  });

  // 3. GET /my-entry/:userId - Get user's active weekly contest entry
  router.get('/my-entry/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
      const { weekStart, weekEnd } = getCurrentWeekRange();

      const entry = await prisma.weeklyContestEntry.findFirst({
        where: {
          userId: Number(userId),
          contest: {
            weekStart: weekStart,
            weekEnd: weekEnd
          }
        },
        include: {
          contest: true,
          holdings: {
            include: { stock: true }
          }
        }
      });

      if (!entry) return res.status(404).json({ error: 'User is not enrolled in this week’s contest.' });

      res.json({ entry });
    } catch (error) {
      console.error('Weekly Contest Entry Error:', error);
      res.status(500).json({ error: 'Failed to fetch weekly contest entry.' });
    }
  });

  // 4. GET /leaderboard/:contestId - Get leaderboard for a specific batch
  router.get('/leaderboard/:contestId', async (req, res) => {
    const { contestId } = req.params;

    try {
      const contest = await prisma.weeklyContest.findUnique({
        where: { id: Number(contestId) },
        include: {
          entries: {
            include: {
              user: true,
              holdings: {
                include: { stock: true }
              }
            }
          }
        }
      });

      if (!contest) return res.status(404).json({ error: 'Contest not found' });

      const entriesWithProfit = contest.entries.map(entry => {
        let holdingsValue = 0;
        if (entry.holdings && entry.holdings.length > 0) {
          holdingsValue = entry.holdings.reduce((sum, h) => {
            const currentPrice = h.stock?.price || h.avgPrice;
            return sum + (h.quantity * currentPrice);
          }, 0);
        }
        const totalValue = entry.currentCash + holdingsValue;
        const profit = totalValue - entry.startingCash;

        return {
          userId: entry.userId,
          username: entry.user.name || entry.user.username || entry.user.email.split('@')[0] || `Trader${entry.userId}`,
          currentCash: totalValue, // Net worth
          profit: profit,
          totalXP: entry.user.totalXP,
          qualifiesForPrize: entry.user.totalXP >= 300,
          cashPrizeWon: entry.cashPrizeWon,
          joinedAt: entry.joinedAt
        };
      });

      // Sort by profit descending
      entriesWithProfit.sort((a, b) => b.profit - a.profit);

      const leaderboard = entriesWithProfit.map((entry, index) => ({
        rank: index + 1,
        ...entry
      }));

      // Dynamic status evaluation
      const now = new Date();
      let dynamicStatus = contest.status;
      if (now > new Date(contest.weekEnd)) {
        dynamicStatus = 'COMPLETED';
      }

      res.json({
        contest: {
          id: contest.id,
          batchNumber: contest.batchNumber,
          weekStart: contest.weekStart,
          weekEnd: contest.weekEnd,
          status: dynamicStatus,
          maxSlots: contest.maxSlots,
          participantsCount: contest.entries.length
        },
        leaderboard
      });
    } catch (error) {
      console.error('Weekly Contest Leaderboard Error:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
  });

  // 5. POST /trade - Execute a trade in the weekly contest
  router.post('/trade', async (req, res) => {
    const { userId, contestId, stockId, type, quantity, price } = req.body;

    if (!userId || !contestId || !stockId || !type || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required trading parameters' });
    }

    try {
      const contest = await prisma.weeklyContest.findUnique({
        where: { id: Number(contestId) }
      });

      if (!contest) return res.status(404).json({ error: 'Contest not found' });

      // Verify contest is currently active
      const now = new Date();
      if (now > new Date(contest.weekEnd)) {
        return res.status(400).json({ error: 'This week’s contest has ended.' });
      }

      const entry = await prisma.weeklyContestEntry.findUnique({
        where: { userId_contestId: { userId: Number(userId), contestId: contest.id } }
      });

      if (!entry) return res.status(400).json({ error: 'You are not enrolled in this contest' });

      const totalValue = quantity * price;

      // Start transaction
      const result = await prisma.$transaction(async (tx) => {
        if (type === 'BUY') {
          if (entry.currentCash < totalValue) {
            throw new Error('Insufficient contest cash balance');
          }

          // Deduct cash
          await tx.weeklyContestEntry.update({
            where: { id: entry.id },
            data: { currentCash: { decrement: totalValue } }
          });

          // Upsert Holding
          const holding = await tx.weeklyContestHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (holding) {
            const newQty = holding.quantity + quantity;
            const newAvgPrice = ((holding.quantity * holding.avgPrice) + totalValue) / newQty;
            await tx.weeklyContestHolding.update({
              where: { id: holding.id },
              data: { quantity: newQty, avgPrice: newAvgPrice }
            });
          } else {
            await tx.weeklyContestHolding.create({
              data: { entryId: entry.id, stockId, quantity, avgPrice: price }
            });
          }
        } else if (type === 'SELL') {
          const holding = await tx.weeklyContestHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (!holding || holding.quantity < quantity) {
            throw new Error('Insufficient contest holdings to sell');
          }

          // Add cash
          await tx.weeklyContestEntry.update({
            where: { id: entry.id },
            data: { currentCash: { increment: totalValue } }
          });

          if (holding.quantity === quantity) {
            await tx.weeklyContestHolding.delete({ where: { id: holding.id } });
          } else {
            await tx.weeklyContestHolding.update({
              where: { id: holding.id },
              data: { quantity: { decrement: quantity } }
            });
          }
        } else {
          throw new Error('Invalid trade type');
        }

        // Record Transaction
        await tx.weeklyContestTransaction.create({
          data: {
            contestId: contest.id,
            userId: Number(userId),
            stockId,
            type,
            quantity,
            price
          }
        });

        return { success: true };
      });

      res.json({ message: 'Contest trade executed successfully!', result });
    } catch (error) {
      console.error('Weekly Contest Trade Error:', error);
      res.status(400).json({ error: error.message || 'Contest trade execution failed' });
    }
  });

  return router;
}
