// Volatility fluctuation ranges
const VOLATILITY_RANGES = {
  HIGH: { min: 0.01, max: 0.05 },
  MEDIUM: { min: 0.005, max: 0.025 },
  LOW: { min: 0.001, max: 0.01 }
};

// Gen Z-themed news templates based on sector and direction
const NEWS_TEMPLATES = {
  Tech: {
    up: [
      "spikes {diff}% as a TikTok video showcasing their clean UI goes viral.",
      "surges {diff}% on rumors they're deploying a custom AI model to automate meetings.",
      "gains {diff}% as developers celebrate a new 'no-meeting Wednesday' productivity boost.",
      "rises {diff}% as Gen Z downloads spike by 40% over the weekend.",
      "jumps {diff}% after announcing a sleek, glassmorphic redesign of their mobile app."
    ],
    down: [
      "drops {diff}% following a minor AWS cloud outage that disrupted late-night scrolling.",
      "slides {diff}% as high digital advertising costs squeeze profit margins.",
      "slips {diff}% because the tech lead forgot to push the fix, causing a minor bug.",
      "dips {diff}% on profit-taking after hitting a local high yesterday.",
      "falls {diff}% as competitors launch a clone with dark-mode out of the box."
    ]
  },
  FMCG: {
    up: [
      "rises {diff}% as high-margin wellness products find massive success on social media.",
      "spikes {diff}% after securing a high-profile influencer partnership.",
      "jumps {diff}% as midnight snack deliveries hit an all-time high.",
      "gains {diff}% on steady consumer demand for their premium cosmetics range.",
      "climbs {diff}% as new eco-friendly packaging wins Gen Z loyalty."
    ],
    down: [
      "slides {diff}% due to rising raw material shipping costs in Asia.",
      "dips {diff}% as supply chain disruptions slow retail inventory replenishments.",
      "slips {diff}% as customers test alternative budget-friendly cosmetic options.",
      "falls {diff}% after minor logistics delay in urban distribution hubs.",
      "dips {diff}% as ingredient costs marginally increase this quarter."
    ]
  },
  Auto: {
    up: [
      "surges {diff}% as high-speed EV charger networks expand faster than expected.",
      "climbs {diff}% after rolling out an affordable, long-range smart EV model.",
      "jumps {diff}% on strong bookings for their new futuristic SUV line.",
      "rises {diff}% as smart assistant software updates receive 5-star ratings.",
      "spikes {diff}% on whispers of self-driving taxi test runs going smoothly."
    ],
    down: [
      "dips {diff}% as semiconductor chip supply schedules face brief delays.",
      "slides {diff}% on temporary competitive price cuts in global export markets.",
      "falls {diff}% as analysts express concerns over short-term production scaling.",
      "slips {diff}% because raw lithium prices experienced a sudden volatility spike.",
      "drops {diff}% on a minor recall of a dashboard software system."
    ]
  },
  Finance: {
    up: [
      "climbs {diff}% after launching a high-yield savings program geared for students.",
      "rises {diff}% as digital transaction volumes hit a record ₹10,000 crores.",
      "gains {diff}% on rumors of a major strategic partnership with an international payment gateway.",
      "spikes {diff}% as mobile wallet downloads reach new milestones.",
      "jumps {diff}% on stellar quarterly retail credit card spending figures."
    ],
    down: [
      "drops {diff}% as merchants adjust to newly rolled-out security guidelines.",
      "slides {diff}% as temporary server maintenance slows payment success rates.",
      "falls {diff}% on higher spending for compliance and cyber-security enhancements.",
      "slips {diff}% as competitor payment apps launch aggressive cash-back campaigns.",
      "dips {diff}% as credit defaults in small personal loans tick up slightly."
    ]
  },
  Energy: {
    up: [
      "rises {diff}% as investments in massive off-shore wind farms get approved.",
      "steady gains of {diff}% on solid industrial energy consumption figures.",
      "gains {diff}% on steady quarterly dividends and clean balance sheet ratings.",
      "climbs {diff}% after launching a carbon-capture research facility.",
      "rises {diff}% as global green-hydrogen standards receive government support."
    ],
    down: [
      "dips {diff}% on mild weather dampening residential heating and cooling grids.",
      "slips {diff}% as raw material transportation costs rise slightly.",
      "falls {diff}% due to capital expenditures on legacy power grid maintenance.",
      "slides {diff}% as seasonal output numbers dip marginally below target.",
      "drops {diff}% as global crude benchmark fluctuations cause temporary hedging drag."
    ]
  }
};

export async function simulateTicks(prisma) {
  try {
    const stocks = await prisma.stock.findMany();
    if (!stocks || stocks.length === 0) return;

    for (const stock of stocks) {
      const volType = stock.volatility || 'MEDIUM';
      const range = VOLATILITY_RANGES[volType];
      
      // Calculate a random percentage movement
      const magnitude = Math.random() * (range.max - range.min) + range.min;
      const isUp = Math.random() > 0.45; // 55% chance to go up, keeping general upward trend
      
      const multiplier = isUp ? (1 + magnitude) : (1 - magnitude);
      const newPrice = Math.max(10, Math.round(stock.price * multiplier * 100) / 100);
      const diffPercent = Math.round(Math.abs((newPrice - stock.price) / stock.price) * 1000) / 10;
      
      // Update news feed/reason if price changes
      let reason = stock.reason;
      if (diffPercent > 0.2) {
        const sectorTemplates = NEWS_TEMPLATES[stock.sector] || NEWS_TEMPLATES.Tech;
        const templates = isUp ? sectorTemplates.up : sectorTemplates.down;
        const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
        reason = `${stock.id} ${isUp ? 'rallies' : 'dips'} ${diffPercent}% ${selectedTemplate.replace('{diff}', diffPercent)}`;
      }

      await prisma.stock.update({
        where: { id: stock.id },
        data: {
          prevPrice: stock.price,
          price: newPrice,
          reason: reason
        }
      });
    }
    
    // Simulate active competitor streaks or cash updates if they trade
    // Competitors sometimes gain or lose small cash amounts to simulate dynamic trading!
    const competitors = await prisma.competitor.findMany();
    for (const comp of competitors) {
      const actionChance = Math.random();
      if (actionChance > 0.8) {
        // Simulating a small rebalancing cash gain/loss
        const cashAdjustment = (Math.random() - 0.5) * 5000;
        await prisma.competitor.update({
          where: { id: comp.id },
          data: {
            cash: Math.max(10000, Math.round((comp.cash + cashAdjustment) * 100) / 100),
            streak: Math.max(1, comp.streak + (Math.random() > 0.7 ? 1 : 0))
          }
        });
      }
    }
  } catch (error) {
    console.error('❌ Stock Price simulation tick failed:', error);
  }
}

// Global variable to keep track of last simulated time
let lastSimulatedTime = Date.now();

// Simulation Middleware: ensures price ticking when users request dashboard values
export function runSimulationMiddleware(prisma) {
  return async (req, res, next) => {
    const now = Date.now();
    // Simulate every 60 seconds on request
    if (now - lastSimulatedTime > 60000) {
      lastSimulatedTime = now;
      console.log('🔄 Triggering stock market price fluctuations...');
      await simulateTicks(prisma);
    }
    next();
  };
}
