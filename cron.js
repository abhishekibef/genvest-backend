import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Daily at 15:30 (3:30 PM) -> "30 15 * * *"
// For testing locally without waiting, we'll expose a function that can also be manually triggered
export const runDailyTournamentReset = async () => {
  console.log('🔄 Running Daily Sprint Reset...');
  try {
    const users = await prisma.user.findMany({
      include: {
        holdings: { include: { stock: true } }
      }
    });

    let highestProfit = -Infinity;
    let winner = null;

    for (const user of users) {
      let currentHoldingsValue = 0;
      user.holdings.forEach(h => {
        currentHoldingsValue += h.quantity * h.stock.price;
      });
      const currentNetWorth = user.cash + currentHoldingsValue;
      const profit = currentNetWorth - user.startOfDayNetWorth;

      if (profit > highestProfit) {
        highestProfit = profit;
        winner = user;
      }

      // Update startOfDayNetWorth for tomorrow
      await prisma.user.update({
        where: { id: user.id },
        data: { startOfDayNetWorth: currentNetWorth }
      });
    }

    if (winner && highestProfit > 0) {
      // Announce winner to Social Feed
      await prisma.socialFeed.create({
        data: {
          userId: winner.id,
          username: winner.username || winner.email.split('@')[0],
          type: 'STREAK',
          message: `👑 Won today's Daily Sprint with a profit of ₹${highestProfit.toFixed(2)}!`
        }
      });
      console.log(`✅ Crowned ${winner.username} as Daily Sprint Winner!`);
    } else {
      console.log('✅ Daily Sprint concluded. No profitable trades today.');
    }
  } catch (error) {
    console.error('❌ Daily reset error:', error);
  }
};

export const runWeeklyLeaguePromotions = async () => {
  console.log('🏆 Running Weekly League Promotions...');
  try {
    const leagues = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    
    for (let i = 0; i < leagues.length - 1; i++) {
      const currentLeague = leagues[i];
      const nextLeague = leagues[i + 1];

      // Find users in this league sorted by cash descending (or XP)
      const usersInLeague = await prisma.user.findMany({
        where: { league: currentLeague },
        orderBy: { cash: 'desc' }
      });

      if (usersInLeague.length > 0) {
        const top20PercentCount = Math.ceil(usersInLeague.length * 0.20);
        const toPromote = usersInLeague.slice(0, top20PercentCount);

        for (const user of toPromote) {
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              league: nextLeague,
              highestLeague: nextLeague 
            }
          });

          await prisma.socialFeed.create({
            data: {
              userId: user.id,
              username: user.username || 'Trader',
              type: 'PROMOTION',
              message: `🚀 Promoted to ${nextLeague} League!`
            }
          });
          console.log(`Promoted ${user.username} to ${nextLeague}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Weekly promotion error:', error);
  }
};

export const initCronJobs = () => {
  // Run Daily at 3:30 PM
  cron.schedule('30 15 * * *', () => {
    runDailyTournamentReset();
  });

  // Run Weekly on Fridays at 3:35 PM
  cron.schedule('35 15 * * 5', () => {
    runWeeklyLeaguePromotions();
  });

  console.log('⏳ Gamification Cron Jobs initialized.');
};
