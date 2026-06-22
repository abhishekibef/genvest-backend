import express from 'express';

export function getPortfolioRouter(prisma) {
  const router = express.Router();

  // Fetch portfolio stats, holdings, and sector allocations
  router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        include: {
          holdings: {
            include: { stock: true }
          },
          referrals: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      // Calculate holding stats
      let totalHoldingsCurrentValue = 0;
      let totalHoldingsCostBasis = 0;
      const sectorWeights = {};
      const holdingsSummary = [];
      let totalWeightedRiskPoints = 0;

      user.holdings.forEach(holding => {
        const costBasis = holding.quantity * holding.avgPrice;
        const currentValue = holding.quantity * holding.stock.price;
        const pnl = currentValue - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        totalHoldingsCurrentValue += currentValue;
        totalHoldingsCostBasis += costBasis;

        // Sector Split
        const sector = holding.stock.sector;
        sectorWeights[sector] = (sectorWeights[sector] || 0) + currentValue;

        // Weighted Risk points (HIGH = 3, MEDIUM = 2, LOW = 1)
        let riskScore = 1;
        if (holding.stock.volatility === 'HIGH') riskScore = 3;
        if (holding.stock.volatility === 'MEDIUM') riskScore = 2;
        
        totalWeightedRiskPoints += riskScore * currentValue;

        holdingsSummary.push({
          stockId: holding.stockId,
          stockName: holding.stock.name,
          sector: sector,
          quantity: holding.quantity,
          avgPrice: holding.avgPrice,
          currentPrice: holding.stock.price,
          prevPrice: holding.stock.prevPrice,
          costBasis: Math.round(costBasis * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          volatility: holding.stock.volatility
        });
      });

      const totalPortfolioValue = user.cash + totalHoldingsCurrentValue;
      const initialCapital = 1000000.0 + (user.referredById ? 5000.0 : 0.0) + (user.referrals.length * 10000.0);
      const overallPnl = totalPortfolioValue - initialCapital;
      const overallPnlPercent = (overallPnl / initialCapital) * 100;

      // Calculate sector weights out of total portfolio value
      const sectorAllocations = [];
      const allSectors = ['Tech', 'FMCG', 'Auto', 'Finance', 'Energy'];
      
      allSectors.forEach(sector => {
        const value = sectorWeights[sector] || 0;
        const percent = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
        sectorAllocations.push({
          sector,
          value: Math.round(value * 100) / 100,
          percentage: Math.round(percent * 10) / 10
        });
      });

      // Calculate Portfolio Risk Score Rating
      let averageRiskScore = 1; // Default low risk (cash)
      if (totalHoldingsCurrentValue > 0) {
        // Weighted risk average of stock portfolio only
        averageRiskScore = totalWeightedRiskPoints / totalHoldingsCurrentValue;
      }

      let riskTier = 'Low Risk (Very Chill 🍃)';
      if (averageRiskScore > 1.6 && averageRiskScore <= 2.4) {
        riskTier = 'Medium Risk (Balanced ⚖️)';
      } else if (averageRiskScore > 2.4) {
        riskTier = 'High Risk (Maximum Adrenaline ⚡)';
      }

      // Calculate Diversification Rating out of 100
      let diversificationScore = 0;
      let diversificationStatus = 'Not Diversified (Cash Only 💸)';

      if (totalHoldingsCurrentValue > 0) {
        const uniqueSectorsCount = Object.keys(sectorWeights).length;
        // Base score: 20 points per sector (max 100 for 5 sectors)
        const baseScore = uniqueSectorsCount * 20;

        // Deduction for sector concentration above 35%
        let concentrationDeductions = 0;
        sectorAllocations.forEach(alloc => {
          if (alloc.percentage > 35) {
            // Deduct 1.5 points for every 1% above 35% concentration
            concentrationDeductions += (alloc.percentage - 35) * 1.5;
          }
        });

        diversificationScore = Math.max(10, Math.min(100, Math.round(baseScore - concentrationDeductions)));

        if (diversificationScore >= 80) {
          diversificationStatus = 'Diversification Guru 🏆';
        } else if (diversificationScore >= 50) {
          diversificationStatus = 'Healthy Spread 🥗';
        } else {
          diversificationStatus = 'Concentrated Risk 🛑';
        }
      }

      res.status(200).json({
        cashBalance: user.cash,
        holdingsValue: Math.round(totalHoldingsCurrentValue * 100) / 100,
        totalNetWorth: Math.round(totalPortfolioValue * 100) / 100,
        overallPnl: Math.round(overallPnl * 100) / 100,
        overallPnlPercent: Math.round(overallPnlPercent * 100) / 100,
        initialCapital,
        holdings: holdingsSummary,
        sectorAllocations,
        portfolioAnalytics: {
          riskScore: Math.round(averageRiskScore * 10) / 10,
          riskTier,
          diversificationScore,
          diversificationStatus
        }
      });
    } catch (error) {
      console.error(`❌ Failed to retrieve portfolio details for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to retrieve portfolio details' });
    }
  });

  return router;
}
