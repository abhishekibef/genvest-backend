import { PrismaClient } from '@prisma/client';
import { getSeedLessons } from './seed-lessons.js';
import fs from 'fs';
import path from 'path';


const prisma = new PrismaClient();

const lessonsData = [
  {
    id: 'WHAT_IS_STOCK',
    title: 'What is a Stock?',
    category: 'Basics',
    readTime: '45s',
    content: `### 📈 What is a Stock?
Imagine a giant pizza 🍕 representing a company. If you buy a slice, you own a piece of the pizza! 
A **stock** (or share) represents **fractional ownership** in a company. 
When you buy 1 share of Zomato or Apple, you literally become a co-owner of that business.

#### Why do people buy stocks?
1. **Capital Growth:** If the company grows and becomes more valuable, your slice (share) becomes worth more money. You can sell it later for a profit!
2. **Dividends:** Some companies share their profits directly with shareholders by sending them cash payments called dividends.

*Takeaway: Stocks are how you make your money work for you, instead of just letting it sit under your mattress.*`
  },
  {
    id: 'MARKET_CAP',
    title: 'Decoding Market Cap',
    category: 'Valuation',
    readTime: '50s',
    content: `### 🏷️ What is Market Cap?
"Market Capitalization" (or Market Cap) is the **total price tag** of a company. 
It tells you how big a company is in the eyes of the stock market.

#### How is it calculated?
$$\\text{Market Cap} = \\text{Total Share Price} \\times \\text{Total Number of Shares Outstanding}$$

#### The Three Tiers:
- **Large-Cap (Mega Giants):** Highly stable, well-established companies (e.g., Reliance, HDFC Bank, Apple). They are like massive ships—slow, steady, and very hard to sink.
- **Mid-Cap (Growing Challengers):** Mid-sized companies with rapid growth potential, but more volatility (e.g., Zomato, Nykaa).
- **Small-Cap (Hidden Gems):** Small, young companies. High risk, high reward. They can shoot to the moon 🚀 or drop to zero.

*Takeaway: Don't just look at the stock price! A stock priced at ₹10,000 can actually belong to a smaller company than a stock priced at ₹100 if the latter has many more shares.*`
  },
  {
    id: 'SIP',
    title: 'SIP: The Passive Wealth Machine',
    category: 'Wealth',
    readTime: '55s',
    content: `### 🔄 What is a SIP?
SIP stands for **Systematic Investment Plan**. It is the ultimate "set-it-and-forget-it" strategy for building serious wealth.
Instead of trying to time the market (which even pros fail at), you invest a **fixed amount of money** at regular intervals (e.g., ₹1,000 every month).

#### Why SIP is a Cheat Code:
1. **Rupee Cost Averaging:** When prices are high, your ₹1,000 buys fewer shares. When prices crash, your ₹1,000 buys MORE shares! Over time, your average purchase cost smoothens out.
2. **Compound Interest:** Your earnings start earning their own earnings. Starting a SIP at 18 vs 25 can result in *double* the wealth by age 50 due to compounding power.
3. **No Emotional Stress:** You don't have to stress about stock market dips. In fact, crashes are just "discounts" for your next monthly SIP!

*Takeaway: Consistency beats timing. Start small, start early, and let compounding do the heavy lifting.*`
  },
  {
    id: 'RISK',
    title: 'Risk Decoded: Volatility is Not Your Enemy',
    category: 'Mindset',
    readTime: '50s',
    content: `### ⚡ Understanding Risk
In trading, **Risk** and **Return** are two sides of the same coin. You cannot have high gains without taking on risk.

#### Volatility: The Wild Ride
**Volatility** measures how fast and how wildly a stock's price bounces up and down.
- **Low Volatility (Chill):** Stocks like Reliance or ITC. Steady, slow price moves. Ideal for a good night's sleep.
- **High Volatility (Adrenaline):** Stocks like Tesla or Paytm. Daily swings of $\\pm 5\\%$ are normal. High adrenaline, potential for huge gains or losses.

#### How to manage it:
Never put money you need next month into high-volatility stocks. Use low-volatility assets for safety, and allocate only a small portion to high-growth high-risk assets.

*Takeaway: Risk is a tool. Manage it properly, and volatility becomes your friend, not your enemy.*`
  },
  {
    id: 'DIVERSIFICATION',
    title: 'The Diversification Hack',
    category: 'Strategy',
    readTime: '55s',
    content: `### 🧺 "Don't Put All Your Eggs in One Basket"
This is the oldest and most important rule in finance: **Diversification**. 
If you invest all your money in a single stock, and that company goes bankrupt, you lose everything. 

#### Sector Splitting:
Companies operate in different **sectors** (Tech, FMCG, Finance, Energy, Auto). When one sector suffers, another might thrive!
- **Tech:** High growth, high innovation (Zomato, Infosys, Apple).
- **FMCG (Fast-Moving Consumer Goods):** Steady and defensive (ITC, Nykaa). People always need soap and snacks, even in a recession!
- **Finance:** The backbone of the economy (HDFC Bank, Paytm).

#### The 35% Rule:
To keep your portfolio healthy, try to ensure that **no single sector makes up more than 35%** of your total portfolio value. This shields you from industry-specific crashes.

*Takeaway: Spread your bets across different sectors. It's the only free lunch in investing!*`
  }
];

