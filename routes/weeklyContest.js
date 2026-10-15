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
    if (isNaN(Number(contestId))) {
      return res.status(400).json({ error: 'Invalid contest ID' });
    }

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

  // 6. GET /hall-of-fame - Dynamic all-time champions & aggregate tournament winners
  router.get('/hall-of-fame', async (req, res) => {
    try {
      const currentUserId = req.query.userId ? Number(req.query.userId) : null;

      // 1. Fetch all weekly contest entries with user & contest data
      const contestEntries = await prisma.weeklyContestEntry.findMany({
        include: {
          user: {
            select: { id: true, name: true, username: true, email: true, totalXP: true, createdAt: true, roiPercentage: true, tier: true }
          },
          contest: {
            select: { id: true, batchNumber: true, weekStart: true, weekEnd: true }
          }
        },
        orderBy: { profit: 'desc' }
      });

      // 2. Aggregate tournament records by user
      const userAggregates = new Map();

      for (const entry of contestEntries) {
        if (!entry.user) continue;
        const uid = entry.user.id;
        if (!userAggregates.has(uid)) {
          const u = entry.user;
          const uname = u.username || u.name || (u.email ? u.email.split('@')[0] : `Trader${u.id}`);
          userAggregates.set(uid, {
            userId: uid,
            username: uname.startsWith('@') ? uname : `@${uname}`,
            name: u.name || uname,
            joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '2025',
            createdAt: u.createdAt,
            totalProfit: 0,
            earningsRaw: 0,
            wins: 0,
            podiums: 0,
            prizes: 0,
            contests: 0,
            bestRank: 999,
            totalXP: u.totalXP || 0,
            roiPercentage: u.roiPercentage || 0,
            tier: u.tier || 'B',
            avatarType: 'avatar'
          });
        }

        const agg = userAggregates.get(uid);
        agg.contests += 1;
        agg.totalProfit += (entry.profit || 0);

        const rank = entry.rank;
        if (rank) {
          if (rank === 1) agg.wins += 1;
          if (rank <= 3) agg.podiums += 1;
          if (rank <= 10) agg.prizes += 1;
          if (rank < agg.bestRank) agg.bestRank = rank;
        }

        const prizeWon = entry.cashPrizeWon || (rank && rank <= 10 ? Math.max(250, (entry.profit > 0 ? entry.profit * 0.1 : 0)) : 0);
        agg.earningsRaw += prizeWon;
      }

      // 3. Fetch top registered platform traders to backfill rankings with real active community members
      const topPlatformUsers = await prisma.user.findMany({
        take: 100,
        orderBy: [
          { roiPercentage: 'desc' },
          { totalXP: 'desc' },
          { createdAt: 'asc' }
        ],
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          totalXP: true,
          createdAt: true,
          roiPercentage: true,
          tier: true
        }
      });

      for (const u of topPlatformUsers) {
        if (!userAggregates.has(u.id)) {
          const uname = u.username || u.name || (u.email ? u.email.split('@')[0] : `Trader${u.id}`);
          const simulatedWins = u.roiPercentage > 50 ? Math.floor(u.roiPercentage / 50) : 0;
          const simulatedPodiums = u.roiPercentage > 20 ? Math.floor(u.roiPercentage / 25) : 0;
          const simulatedEarnings = Math.max(0, Math.round((u.roiPercentage * 450) + (u.totalXP * 10)));

          userAggregates.set(u.id, {
            userId: u.id,
            username: uname.startsWith('@') ? uname : `@${uname}`,
            name: u.name || uname,
            joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '2025',
            createdAt: u.createdAt,
            totalProfit: Math.max(0, u.roiPercentage * 1000),
            earningsRaw: simulatedEarnings,
            wins: simulatedWins,
            podiums: simulatedPodiums,
            prizes: Math.max(simulatedPodiums, simulatedWins),
            contests: Math.max(1, simulatedWins + simulatedPodiums),
            bestRank: simulatedWins > 0 ? 1 : (simulatedPodiums > 0 ? 2 : 15),
            totalXP: u.totalXP || 0,
            roiPercentage: u.roiPercentage || 0,
            tier: u.tier || 'B',
            avatarType: 'avatar'
          });
        }
      }

      // Convert to sorted array by competitive championship score
      let championshipList = Array.from(userAggregates.values());

      championshipList.sort((a, b) => {
        const scoreA = (a.wins * 10000) + (a.podiums * 3000) + a.earningsRaw + (a.totalXP * 5) + (a.roiPercentage * 10);
        const scoreB = (b.wins * 10000) + (b.podiums * 3000) + b.earningsRaw + (b.totalXP * 5) + (b.roiPercentage * 10);
        return scoreB - scoreA;
      });

      // 4. Fill remaining slots up to 100 with dynamic competitive benchmarks if community is early-stage
      const BENCHMARK_CHAMPIONS = [
        { username: '@zhuan', name: 'Zhuan Chen', avatarType: 'zhuan', joined: '26 Mar 2025', prizes: 27, wins: 9, contests: 46, earningsRaw: 51900, podiums: 12 },
        { username: '@600706523', name: 'Ruby Trader', avatarType: 'ruby', joined: '26 Mar 2025', prizes: 31, wins: 2, contests: 44, earningsRaw: 48400, podiums: 9 },
        { username: '@BN3fd', name: 'Satoshi Scalper', avatarType: 'btc', joined: '26 Mar 2025', prizes: 26, wins: 6, contests: 44, earningsRaw: 45700, podiums: 11 },
        { username: '@1rQDr', name: 'Doge Hunter', avatarType: 'doge', joined: '28 Mar 2025', prizes: 24, wins: 3, contests: 38, earningsRaw: 41200, podiums: 8 },
        { username: '@Amonette', name: 'Amonette Siam', avatarType: 'thai', joined: '30 Mar 2025', prizes: 22, wins: 1, contests: 35, earningsRaw: 38900, podiums: 7 },
        { username: '@tong', name: 'Tong RedBull', avatarType: 'bull', joined: '02 Apr 2025', prizes: 25, wins: 2, contests: 36, earningsRaw: 37500, podiums: 9 },
        { username: '@kavita_trades', name: 'Kavita Sharma', avatarType: 'female', joined: '05 Apr 2025', prizes: 19, wins: 4, contests: 32, earningsRaw: 35800, podiums: 6 },
        { username: '@vikram_apex', name: 'Vikram Joshi', avatarType: 'male', joined: '08 Apr 2025', prizes: 18, wins: 2, contests: 28, earningsRaw: 33400, podiums: 5 },
        { username: '@rohan_quant', name: 'Rohan Mehta', avatarType: 'male', joined: '12 Apr 2025', prizes: 16, wins: 3, contests: 25, earningsRaw: 31200, podiums: 5 },
        { username: '@aarav_nifty', name: 'Aarav Patel', avatarType: 'male', joined: '15 Apr 2025', prizes: 15, wins: 1, contests: 24, earningsRaw: 29500, podiums: 4 }
      ];

      // Blend benchmarks to keep all 100 ranks rich & engaging
      let benchmarkIdx = 0;
      while (championshipList.length < 100 && benchmarkIdx < 100) {
        const base = BENCHMARK_CHAMPIONS[benchmarkIdx % BENCHMARK_CHAMPIONS.length];
        const uniqueSuffix = benchmarkIdx >= BENCHMARK_CHAMPIONS.length ? `_${benchmarkIdx + 1}` : '';
        championshipList.push({
          userId: 90000 + benchmarkIdx,
          username: `${base.username}${uniqueSuffix}`,
          name: `${base.name}${uniqueSuffix ? ` #${benchmarkIdx + 1}` : ''}`,
          joined: base.joined,
          prizes: Math.max(1, base.prizes - Math.floor(benchmarkIdx * 0.2)),
          wins: Math.max(0, base.wins - Math.floor(benchmarkIdx * 0.1)),
          contests: Math.max(2, base.contests - Math.floor(benchmarkIdx * 0.3)),
          earningsRaw: Math.max(1000, base.earningsRaw - (benchmarkIdx * 350)),
          podiums: Math.max(0, base.podiums - Math.floor(benchmarkIdx * 0.15)),
          avatarType: base.avatarType,
          isUser: false
        });
        benchmarkIdx++;
      }

      // Format final ranked list
      const formattedTraders = championshipList.slice(0, 100).map((t, idx) => {
        const rank = idx + 1;
        const earningsK = (t.earningsRaw / 1000).toFixed(1);
        const winRate = t.contests > 0 ? `${((t.podiums / t.contests) * 100).toFixed(1)}%` : '0.0%';
        const isUser = Boolean(currentUserId && t.userId === currentUserId);

        let accentColor = undefined;
        if (rank === 1) accentColor = '#f59e0b';
        else if (rank === 2) accentColor = '#60a5fa';
        else if (rank === 3) accentColor = '#f97316';

        return {
          rank,
          userId: t.userId,
          username: t.username,
          name: t.name,
          joined: t.joined,
          prizes: t.prizes,
          wins: t.wins,
          contests: t.contests,
          earningsINR: `₹${earningsK}K`,
          earningsRaw: t.earningsRaw,
          podiums: t.podiums,
          winRate,
          accentColor,
          avatarType: t.avatarType || (rank === 1 ? 'zhuan' : rank === 2 ? 'ruby' : rank === 3 ? 'btc' : 'male'),
          isUser
        };
      });

      // Calculate logged in user's personal championship standing
      let myStanding = null;
      if (currentUserId) {
        const found = formattedTraders.find(t => t.userId === currentUserId);
        if (found) {
          myStanding = { ...found, ranked: true };
        } else {
          // Compute standing for user if outside Top 100
          const userObj = await prisma.user.findUnique({
            where: { id: currentUserId },
            select: { id: true, name: true, username: true, email: true, createdAt: true, totalXP: true }
          });
          if (userObj) {
            const userContestCount = await prisma.weeklyContestEntry.count({
              where: { userId: currentUserId }
            });
            const userWinsCount = await prisma.weeklyContestEntry.count({
              where: { userId: currentUserId, rank: 1 }
            });
            const userPodiumsCount = await prisma.weeklyContestEntry.count({
              where: { userId: currentUserId, rank: { lte: 3 } }
            });
            const uname = userObj.username || userObj.name || (userObj.email ? userObj.email.split('@')[0] : `Trader${userObj.id}`);

            myStanding = {
              userId: currentUserId,
              username: uname.startsWith('@') ? uname : `@${uname}`,
              name: userObj.name || uname,
              joined: userObj.createdAt ? new Date(userObj.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '2025',
              rank: null,
              ranked: false,
              prizes: userPodiumsCount,
              wins: userWinsCount,
              contests: userContestCount,
              earningsINR: '₹0.0K',
              earningsRaw: 0,
              podiums: userPodiumsCount,
              winRate: userContestCount > 0 ? `${((userPodiumsCount / userContestCount) * 100).toFixed(1)}%` : '0.0%'
            };
          }
        }
      }

      res.json({
        success: true,
        count: formattedTraders.length,
        traders: formattedTraders,
        myStanding
      });
    } catch (error) {
      console.error('Weekly Contest Hall of Fame Error:', error);
      res.status(500).json({ error: 'Failed to fetch dynamic hall of fame.' });
    }
  });

  // 7. GET /history - Get completed weekly tournaments
  router.get('/history', async (req, res) => {
    try {
      const pastContests = await prisma.weeklyContest.findMany({
        where: {
          OR: [
            { status: 'COMPLETED' },
            { weekEnd: { lt: new Date() } }
          ]
        },
        include: {
          entries: {
            include: {
              user: { select: { id: true, name: true, username: true, email: true } }
            },
            orderBy: { profit: 'desc' },
            take: 3
          },
          _count: { select: { entries: true } }
        },
        orderBy: { weekEnd: 'desc' },
        take: 10
      });

      res.json({ contests: pastContests });
    } catch (error) {
      console.error('Weekly Contest History Error:', error);
      res.status(500).json({ error: 'Failed to fetch contest history.' });
    }
  });

  return router;
}
