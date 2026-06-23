import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting database reset for trading leaderboard...');

  // 1. Delete all user stock holdings
  const holdingsCount = await prisma.holding.deleteMany({});
  console.log(`✅ Deleted ${holdingsCount.count} stock holdings.`);

  // 2. Delete all transaction history
  const txCount = await prisma.transaction.deleteMany({});
  console.log(`✅ Deleted ${txCount.count} transactions.`);

  // 3. Reset cash and streak for all registered users
  const usersCount = await prisma.user.updateMany({
    data: {
      cash: 1000000.0,
      streak: 1
    }
  });
  console.log(`✅ Reset virtual cash to ₹10,00,000 and active streak to 1 for ${usersCount.count} users.`);

  // 4. Delete daily tournament standings & transactions
  const tourTxCount = await prisma.tournamentTransaction.deleteMany({});
  console.log(`✅ Deleted ${tourTxCount.count} tournament transactions.`);

  const tourHoldingCount = await prisma.tournamentHolding.deleteMany({});
  console.log(`✅ Deleted ${tourHoldingCount.count} tournament holdings.`);

  const tourEntryCount = await prisma.tournamentEntry.deleteMany({});
  console.log(`✅ Deleted ${tourEntryCount.count} tournament entries.`);

  const tourCount = await prisma.tournament.deleteMany({});
  console.log(`✅ Deleted ${tourCount.count} tournaments.`);

  console.log('✨ Leaderboard has been successfully reset! Real rankings will calculate dynamically as users start trading.');
}

main()
  .catch(e => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