const stocksData = [
  {
    id: 'ZOMATO',
    name: 'Zomato Ltd.',
    sector: 'Tech',
    price: 180.50,
    prevPrice: 174.90,
    volatility: 'HIGH',
    description: 'Food delivery and quick-commerce platform driving Gen Z dining trends.',
    reason: 'Up 3.2% as late-night weekend delivery volumes hit record highs.'
  },
  {
    id: 'NYKAA',
    name: 'FSN E-Commerce (Nykaa)',
    sector: 'FMCG',
    price: 165.20,
    prevPrice: 167.70,
    volatility: 'HIGH',
    description: 'Premier online beauty, wellness, and fashion retailer in India.',
    reason: 'Down 1.5% due to short-term fears of rising digital advertising and marketing costs.'
  },
  {
    id: 'TATA-MOTORS',
    name: 'Tata Motors Ltd.',
    sector: 'Auto',
    price: 950.40,
    prevPrice: 933.60,
    volatility: 'MEDIUM',
    description: 'Automotive giant leading the electric vehicle (EV) revolution in India.',
    reason: 'Up 1.8% after expanding their high-speed EV charging network partnership.'
  },
  {
    id: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    sector: 'Energy',
    price: 2900.00,
    prevPrice: 2902.50,
    volatility: 'LOW',
    description: 'Diversified giant dominating energy, retail, and 5G telecom services.',
    reason: 'Holding flat today as global oil benchmarks show minimal movement.'
  },
  {
    id: 'PAYTM',
    name: 'One97 Communications (Paytm)',
    sector: 'Finance',
    price: 380.00,
    prevPrice: 396.25,
    volatility: 'HIGH',
    description: 'Pioneering mobile payments operator innovating financial services.',
    reason: 'Down 4.1% as users and merchants adjust to recent platform modifications.'
  },
  {
    id: 'HDFC-BANK',
    name: 'HDFC Bank Ltd.',
    sector: 'Finance',
    price: 1450.00,
    prevPrice: 1442.80,
    volatility: 'LOW',
    description: 'India\'s leading private sector bank, known for stable, consistent growth.',
    reason: 'Up 0.5% after posting strong quarterly retail deposit inflows.'
  },
  {
    id: 'INFY',
    name: 'Infosys Ltd.',
    sector: 'Tech',
    price: 1420.00,
    prevPrice: 1403.15,
    volatility: 'MEDIUM',
    description: 'Global digital services and IT consulting powerhouse.',
    reason: 'Up 1.2% following a major multi-year cloud transformation contract in Europe.'
  },
  {
    id: 'APPLE',
    name: 'Apple Inc.',
    sector: 'Tech',
    price: 180.00,
    prevPrice: 178.60,
    volatility: 'LOW',
    description: 'Global tech titan renowned for iPhones, premium design, and services.',
    reason: 'Up 0.8% ahead of highly-anticipated on-device generative AI features announcement.'
  },
  {
    id: 'TSLA',
    name: 'Tesla Inc.',
    sector: 'Auto',
    price: 175.50,
    prevPrice: 181.85,
    volatility: 'HIGH',
    description: 'Electric vehicle, robotics, and clean energy pioneer.',
    reason: 'Down 3.5% on concerns of competitive price cuts squeeze in international markets.'
  },
  {
    id: 'ITC',
    name: 'ITC Ltd.',
    sector: 'FMCG',
    price: 430.00,
    prevPrice: 425.30,
    volatility: 'LOW',
    description: 'Cigarettes, hotels, paperboards, and consumer goods giant.',
    reason: 'Up 1.1% driven by steady margin expansion in their processed food portfolio.'
  }
];

