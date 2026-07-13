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

// ============================================================
// LEADERBOARD CACHE (shared with leaderboard route)
// ============================================================
export const leaderboardCache = new Map(); // key: "view:timeframe", value: { data, expiresAt }

export const invalidateLeaderboardCache = () => {
  leaderboardCache.clear();
  console.log('🗑️ Leaderboard cache cleared.');
};

// ============================================================
// TIER CALCULATION HELPER
// ============================================================
function calculateTier(roi) {
  if (roi >= 20) return 'A';
  if (roi >= -5) return 'B';
  return 'C';
}

// ============================================================
// WEEKLY TIER RECALCULATION — Every Sunday 12:00 AM IST
// Cron: '30 18 * * 6' = Saturday 6:30 PM UTC = Sunday 12:00 AM IST
// ============================================================
export const runWeeklyTierRecalculation = async () => {
  console.log('🏆 Running Weekly Tier Recalculation (A/B/C)...');
  try {
    // 1. Fetch all users with holdings and stock prices
    const users = await prisma.user.findMany({
      include: { holdings: { include: { stock: true } } }
    });

    const stocks = await prisma.stock.findMany();
    const stockPrices = {};
    stocks.forEach(s => { stockPrices[s.id] = s.price; });

    // 2. Calculate ROI for each user
    const usersWithROI = users.map(u => {
      let holdingsValue = 0;
      u.holdings.forEach(h => {
        holdingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice);
      });
      const netWorth = u.cash + holdingsValue;
      const profitLoss = netWorth - 1000000;
      const roi = (profitLoss / 1000000) * 100;
      return { ...u, netWorth, profitLoss, roi, tier: calculateTier(roi) };
    });

    // 3. Sort by ROI DESC, tie-break by profitLoss DESC, then createdAt ASC (older = higher rank)
    usersWithROI.sort((a, b) => {
      if (b.roi !== a.roi) return b.roi - a.roi;
      if (b.profitLoss !== a.profitLoss) return b.profitLoss - a.profitLoss;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // 4. Assign global ranks
    const withGlobalRank = usersWithROI.map((u, i) => ({ ...u, globalRank: i + 1 }));

    // 5. Assign tier ranks within each tier
    const tierGroups = { A: [], B: [], C: [] };
    withGlobalRank.forEach(u => tierGroups[u.tier].push(u));
    const finalUsers = [
      ...tierGroups.A.map((u, i) => ({ ...u, tierRank: i + 1 })),
      ...tierGroups.B.map((u, i) => ({ ...u, tierRank: i + 1 })),
      ...tierGroups.C.map((u, i) => ({ ...u, tierRank: i + 1 })),
    ];

    // 6. Update each user in DB & send SocialFeed notifications for tier changes
    for (const u of finalUsers) {
      const oldTier = u.tier; // fetched from DB
      const newTier = u.tier; // just calculated — same variable, but we need the DB value
      // Re-fetch old tier from the original user object
      const dbUser = users.find(x => x.id === u.id);
      const previousTier = dbUser?.tier || 'B';

      await prisma.user.update({
        where: { id: u.id },
        data: {
          tier: u.tier,
          tierRank: u.tierRank,
          globalRank: u.globalRank,
          roiPercentage: Math.round(u.roi * 100) / 100,
          lastTierUpdate: new Date()
        }
      });

      // Notify on tier change
      if (previousTier !== u.tier) {
        const promoted = u.tier < previousTier; // A < B < C alphabetically = promotion
        const tierLabels = { A: 'Tier A (Elite) 👑', B: 'Tier B (Solid) ⭐', C: 'Tier C (Learning) 📚' };
        await prisma.socialFeed.create({
          data: {
            userId: u.id,
            username: u.username || u.email.split('@')[0],
            type: 'PROMOTION',
            message: promoted
              ? `🎉 Promoted to ${tierLabels[u.tier]}! ROI: ${u.roi >= 0 ? '+' : ''}${u.roi.toFixed(2)}% | Global Rank #${u.globalRank}`
              : `📉 Moved to ${tierLabels[u.tier]}. ROI: ${u.roi >= 0 ? '+' : ''}${u.roi.toFixed(2)}%. Don't worry, bounce back next week! 💪`
          }
        });
      }
    }

    // 7. Invalidate leaderboard cache
    invalidateLeaderboardCache();
    console.log(`✅ Tier recalculation complete for ${finalUsers.length} users.`);
  } catch (error) {
    console.error('❌ Weekly tier recalculation error:', error);
  }
};

// ============================================================
// DAILY PORTFOLIO SNAPSHOT — Every day at 11:59 PM IST
// Cron: '29 18 * * *' = 6:29 PM UTC = 11:59 PM IST
// ============================================================
export const runDailyPortfolioSnapshot = async () => {
  console.log('📸 Running Daily Portfolio Snapshot...');
  try {
    const users = await prisma.user.findMany({
      include: { holdings: { include: { stock: true } } }
    });
    const stocks = await prisma.stock.findMany();
    const stockPrices = {};
    stocks.forEach(s => { stockPrices[s.id] = s.price; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const u of users) {
      // Day 1 priming: if user has no snapshot at all, seed a baseline of ₹10L
      const existingCount = await prisma.portfolioSnapshot.count({ where: { userId: u.id } });

      let holdingsValue = 0;
      u.holdings.forEach(h => {
        holdingsValue += h.quantity * (stockPrices[h.stockId] || h.avgPrice);
      });
      const netWorth = u.cash + holdingsValue;

      if (existingCount === 0) {
        // Seed starting capital snapshot (Day 0 = when they joined with ₹10L)
        await prisma.portfolioSnapshot.create({
          data: { userId: u.id, netWorth: 1000000, snapshot: u.createdAt }
        });
      }

      // Save today's snapshot (upsert by checking today's date)
      const todaySnapshot = await prisma.portfolioSnapshot.findFirst({
        where: { userId: u.id, snapshot: { gte: today } }
      });

      if (!todaySnapshot) {
        await prisma.portfolioSnapshot.create({
          data: { userId: u.id, netWorth }
        });
      }
    }

    console.log(`✅ Portfolio snapshots saved for ${users.length} users.`);
  } catch (error) {
    console.error('❌ Daily snapshot error:', error);
  }
};

export const initCronJobs = () => {
  // Run Daily at 3:30 PM IST (market close)
  cron.schedule('30 15 * * *', () => {
    runDailyTournamentReset();
  });

  // Run Weekly on Fridays at 3:35 PM IST (old Diamond/Silver league system)
  cron.schedule('35 15 * * 5', () => {
    runWeeklyLeaguePromotions();
  });

  // Run every 5 minutes to finalize ended lobbies
  cron.schedule('*/5 * * * *', () => {
    runLobbyFinalization();
  });

  // Weekly Tier Recalculation — Sunday 12:00 AM IST (Saturday 6:30 PM UTC)
  cron.schedule('30 18 * * 6', () => {
    runWeeklyTierRecalculation();
  });

  // Daily Portfolio Snapshot — 11:59 PM IST (6:29 PM UTC)
  cron.schedule('29 18 * * *', () => {
    runDailyPortfolioSnapshot();
  });

  console.log('⏳ Gamification Cron Jobs initialized.');
};
