import express from 'express';

export function getIntradayRouter(prisma) {
  const router = express.Router();

  router.post('/intraday/open', async (req, res) => {
    try {
      const { userId, symbol, type, quantity, price } = req.body;
      
      if (!['LONG', 'SHORT'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type, must be LONG or SHORT' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const requiredMargin = (price * quantity) / 5;
      if (user.cash < requiredMargin) {
        return res.status(400).json({ error: 'Insufficient funds for intraday margin' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { cash: user.cash - requiredMargin }
      });

      let stock = await prisma.stock.findUnique({ where: { id: symbol } });
      if (!stock) {
        stock = await prisma.stock.create({
          data: {
            id: symbol,
            name: symbol,
            sector: 'Unknown',
            price,
            prevPrice: price,
            volatility: 'MEDIUM',
            description: 'Created automatically',
            reason: ''
          }
        });
      }

      const position = await prisma.intradayPosition.create({
        data: {
          userId,
          stockId: symbol,
          type,
          quantity,
          entryPrice: price,
          marginUsed: requiredMargin,
          status: 'OPEN'
        }
      });

      res.json(position);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/intraday/exit', async (req, res) => {
    try {
      const { userId, positionId, exitPrice } = req.body;

      const position = await prisma.intradayPosition.findUnique({ where: { id: positionId } });
      if (!position) return res.status(404).json({ error: 'Position not found' });
      if (position.userId !== userId) return res.status(403).json({ error: 'Unauthorized' });
      if (position.status !== 'OPEN') return res.status(400).json({ error: 'Position already closed' });

      let pnl = 0;
      if (position.type === 'LONG') {
        pnl = (exitPrice - position.entryPrice) * position.quantity;
      } else {
        pnl = (position.entryPrice - exitPrice) * position.quantity;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { cash: user.cash + position.marginUsed + pnl }
      });

      const updatedPosition = await prisma.intradayPosition.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          exitPrice,
          pnl,
          closedAt: new Date()
        }
      });

      res.json(updatedPosition);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/intraday/positions/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const positions = await prisma.intradayPosition.findMany({
        where: { userId: Number(userId) },
        orderBy: { openedAt: 'desc' },
        take: 50
      });
      res.json(positions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