const competitorsData = [
  {
    username: 'stonks_queen',
    avatar: '#FFD700', // Gold
    cash: 620000.0,
    holdings: [
      { stockId: 'ZOMATO', quantity: 1500, avgPrice: 175.0 },
      { stockId: 'APPLE', quantity: 500, avgPrice: 178.0 }
    ]
  },
  {
    username: 'crypto_charlie',
    avatar: '#FF5733', // Coral
    cash: 200000.0,
    holdings: [
      { stockId: 'TSLA', quantity: 1500, avgPrice: 182.0 },
      { stockId: 'PAYTM', quantity: 1000, avgPrice: 400.0 }
    ]
  },
  {
    username: 'sip_soldier',
    avatar: '#33FF57', // Lime
    cash: 900000.0,
    holdings: [
      { stockId: 'RELIANCE', quantity: 20, avgPrice: 2850.0 },
      { stockId: 'HDFC-BANK', quantity: 30, avgPrice: 1440.0 }
    ]
  },
  {
    username: 'fomo_felix',
    avatar: '#9B59B6', // Purple
    cash: 50000.0,
    holdings: [
      { stockId: 'ZOMATO', quantity: 3000, avgPrice: 181.0 },
      { stockId: 'TSLA', quantity: 1000, avgPrice: 179.0 },
      { stockId: 'PAYTM', quantity: 800, avgPrice: 395.0 }
    ]
  },
  {
    username: 'dividend_daddy',
    avatar: '#2ECC71', // Green
    cash: 850000.0,
    holdings: [
      { stockId: 'ITC', quantity: 300, avgPrice: 425.0 },
      { stockId: 'RELIANCE', quantity: 10, avgPrice: 2880.0 }
    ]
  },
  {
    username: 'risk_taker_rachel',
    avatar: '#E74C3C', // Red
    cash: 150000.0,
    holdings: [
      { stockId: 'NYKAA', quantity: 2000, avgPrice: 168.0 },
      { stockId: 'TSLA', quantity: 2000, avgPrice: 172.0 }
    ]
  },
  {
    username: 'alpha_algo',
    avatar: '#3498DB', // Blue
    cash: 400000.0,
    holdings: [
      { stockId: 'INFY', quantity: 300, avgPrice: 1410.0 },
      { stockId: 'APPLE', quantity: 400, avgPrice: 181.0 }
    ]
  },
  {
    username: 'mutual_fund_mia',
    avatar: '#F1C40F', // Yellow
    cash: 500000.0,
    holdings: [
      { stockId: 'HDFC-BANK', quantity: 200, avgPrice: 1455.0 },
      { stockId: 'INFY', quantity: 200, avgPrice: 1415.0 }
    ]
  },
  {
    username: 'options_oscar',
    avatar: '#E67E22', // Orange
    cash: 300000.0,
    holdings: [
      { stockId: 'ZOMATO', quantity: 1000, avgPrice: 182.0 },
      { stockId: 'PAYTM', quantity: 1500, avgPrice: 375.0 }
    ]
  },
  {
    username: 'green_energy_gabe',
    avatar: '#1ABC9C', // Teal
    cash: 700000.0,
    holdings: [
      { stockId: 'TATA-MOTORS', quantity: 300, avgPrice: 940.0 }
    ]
  }
];

