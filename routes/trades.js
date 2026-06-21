import express from 'express';

export function getTradesRouter(prisma) {
  const router = express.Router();

  // Buy stock (arbitrary symbol search support)
  router.post('/buy', async (req, res) => {
    const { userId, symbol, quantity, price } = req.body;

    if (!userId || !symbol || !quantity || quantity <= 0 || !price || price <= 0) {
      return res.status(400).json({ error: 'Missing trade parameters or invalid quantity/price!' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found!' });

      const currentPrice = Number(price);
      const tradeCost = currentPrice * quantity;

      if (user.cash < tradeCost) {
        return res.status(400).json({
          error: `Insufficient virtual cash! You need ₹${tradeCost.toLocaleString('en-IN')} but only have ₹${user.cash.toLocaleString('en-IN')}.`
        });
      }

      // Check if stock exists in db. If not, dynamically insert it.
      let stock = await prisma.stock.findUnique({ where: { id: symbol.toUpperCase() } });
      if (!stock) {
        stock = await prisma.stock.create({
          data: {
            id: symbol.toUpperCase(),
            name: symbol.toUpperCase(),
            sector: 'Other',
            price: currentPrice,
            prevPrice: currentPrice,
            volatility: 'MEDIUM',
            description: 'Indian Stock Market Equity',
            reason: 'Traded by user'
          }
        });
      } else {
        // update the price
        stock = await prisma.stock.update({
          where: { id: symbol.toUpperCase() },
          data: { price: currentPrice }
        });
      }

      // Deduct Cash and Log Transaction
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { cash: Math.max(0, Math.round((user.cash - tradeCost) * 100) / 100) }
      });

      // Add/Update Holding
      const existingHolding = await prisma.holding.findUnique({
        where: { userId_stockId: { userId: user.id, stockId: stock.id } }
      });

      if (existingHolding) {
        const newQty = existingHolding.quantity + quantity;
        const newAvgPrice = Math.round(((existingHolding.avgPrice * existingHolding.quantity) + (currentPrice * quantity)) / newQty * 100) / 100;
        
        await prisma.holding.update({
          where: { id: existingHolding.id },
          data: { quantity: newQty, avgPrice: newAvgPrice }
        });
      } else {
        await prisma.holding.create({
          data: {
            userId: user.id,
            stockId: stock.id,
            quantity: quantity,
            avgPrice: currentPrice
          }
        });
      }

      await prisma.transaction.create({
        data: {
          userId: user.id,
          stockId: stock.id,
          type: 'BUY',
          quantity: quantity,
          price: currentPrice
        }
      });

      return res.status(200).json({
        message: 'Trade executed successfully! 🚀',
        transaction: {
          stockId: stock.id,
          type: 'BUY',
          quantity,
          price: currentPrice,
          totalCost: tradeCost
        },
        feedback: {
          stockName: stock.name,
          volatility: stock.volatility,
          reason: stock.reason,
          warning: null
        }
      });

    } catch (error) {
      console.error('❌ Buy execution failed:', error);
      res.status(500).json({ error: 'Buy trade failed. Please try again!' });
    }
  });

  // Sell stock (arbitrary symbol search support)
  router.post('/sell', async (req, res) => {
    const { userId, symbol, quantity, price } = req.body;

    if (!userId || !symbol || !quantity || quantity <= 0 || !price || price <= 0) {
      return res.status(400).json({ error: 'Missing trade parameters or invalid quantity/price!' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found!' });

      const currentPrice = Number(price);
      const stockId = symbol.toUpperCase();

      const existingHolding = await prisma.holding.findUnique({
        where: { userId_stockId: { userId: user.id, stockId } }
      });

      if (!existingHolding || existingHolding.quantity < quantity) {
        return res.status(400).json({
          error: `Insufficient shares! You want to sell ${quantity} shares of ${stockId} but only hold ${existingHolding ? existingHolding.quantity : 0} shares.`
        });
      }

      // Deduct shares or delete holding if 0
      const newQty = existingHolding.quantity - quantity;
      if (newQty === 0) {
        await prisma.holding.delete({ where: { id: existingHolding.id } });
      } else {
        await prisma.holding.update({
          where: { id: existingHolding.id },
          data: { quantity: newQty }
        });
      }

      // Refund cash
      const refundAmount = currentPrice * quantity;
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { cash: Math.round((user.cash + refundAmount) * 100) / 100 }
      });

      // Ensure stock exists in database (should exist if we hold it, but let's be safe)
      let stock = await prisma.stock.findUnique({ where: { id: stockId } });
      if (!stock) {
        stock = await prisma.stock.create({
          data: {
            id: stockId,
            name: stockId,
            sector: 'Other',
            price: currentPrice,
            prevPrice: currentPrice,
            volatility: 'MEDIUM',
            description: 'Indian Stock Market Equity',
            reason: 'Traded by user'
          }
        });
      } else {
        // update the price
        stock = await prisma.stock.update({
          where: { id: stockId },
          data: { price: currentPrice }
        });
      }

      // Log transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          stockId: stock.id,
          type: 'SELL',
          quantity: quantity,
          price: currentPrice
        }
      });

      return res.status(200).json({
        message: 'Shares sold successfully! 💰',
        transaction: {
          stockId: stock.id,
          type: 'SELL',
          quantity,
          price: currentPrice,
          totalRefund: refundAmount
        },
        feedback: {
          stockName: stock.name,
          volatility: stock.volatility,
          reason: stock.reason,
          warning: null
        }
      });

    } catch (error) {
      console.error('❌ Sell execution failed:', error);
      res.status(500).json({ error: 'Sell trade failed. Please try again!' });
    }
  });

  // Executing Virtual Trades (BUY / SELL Market Orders)
  router.post('/execute', async (req, res) => {
    const { userId, stockId, type, quantity } = req.body;

    // Validation
    if (!userId || !stockId || !type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Missing trade parameters or invalid quantity!' });
    }

    const tradeType = type.toUpperCase();
    if (tradeType !== 'BUY' && tradeType !== 'SELL') {
      return res.status(400).json({ error: 'Invalid trade type. Must be BUY or SELL!' });
    }

    try {
      // Fetch User & Stock
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      const stock = await prisma.stock.findUnique({ where: { id: stockId.toUpperCase() } });

      if (!user) return res.status(404).json({ error: 'User not found!' });
      if (!stock) return res.status(404).json({ error: 'Stock ticker not found!' });

      const currentPrice = stock.price;
      const tradeCost = currentPrice * quantity;

      if (tradeType === 'BUY') {
        // Validate Virtual Wallet Balance
        if (user.cash < tradeCost) {
          return res.status(400).json({
            error: `Insufficient virtual cash! You need ₹${tradeCost.toLocaleString('en-IN')} but only have ₹${user.cash.toLocaleString('en-IN')}.`
          });
        }

        // Deduct Cash and Log Transaction
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { cash: Math.max(0, Math.round((user.cash - tradeCost) * 100) / 100) }
        });

        // Add/Update Holding
        const existingHolding = await prisma.holding.findUnique({
          where: { userId_stockId: { userId: user.id, stockId: stock.id } }
        });

        if (existingHolding) {
          const newQty = existingHolding.quantity + quantity;
          const newAvgPrice = Math.round(((existingHolding.avgPrice * existingHolding.quantity) + (currentPrice * quantity)) / newQty * 100) / 100;
          
          await prisma.holding.update({
            where: { id: existingHolding.id },
            data: { quantity: newQty, avgPrice: newAvgPrice }
          });
        } else {
          await prisma.holding.create({
            data: {
              userId: user.id,
              stockId: stock.id,
              quantity: quantity,
              avgPrice: currentPrice
            }
          });
        }

        await prisma.transaction.create({
          data: {
            userId: user.id,
            stockId: stock.id,
            type: 'BUY',
            quantity: quantity,
            price: currentPrice
          }
        });

        // --- Core Learning Mechanism: POST-TRADE CALLBACK ENGINE ---
        // 1. Gather all current holdings of the user (after the buy)
        const userHoldings = await prisma.holding.findMany({
          where: { userId: user.id },
          include: { stock: true }
        });

        // 2. Calculate Total Portfolio Value (Cash + Holdings at Current Prices)
        let totalHoldingsValue = 0;
        const sectorWeights = {};

        userHoldings.forEach(holding => {
          const value = holding.quantity * holding.stock.price;
          totalHoldingsValue += value;
          sectorWeights[holding.stock.sector] = (sectorWeights[holding.stock.sector] || 0) + value;
        });

        const totalPortfolioValue = updatedUser.cash + totalHoldingsValue;

        // 3. Calculate Sector Concentrations
        const concentrations = {};
        Object.keys(sectorWeights).forEach(sec => {
          concentrations[sec] = Math.round((sectorWeights[sec] / totalPortfolioValue) * 1000) / 10;
        });

        const targetSector = stock.sector;
        const sectorConcentration = concentrations[targetSector] || 0;

        // 4. Formulate Feedback Alert Details
        let warning = null;
        if (sectorConcentration > 35) {
          // Identify underrepresented sectors to recommend
          const allSectors = ['Tech', 'FMCG', 'Auto', 'Finance', 'Energy'];
          const ownedSectors = Object.keys(concentrations);
          const underrepresented = allSectors.filter(sec => !ownedSectors.includes(sec) || (concentrations[sec] || 0) < 10);
          
          let tipSector = 'Energy or FMCG';
          if (underrepresented.length > 0) {
            tipSector = underrepresented.slice(0, 2).join(' or ');
          }

          warning = {
            sector: targetSector,
            concentration: sectorConcentration,
            message: `⚠️ ${targetSector} Overload! You just put more eggs in the ${targetSector.toLowerCase()} basket. It now takes up ${sectorConcentration}% of your total virtual net worth. Look into ${tipSector} to spread the risk.`
          };
        }

        // Return rich response with context-aware learning card
        return res.status(200).json({
          message: 'Trade executed successfully! 🚀',
          transaction: {
            stockId: stock.id,
            type: 'BUY',
            quantity,
            price: currentPrice,
            totalCost: tradeCost
          },
          feedback: {
            stockName: stock.name,
            volatility: stock.volatility, // Label: High, Medium, Low
            reason: stock.reason, // Why it moved today
            warning: warning // Sector Concentration Alert
          }
        });

      } else {
        // --- SELL TRADE LOGIC ---
        const existingHolding = await prisma.holding.findUnique({
          where: { userId_stockId: { userId: user.id, stockId: stock.id } }
        });

        if (!existingHolding || existingHolding.quantity < quantity) {
          return res.status(400).json({
            error: `Insufficient shares! You want to sell ${quantity} shares of ${stock.id} but only hold ${existingHolding ? existingHolding.quantity : 0} shares.`
          });
        }

        // Deduct shares or delete holding if 0
        const newQty = existingHolding.quantity - quantity;
        if (newQty === 0) {
          await prisma.holding.delete({ where: { id: existingHolding.id } });
        } else {
          await prisma.holding.update({
            where: { id: existingHolding.id },
            data: { quantity: newQty }
          });
        }

        // Refund cash
        const refundAmount = currentPrice * quantity;
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { cash: Math.round((user.cash + refundAmount) * 100) / 100 }
        });

        // Log transaction
        await prisma.transaction.create({
          data: {
            userId: user.id,
            stockId: stock.id,
            type: 'SELL',
            quantity: quantity,
            price: currentPrice
          }
        });

        return res.status(200).json({
          message: 'Shares sold successfully! 💰',
          transaction: {
            stockId: stock.id,
            type: 'SELL',
            quantity,
            price: currentPrice,
            totalRefund: refundAmount
          },
          feedback: {
            stockName: stock.name,
            volatility: stock.volatility,
            reason: stock.reason,
            warning: null
          }
        });
      }

    } catch (error) {
      console.error('❌ Trade execution failed:', error);
      res.status(500).json({ error: 'Trade failed. Please try again!' });
    }
  });

  // Get transaction/trade history for a user
  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId: Number(userId) },
        orderBy: { timestamp: 'desc' }
      });
      return res.status(200).json(transactions);
    } catch (error) {
      console.error(`❌ Failed to retrieve trades for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve trade history' });
    }
  });

  return router;
}
