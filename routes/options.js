import express from 'express';
import { generateOptionChain, getNextWeeklyExpiry, blackScholesPrice, INDEX_CONFIG } from '../blackScholes.js';

// In-memory spot price cache — updated by the cron or manually via API
const spotCache = {
  NIFTY: { price: 24520, change: 45.20, changePercent: 0.18, updatedAt: Date.now() },
  BANKNIFTY: { price: 51200, change: -120.50, changePercent: -0.23, updatedAt: Date.now() }
};

export function getOptionsRouter(prisma) {
  const router = express.Router();

  const getSpotPrice = (underlying) => {
    return spotCache[underlying]?.price || (underlying === 'NIFTY' ? 24520 : 51200);
  };

  router.get('/options/chain/:underlying', (req, res) => {
    try {
      const { underlying } = req.params;
      if (!['NIFTY', 'BANKNIFTY'].includes(underlying)) {
        return res.status(400).json({ error: 'Invalid underlying' });
      }

      const expiry = req.query.expiry || getNextWeeklyExpiry();
      const spotPrice = getSpotPrice(underlying);

      const chain = generateOptionChain(underlying, spotPrice, expiry);
      res.json(chain);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/options/spot-prices', (req, res) => {
    try {
      const nifty = spotCache['NIFTY'] || { price: 24520, change: 0, changePercent: 0 };
      const banknifty = spotCache['BANKNIFTY'] || { price: 51200, change: 0, changePercent: 0 };
      
      res.json({
        NIFTY: nifty,
        BANKNIFTY: banknifty
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/options/buy', async (req, res) => {
    try {
      const { userId, underlying, strikePrice, optionType, expiryDate, lots } = req.body;
      if (!['NIFTY', 'BANKNIFTY'].includes(underlying)) {
        return res.status(400).json({ error: 'Invalid underlying' });
      }

      const config = INDEX_CONFIG[underlying];
      const spotPrice = getSpotPrice(underlying);
      
      const expiry = new Date(expiryDate);
      const now = new Date();
      const daysToExpiry = Math.max(0, (expiry - now) / (1000 * 60 * 60 * 24));
      
      const { premium } = blackScholesPrice(spotPrice, strikePrice, daysToExpiry, config.iv, 0.065, optionType);
      
      const totalCost = premium * config.lotSize * lots;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.cash < totalCost) {
        return res.status(400).json({ error: 'Insufficient funds for options trade' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { cash: user.cash - totalCost }
      });

      const position = await prisma.optionPosition.create({
        data: {
          userId,
          underlying,
          strikePrice,
          optionType,
          expiryDate: expiry,
          lots,
          lotSize: config.lotSize,
          buyPremium: premium,
          totalCost,
          status: 'OPEN'
        }
      });

      res.json(position);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/options/exit', async (req, res) => {
    try {
      const { userId, positionId } = req.body;
      const position = await prisma.optionPosition.findUnique({ where: { id: positionId } });
      
      if (!position) return res.status(404).json({ error: 'Position not found' });
      if (position.userId !== userId) return res.status(403).json({ error: 'Unauthorized' });
      if (position.status !== 'OPEN') return res.status(400).json({ error: 'Position already closed' });

      const config = INDEX_CONFIG[position.underlying];
      const spotPrice = getSpotPrice(position.underlying);
      
      const expiry = new Date(position.expiryDate);
      const now = new Date();
      const daysToExpiry = Math.max(0, (expiry - now) / (1000 * 60 * 60 * 24));

      const { premium: currentPremium } = blackScholesPrice(
        spotPrice, 
        position.strikePrice, 
        daysToExpiry, 
        config.iv, 
        0.065, 
        position.optionType
      );

      const pnl = (currentPremium - position.buyPremium) * position.lots * position.lotSize;
      
      const user = await prisma.user.findUnique({ where: { id: userId } });
      
      const amountToCredit = (currentPremium * position.lots * position.lotSize);
      
      await prisma.user.update({
        where: { id: userId },
        data: { cash: user.cash + amountToCredit }
      });

      const updatedPosition = await prisma.optionPosition.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          exitPremium: currentPremium,
          pnl,
          closedAt: new Date()
        }
      });

      res.json(updatedPosition);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/options/positions/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const positions = await prisma.optionPosition.findMany({
        where: { userId: Number(userId) },
        orderBy: { openedAt: 'desc' },
        take: 50
      });

      const enrichedPositions = positions.map(pos => {
        if (pos.status === 'OPEN') {
          const config = INDEX_CONFIG[pos.underlying];
          const spotPrice = getSpotPrice(pos.underlying);
          
          const expiry = new Date(pos.expiryDate);
          const now = new Date();
          const daysToExpiry = Math.max(0, (expiry - now) / (1000 * 60 * 60 * 24));

          const { premium: currentPremium } = blackScholesPrice(
            spotPrice, 
            pos.strikePrice, 
            daysToExpiry, 
            config.iv, 
            0.065, 
            pos.optionType
          );

          return {
            ...pos,
            currentPremium,
            livePnl: (currentPremium - pos.buyPremium) * pos.lots * pos.lotSize
          };
        }
        return pos;
      });

      res.json(enrichedPositions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
