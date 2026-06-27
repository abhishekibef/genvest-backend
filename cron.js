import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Daily at 15:30 (3:30 PM) -> "30 15 * * *"
// For testing locally without waiting, we'll expose a function that can also be manually triggered
export const runDailyTournamentReset = async () => {
  console.log('🔄 Running Daily Tournament Reset...');
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. Get today's active tournament
    const tournament = await prisma.tournament.findUnique({
      where: { date: todayStr },
      include: { entries: { include: { user: true } } }
    });

    if (tournament && tournament.status === 'ACTIVE') {
      // Calculate profits and find winner
      let highestProfit = -Infinity;
      let winner = null;

      for (const entry of tournament.entries) {
        if (entry.profit > highestProfit) {
          highestProfit = entry.profit;
          winner = entry.user;
        }
      }

      if (winner && highestProfit > 0) {
        // Announce winner to Social Feed
        await prisma.socialFeed.create({
          data: {
            userId: winner.id,
            username: winner.username || 'Trader',
            type: 'STREAK',
            message: `👑 Won today's Daily Sprint with a profit of ₹${highestProfit.toFixed(2)}!`
          }
        });
      }

      // Mark tournament as completed
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'COMPLETED' }
      });
      console.log('✅ Concluded today\'s tournament.');
    }

    // 2. Create tomorrow's tournament
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    await prisma.tournament.upsert({
      where: { date: tomorrowStr },
      update: {},
      create: { date: tomorrowStr, status: 'ACTIVE' }
    });
    console.log('✅ Created tomorrow\'s tournament.');

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