async function main() {
  console.log('🌱 Starting DB Seed...');

  // 0. Clean old referencing records to bypass foreign key constraints
  console.log('🧹 Cleaning referencing records...');
  await prisma.userLesson.deleteMany();
  await prisma.competitorHolding.deleteMany();
  await prisma.holding.deleteMany();
  await prisma.transaction.deleteMany();

  // 1. Seed Levels and Lessons
  console.log('📚 Seeding Levels and Lessons...');
  await prisma.lesson.deleteMany();
  await prisma.level.deleteMany();

  const seedData = getSeedLessons();

  // Scan staging directory for generated lessons
  const stagingDir = path.join(process.cwd(), 'prisma', 'staging');
  if (fs.existsSync(stagingDir)) {
    const files = fs.readdirSync(stagingDir);
    console.log(`📂 Found staging directory with ${files.length} files.`);
    const stagedLessonsMap = new Map();

    for (const file of files) {
      if (file.startsWith('level_') && file.endsWith('_lessons.json')) {
        const match = file.match(/level_(\d+)_lessons\.json/);
        if (match) {
          const levelNum = parseInt(match[1]);
          const filePath = path.join(stagingDir, file);
          try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (content && Array.isArray(content.lessons)) {
              const processedLessons = content.lessons.map(lesson => {
                return {
                  ...lesson,
                  levelNumber: levelNum,
                  recap: typeof lesson.recap === 'object' ? JSON.stringify(lesson.recap) : (lesson.recap || '[]'),
                  quiz: typeof lesson.quiz === 'object' ? JSON.stringify(lesson.quiz) : (lesson.quiz || '[]')
                };
              });
              stagedLessonsMap.set(levelNum, processedLessons);
              console.log(`  ⭐ Loaded ${processedLessons.length} staged lessons for Level ${levelNum} from ${file}`);
            }
          } catch (e) {
            console.error(`  ❌ Error reading staging file ${file}:`, e.message);
          }
        }
      }
    }

    if (stagedLessonsMap.size > 0) {
      console.log(`🔄 Merging staged lessons into seed data (overriding static lessons where staging exists)...`);
      const overriddenLessons = [];
      const levelsWithStaging = new Set(stagedLessonsMap.keys());

      for (const lesson of seedData.lessons) {
        if (!levelsWithStaging.has(lesson.levelNumber)) {
          overriddenLessons.push(lesson);
        }
      }

      for (const [levelNum, lessons] of stagedLessonsMap.entries()) {
        overriddenLessons.push(...lessons);
      }

      seedData.lessons = overriddenLessons;
      console.log(`  ✅ Total lessons after merging staging: ${seedData.lessons.length}`);
    }
  }

  // Create levels first
  for (const level of seedData.levels) {
    await prisma.level.create({
      data: {
        number: level.number,
        title: level.title,
        description: level.description,
        icon: level.icon
      }
    });
  }
  console.log(`  ✅ Created ${seedData.levels.length} levels`);

  // Create lessons with level references
  for (const lesson of seedData.lessons) {
    const level = await prisma.level.findUnique({
      where: { number: lesson.levelNumber }
    });
    if (!level) {
      console.error(`  ⚠️ Level ${lesson.levelNumber} not found for lesson ${lesson.id}`);
      continue;
    }
    await prisma.lesson.create({
      data: {
        id: lesson.id,
        levelId: level.id,
        lessonNumber: lesson.lessonNumber,
        title: lesson.title,
        readTime: lesson.readTime,
        xpReward: lesson.xpReward,
        learningObjective: lesson.learningObjective || '',
        hook: lesson.hook || '',
        story: lesson.story || '',
        visualSuggestion: lesson.visualSuggestion || '',
        coreExplanation: lesson.coreExplanation || '',
        didYouKnow: lesson.didYouKnow || '',
        indianExample: lesson.indianExample || '',
        interactiveHint: lesson.interactiveHint || '',
        memoryTrick: lesson.memoryTrick || '',
        recap: lesson.recap || '[]',
        unlockMessage: lesson.unlockMessage || '',
        quiz: lesson.quiz || '[]'
      }
    });
  }
  console.log(`  ✅ Created ${seedData.lessons.length} lessons`);

  // 2. Seed Stocks
  console.log('📈 Seeding Stocks...');
  await prisma.stock.deleteMany();
  for (const stock of stocksData) {
    await prisma.stock.create({ data: stock });
  }

  // 3. Seed Competitors and their Holdings
  console.log('👥 Seeding Competitors...');
  await prisma.competitor.deleteMany();

  for (const comp of competitorsData) {
    const competitor = await prisma.competitor.create({
      data: {
        username: comp.username,
        avatar: comp.avatar,
        cash: comp.cash
      }
    });

    for (const h of comp.holdings) {
      await prisma.competitorHolding.create({
        data: {
          competitorId: competitor.id,
          stockId: h.stockId,
          quantity: h.quantity,
          avgPrice: h.avgPrice
        }
      });
    }
  }

  console.log('🏁 Seed Finished Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
