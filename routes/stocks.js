import express from 'express';

export function getStocksRouter(prisma) {
  const router = express.Router();

  // 1. Get all simulated stocks
  router.get('/', async (req, res) => {
    try {
      const stocks = await prisma.stock.findMany();
      res.status(200).json(stocks);
    } catch (error) {
      console.error('❌ Failed to fetch stocks:', error);
      res.status(500).json({ error: 'Failed to retrieve stocks' });
    }
  });

  // 2. Get specific stock details with generated consistent historical chart data
  router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
      const stock = await prisma.stock.findUnique({
        where: { id: id.toUpperCase() }
      });

      if (!stock) {
        return res.status(404).json({ error: 'Stock ticker not found!' });
      }

      // Generate 20 historical daily prices ending exactly at the current price
      const historyPoints = 20;
      const history = [];
      let currentTrackPrice = stock.price;

      // Volatility ratios
      const drift = 0.002; // general slight upward bias
      let volRatio = 0.01;
      if (stock.volatility === 'HIGH') volRatio = 0.04;
      if (stock.volatility === 'MEDIUM') volRatio = 0.02;

      for (let i = 0; i < historyPoints; i++) {
        history.unshift({
          day: historyPoints - i,
          price: Math.round(currentTrackPrice * 100) / 100
        });

        // Walk backward: reverse the forward movement
        const change = (Math.random() - 0.45) * 2 * volRatio; // offset slightly for upward trend forward
        currentTrackPrice = currentTrackPrice / (1 + change + drift);
        currentTrackPrice = Math.max(5, currentTrackPrice); // floor limit
      }

      res.status(200).json({
        ...stock,
        chartData: history
      });
    } catch (error) {
      console.error(`❌ Failed to fetch stock details for ${id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve stock details' });
    }
  });

  return router;
}
