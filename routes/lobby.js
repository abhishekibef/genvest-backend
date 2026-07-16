import express from 'express';

export function getLobbyRouter(prisma) {
  const router = express.Router();

  // Helper to generate a random 6-character uppercase code
  function generateLobbyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Helper to ensure lobby code is unique
  async function getUniqueLobbyCode() {
    let code;
    let exists = true;
    while (exists) {
      code = generateLobbyCode();
      const lobby = await prisma.privateLobby.findUnique({ where: { code } });
      if (!lobby) exists = false;
    }
    return code;
  }

  // 0. GET /api/lobby/public - Get public lobbies
  router.get('/public', async (req, res) => {
    try {
      const lobbies = await prisma.privateLobby.findMany({
        where: {
          isPublic: true,
          status: 'ACTIVE',
          endTime: { gt: new Date() }
        },
        include: {
          host: true,
          _count: {
            select: { entries: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const formatted = lobbies.map(l => ({
        id: l.id,
        code: l.code,
        name: l.name,
        startingCash: l.startingCash,
        startTime: l.startTime,
        endTime: l.endTime,
        status: l.status,
        hostName: l.host.name || l.host.email.split('@')[0],
        participantCount: l._count.entries,
        maxParticipants: l.maxParticipants,
        entryFee: l.entryFee
      }));
      res.json({ lobbies: formatted });
    } catch (error) {
      console.error('Fetch Public Lobbies Error:', error);
      res.status(500).json({ error: 'Failed to fetch public lobbies.' });
    }
  });

  // 1. POST /api/lobby/create - Create a private tournament lobby
  router.post('/create', async (req, res) => {
    const { hostId, name, startingCash, startTime, endTime, restrictNifty50, isPublic, maxParticipants, isRecurring, entryFee } = req.body;

    if (!hostId || !name || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required parameters: hostId, name, startTime, endTime' });
    }

    try {
      // Ensure host user exists
      const hostUser = await prisma.user.findUnique({ where: { id: Number(hostId) } });
      if (!hostUser) return res.status(404).json({ error: 'Host user not found' });

      const code = await getUniqueLobbyCode();

      // Create lobby
      const lobby = await prisma.privateLobby.create({
        data: {
          code,
          name,
          hostId: Number(hostId),
          startingCash: startingCash ? parseFloat(startingCash) : 1000000.0,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          status: 'ACTIVE',
          restrictNifty50: restrictNifty50 !== undefined ? Boolean(restrictNifty50) : true,
          isPublic: isPublic !== undefined ? Boolean(isPublic) : false,
          maxParticipants: maxParticipants ? Number(maxParticipants) : null,
          isRecurring: isRecurring !== undefined ? Boolean(isRecurring) : false,
          entryFee: entryFee ? parseFloat(entryFee) : 0
        }
      });

      // Automatically join the host as a participant
      await prisma.privateLobbyEntry.create({
        data: {
          lobbyId: lobby.id,
          userId: Number(hostId),
          startingCash: lobby.startingCash,
          currentCash: lobby.startingCash,
          profit: 0.0
        }
      });

      res.status(201).json({ message: 'Lobby created successfully!', lobby });
    } catch (error) {
      console.error('Lobby Create Error:', error);
      res.status(500).json({ error: 'Failed to create lobby' });
    }
  });

  // 2. POST /api/lobby/join - Join a private tournament lobby via invite code
  router.post('/join', async (req, res) => {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and Lobby Code are required' });
    }

    try {
      // Find lobby
      const lobby = await prisma.privateLobby.findUnique({
        where: { code: code.toUpperCase().trim() }
      });

      if (!lobby) {
        return res.status(404).json({ error: 'Lobby not found. Please check the code.' });
      }

      // Check if lobby is completed
      if (lobby.status === 'COMPLETED' || new Date(lobby.endTime) < new Date()) {
        return res.status(400).json({ error: 'This tournament lobby has already ended.' });
      }

      // Check maxParticipants
      if (lobby.maxParticipants) {
        const currentCount = await prisma.privateLobbyEntry.count({ where: { lobbyId: lobby.id } });
        if (currentCount >= lobby.maxParticipants) {
          return res.status(400).json({ error: 'This lobby is full.' });
        }
      }

      // Check if user exists
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Check if user is already enrolled
      const existingEntry = await prisma.privateLobbyEntry.findUnique({
        where: { userId_lobbyId: { userId: Number(userId), lobbyId: lobby.id } }
      });

      if (existingEntry) {
        return res.status(400).json({ error: 'You have already joined this lobby.' });
      }

      // If lobby has an entry fee, verify payment before joining
      if (lobby.entryFee && lobby.entryFee > 0) {
        const paidOrder = await prisma.order.findFirst({
          where: {
            userId: Number(userId),
            type: 'contest',
            status: 'paid',
            metadata: { contains: lobby.code },
          },
        });
        if (!paidOrder) {
          return res.status(402).json({
            error: 'This contest requires a paid entry fee. Please complete payment first.',
            entryFee: lobby.entryFee,
            lobbyCode: lobby.code,
          });
        }
      }

      // Create lobby entry
      const entry = await prisma.privateLobbyEntry.create({
        data: {
          lobbyId: lobby.id,
          userId: Number(userId),
          startingCash: lobby.startingCash,
          currentCash: lobby.startingCash,
          profit: 0.0
        }
      });

      res.status(200).json({ message: 'Joined lobby successfully!', entry, lobbyName: lobby.name });
    } catch (error) {
      console.error('Lobby Join Error:', error);
      res.status(500).json({ error: 'Failed to join lobby' });
    }
  });

  // 3. GET /api/lobby/my-lobbies/:userId - Get list of lobbies user is in
  router.get('/my-lobbies/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const joinedEntries = await prisma.privateLobbyEntry.findMany({
        where: { userId: Number(userId) },
        include: {
          lobby: {
            include: {
              host: true,
              entries: {
                include: { user: true }
              }
            }
          }
        }
      });

      const lobbies = joinedEntries.map(entry => {
        // Evaluate dynamic status
        const now = new Date();
        let currentStatus = entry.lobby.status;
        if (now > new Date(entry.lobby.endTime)) {
          currentStatus = 'COMPLETED';
        } else if (now < new Date(entry.lobby.startTime)) {
          currentStatus = 'UPCOMING';
        } else {
          currentStatus = 'ACTIVE';
        }

        return {
          id: entry.lobby.id,
          code: entry.lobby.code,
          name: entry.lobby.name,
          startingCash: entry.lobby.startingCash,
          startTime: entry.lobby.startTime,
          endTime: entry.lobby.endTime,
          status: currentStatus,
          hostName: entry.lobby.host.name || entry.lobby.host.email.split('@')[0],
          participantCount: entry.lobby.entries.length
        };
      });

      res.json({ lobbies });
    } catch (error) {
      console.error('Fetch My Lobbies Error:', error);
      res.status(500).json({ error: 'Failed to fetch your lobbies.' });
    }
  });

  // 4. GET /api/lobby/details/:code - Get specific lobby details
  router.get('/details/:code', async (req, res) => {
    const { code } = req.params;

    try {
      const lobby = await prisma.privateLobby.findUnique({
        where: { code: code.toUpperCase().trim() },
        include: {
          host: true,
          entries: {
            include: { user: true }
          }
        }
      });

      if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

      // Dynamic status evaluation
      const now = new Date();
      let dynamicStatus = lobby.status;
      if (now > new Date(lobby.endTime)) {
        dynamicStatus = 'COMPLETED';
      } else if (now < new Date(lobby.startTime)) {
        dynamicStatus = 'UPCOMING';
      } else {
        dynamicStatus = 'ACTIVE';
      }

      res.json({
        lobby: {
          id: lobby.id,
          code: lobby.code,
          name: lobby.name,
          startingCash: lobby.startingCash,
          startTime: lobby.startTime,
          endTime: lobby.endTime,
          status: dynamicStatus,
          hostId: lobby.hostId,
          hostName: lobby.host.name || lobby.host.email.split('@')[0]
        },
        participantsCount: lobby.entries.length
      });
    } catch (error) {
      console.error('Fetch Lobby Details Error:', error);
      res.status(500).json({ error: 'Failed to fetch lobby details.' });
    }
  });

  // 5. GET /api/lobby/portfolio/:code/:userId - Get isolated lobby portfolio for user
  router.get('/portfolio/:code/:userId', async (req, res) => {
    const { code, userId } = req.params;

    try {
      const lobby = await prisma.privateLobby.findUnique({
        where: { code: code.toUpperCase().trim() }
      });

      if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

      const entry = await prisma.privateLobbyEntry.findUnique({
        where: { userId_lobbyId: { userId: Number(userId), lobbyId: lobby.id } },
        include: {
          holdings: {
            include: { stock: true }
          }
        }
      });

      if (!entry) return res.status(404).json({ error: 'User is not enrolled in this lobby' });

      res.json({ entry });
    } catch (error) {
      console.error('Lobby Portfolio Error:', error);
      res.status(500).json({ error: 'Failed to fetch lobby portfolio.' });
    }
  });

  // 6. GET /api/lobby/leaderboard/:code - Get lobby leaderboard with dynamic profits
  router.get('/leaderboard/:code', async (req, res) => {
    const { code } = req.params;

    try {
      const lobby = await prisma.privateLobby.findUnique({
        where: { code: code.toUpperCase().trim() },
        include: {
          host: true,
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

      if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

      const entriesWithProfit = lobby.entries.map(entry => {
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
          currentCash: totalValue, // display total net worth
          profit: profit,
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
      let dynamicStatus = lobby.status;
      if (now > new Date(lobby.endTime)) {
        dynamicStatus = 'COMPLETED';
      } else if (now < new Date(lobby.startTime)) {
        dynamicStatus = 'UPCOMING';
      } else {
        dynamicStatus = 'ACTIVE';
      }

      res.json({
        lobby: {
          id: lobby.id,
          code: lobby.code,
          name: lobby.name,
          startingCash: lobby.startingCash,
          startTime: lobby.startTime,
          endTime: lobby.endTime,
          status: dynamicStatus,
          hostName: lobby.host.name || lobby.host.email.split('@')[0]
        },
        leaderboard
      });
    } catch (error) {
      console.error('Lobby Leaderboard Error:', error);
      res.status(500).json({ error: 'Failed to fetch lobby leaderboard.' });
    }
  });

  // 7. POST /api/lobby/trade - Execute trade inside lobby
  router.post('/trade', async (req, res) => {
    const { userId, code, stockId, type, quantity, price } = req.body;

    if (!userId || !code || !stockId || !type || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required trading parameters' });
    }

    try {
      const lobby = await prisma.privateLobby.findUnique({
        where: { code: code.toUpperCase().trim() }
      });

      if (!lobby) return res.status(404).json({ error: 'Lobby not found' });

      // Verify lobby is currently active
      const now = new Date();
      if (now < new Date(lobby.startTime) || now > new Date(lobby.endTime)) {
        return res.status(400).json({ error: 'Trading is only allowed while the tournament lobby is active.' });
      }

      if (lobby.restrictNifty50 && type === 'BUY') {
        const nifty50 = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'ITC', 'SBIN', 'BHARTIARTL', 'BAJFINANCE', 'LARSEN', 'HINDUNILVR', 'AXISBANK', 'KOTAKBANK', 'LT', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'TATAMOTORS', 'M&M', 'ASIANPAINT', 'NTPC', 'TATASTEEL', 'POWERGRID', 'BAJAJFINSV', 'HCLTECH', 'ADANIENT', 'ONGC', 'WIPRO', 'ADANIPORTS', 'NESTLEIND', 'GRASIM', 'JSWSTEEL', 'TECHM', 'HINDALCO', 'TATACONSUM', 'BRITANNIA', 'CIPLA', 'INDUSINDBK', 'APOLLOHOSP', 'EICHERMOT', 'DIVISLAB', 'DRREDDY', 'COALINDIA', 'BAJAJ-AUTO', 'HEROMOTOCO', 'UPL', 'BPCL', 'SBILIFE', 'HDFCLIFE'];
        if (!nifty50.includes(stockId.toUpperCase())) {
          return res.status(400).json({ error: 'This contest restricts buying to Nifty 50 stocks only.' });
        }
      }

      const entry = await prisma.privateLobbyEntry.findUnique({
        where: { userId_lobbyId: { userId: Number(userId), lobbyId: lobby.id } }
      });

      if (!entry) return res.status(400).json({ error: 'You are not enrolled in this tournament lobby' });

      const totalValue = quantity * price;

      // Start transaction
      const result = await prisma.$transaction(async (tx) => {
        if (type === 'BUY') {
          if (entry.currentCash < totalValue) {
            throw new Error('Insufficient lobby cash balance');
          }

          // Deduct cash
          await tx.privateLobbyEntry.update({
            where: { id: entry.id },
            data: { currentCash: { decrement: totalValue } }
          });

          // Upsert Holding
          const holding = await tx.privateLobbyHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (holding) {
            const newQty = holding.quantity + quantity;
            const newAvgPrice = ((holding.quantity * holding.avgPrice) + totalValue) / newQty;
            await tx.privateLobbyHolding.update({
              where: { id: holding.id },
              data: { quantity: newQty, avgPrice: newAvgPrice }
            });
          } else {
            await tx.privateLobbyHolding.create({
              data: { entryId: entry.id, stockId, quantity, avgPrice: price }
            });
          }
        } else if (type === 'SELL') {
          const holding = await tx.privateLobbyHolding.findUnique({
            where: { entryId_stockId: { entryId: entry.id, stockId } }
          });

          if (!holding || holding.quantity < quantity) {
            throw new Error('Insufficient holdings inside this lobby to sell');
          }

          // Add cash
          await tx.privateLobbyEntry.update({
            where: { id: entry.id },
            data: { currentCash: { increment: totalValue } }
          });

          if (holding.quantity === quantity) {
            await tx.privateLobbyHolding.delete({ where: { id: holding.id } });
          } else {
            await tx.privateLobbyHolding.update({
              where: { id: holding.id },
              data: { quantity: { decrement: quantity } }
            });
          }
        } else {
          throw new Error('Invalid trade type');
        }

        // Record Transaction
        await tx.privateLobbyTransaction.create({
          data: {
            lobbyId: lobby.id,
            userId: Number(userId),
            stockId,
            type,
            quantity,
            price
          }
        });

        return { success: true };
      });

      res.json({ message: 'Lobby trade executed successfully!', result });
    } catch (error) {
      console.error('Lobby Trade Error:', error);
      res.status(400).json({ error: error.message || 'Lobby trade execution failed' });
    }
  });

  return router;
}
