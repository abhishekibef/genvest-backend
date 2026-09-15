import cron from 'node-cron';

export function startIntradaySquareOffCron(prisma) {
  // Job 1: Intraday Square-Off at 3:15 PM IST (Mon-Fri) -> 9:45 AM UTC
  cron.schedule('45 9 * * 1-5', async () => {
    console.log('🔄 Running Intraday Auto Square-Off');
    try {
      const openPositions = await prisma.intradayPosition.findMany({
        where: { status: 'OPEN' }
      });

      for (const pos of openPositions) {
        let currentPrice = pos.entryPrice;
        const stock = await prisma.stock.findUnique({ where: { id: pos.stockId } });
        if (stock) currentPrice = stock.price;

        let pnl = 0;
        if (pos.type === 'LONG') {
          pnl = (currentPrice - pos.entryPrice) * pos.quantity;
        } else {
          pnl = (pos.entryPrice - currentPrice) * pos.quantity;
        }

        const user = await prisma.user.findUnique({ where: { id: pos.userId } });
        if (user) {
          await prisma.user.update({
            where: { id: pos.userId },
            data: { cash: user.cash + pos.marginUsed + pnl }
          });
        }

        await prisma.intradayPosition.update({
          where: { id: pos.id },
          data: {
            status: 'CLOSED',
            exitPrice: currentPrice,
            pnl,
            closedAt: new Date()
          }
        });
      }
      console.log(`✅ Intraday Auto Square-Off completed for ${openPositions.length} positions.`);
    } catch (err) {
      console.error('❌ Intraday Auto Square-Off Error:', err);
    }
  });

  // Job 2: Weekly Option Expiry at 3:30 PM IST on Thursdays -> 10:00 AM UTC
  cron.schedule('0 10 * * 4', async () => {
    console.log('🔄 Running Options Auto Expiry');
    try {
      const now = new Date();
      const openPositions = await prisma.optionPosition.findMany({
        where: { 
          status: 'OPEN',
          expiryDate: { lte: now } 
        }
      });

      for (const pos of openPositions) {
        // Get spot price from banking stocks average or fallback
        let spotPrice = pos.underlying === 'NIFTY' ? 24520 : 51200;
        // Try to derive from tracked stocks in DB
        if (pos.underlying === 'NIFTY') {
          const reliance = await prisma.stock.findUnique({ where: { id: 'RELIANCE' } });
          if (reliance) spotPrice = reliance.price * 18; // rough Nifty proxy
        } else {
          const hdfc = await prisma.stock.findUnique({ where: { id: 'HDFCBANK' } });
          if (hdfc) spotPrice = hdfc.price * 27; // rough BankNifty proxy
        }

        let intrinsicValue = 0;
        if (pos.optionType === 'CE') {
          intrinsicValue = Math.max(0, spotPrice - pos.strikePrice);
        } else {
          intrinsicValue = Math.max(0, pos.strikePrice - spotPrice);
        }

        const amountToCredit = intrinsicValue * pos.lots * pos.lotSize;
        const pnl = amountToCredit - pos.totalCost;

        const user = await prisma.user.findUnique({ where: { id: pos.userId } });
        if (user) {
          await prisma.user.update({
            where: { id: pos.userId },
            data: { cash: user.cash + amountToCredit }
          });
        }

        await prisma.optionPosition.update({
          where: { id: pos.id },
          data: {
            status: 'EXPIRED',
            exitPremium: intrinsicValue,
            pnl,
            closedAt: new Date()
          }
        });
      }
      console.log(`✅ Options Auto Expiry completed for ${openPositions.length} positions.`);
    } catch (err) {
      console.error('❌ Options Auto Expiry Error:', err);
    }
  });
}
