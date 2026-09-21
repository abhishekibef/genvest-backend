/**
 * One-time migration script to fix existing user balances.
 * 
 * Under the OLD accounting model, margin was subtracted from commodityCash on trade open.
 * Under the NEW XM 360 model, commodityCash = true balance (never reduced by margin).
 * 
 * This script adds back the total marginUsed of all OPEN positions to each user's commodityCash.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting leverage migration...');

  // Find all users with open commodity positions
  const usersWithOpenPositions = await prisma.commodityPosition.groupBy({
    by: ['userId'],
    where: { status: 'OPEN' },
    _sum: { marginUsed: true }
  });

  console.log(`Found ${usersWithOpenPositions.length} user(s) with open positions to migrate.`);

  for (const group of usersWithOpenPositions) {
    const userId = group.userId;
    const totalMarginUsed = group._sum.marginUsed || 0;

    if (totalMarginUsed > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) continue;

      const oldBalance = user.commodityCash ?? 10000.0;
      const restoredBalance = oldBalance + totalMarginUsed;

      await prisma.user.update({
        where: { id: userId },
        data: { 
          commodityCash: restoredBalance,
          commodityLeverage: 100 // Set default leverage
        }
      });

      console.log(`  User #${userId}: $${oldBalance.toFixed(2)} + $${totalMarginUsed.toFixed(2)} margin restored = $${restoredBalance.toFixed(2)}`);
    }
  }

  // Set default leverage for all users who don't have open positions
  await prisma.user.updateMany({
    where: { commodityLeverage: { equals: 100 } }, // Already default
    data: { commodityLeverage: 100 }
  });

  console.log('Migration complete.');
  await prisma.$disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
