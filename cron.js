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

export const runLobbyFinalization = async () => {
  console.log('🔄 Checking for ended tournament lobbies...');
  try {
    const endedLobbies = await prisma.privateLobby.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { lte: new Date() }
      },
      include: {
        entries: {
          include: {
            user: true,
            holdings: { include: { stock: true } }
          }
        }
      }
    });

    for (const lobby of endedLobbies) {
      let highestProfit = -Infinity;
      let winner = null;

      for (const entry of lobby.entries) {
        // Calculate dynamic portfolio value based on latest stock prices
        let portfolioValue = entry.currentCash;
        entry.holdings.forEach(h => {
          portfolioValue += (h.quantity * h.stock.price);
        });
        
        const profit = portfolioValue - entry.startingCash;
        
        // Update final profit in DB just to be safe
        await prisma.privateLobbyEntry.update({
          where: { id: entry.id },
          data: { profit }
        });

        if (profit > highestProfit) {
          highestProfit = profit;
          winner = entry.user;
        }
      }

      await prisma.privateLobby.update({
        where: { id: lobby.id },
        data: { status: 'COMPLETED' }
      });

      if (winner) {
        await prisma.socialFeed.create({
          data: {
            userId: winner.id,
            username: winner.username || winner.email.split('@')[0],
            type: 'PROMOTION',
            message: `🏆 Won the "${lobby.name}" contest with a return of ₹${highestProfit.toLocaleString('en-IN')}!`
          }
        });
        console.log(`✅ Crowned ${winner.username} as winner of ${lobby.name}`);
      }

      // Phase 3: Cloning Recurring Lobbies
      if (lobby.isRecurring) {
        const durationMs = lobby.endTime.getTime() - lobby.startTime.getTime();
        const nextStartTime = new Date(lobby.endTime.getTime() + (7 * 24 * 60 * 60 * 1000)); // Next week
        const nextEndTime = new Date(nextStartTime.getTime() + durationMs);
        
        // Ensure new code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        let exists = true;
        while (exists) {
          code = '';
          for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
          const check = await prisma.privateLobby.findUnique({ where: { code } });
          if (!check) exists = false;
        }

        await prisma.privateLobby.create({
          data: {
            code,
            name: `${lobby.name} (Recurring)`,
            hostId: lobby.hostId,
            startingCash: lobby.startingCash,
            startTime: nextStartTime,
            endTime: nextEndTime,
            status: 'ACTIVE',
            restrictNifty50: lobby.restrictNifty50,
            isPublic: lobby.isPublic,
            maxParticipants: lobby.maxParticipants,
            isRecurring: true
          }
        });
        console.log(`🔁 Cloned recurring lobby ${lobby.name} for next week.`);
      }
    }
  } catch (error) {
    console.error('❌ Lobby finalization error:', error);
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

  // Run every 5 minutes to finalize ended lobbies
  cron.schedule('*/5 * * * *', () => {
    runLobbyFinalization();
  });

  console.log('⏳ Gamification Cron Jobs initialized.');
};
