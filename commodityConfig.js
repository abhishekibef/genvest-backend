/**
 * Commodity Instrument Configuration (XM 360 Style)
 * Standard lot sizes, decimal precisions, typical spreads, and market category
 */

export const COMMODITY_CATALOG = [
  // --- PRECIOUS METALS ---
  {
    symbol: 'GOLD',
    yahooTicker: 'GC=F',
    name: 'GOLD',
    subtitle: 'Gold vs USD (XAU/USD)',
    category: 'Metals',
    iconType: 'gold',
    contractSize: 100, // 100 troy oz per 1.0 standard lot
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    maxLeverage: 20, // 20x leverage (5% margin)
    spread: 0.51, // $0.51 typical spread as seen in XM 360
    digits: 2,
    baseFallbackPrice: 4358.50,
  },
  {
    symbol: 'SILVER',
    yahooTicker: 'SI=F',
    name: 'SILVER',
    subtitle: 'Silver vs USD (XAG/USD)',
    category: 'Metals',
    iconType: 'silver',
    contractSize: 5000, // 5,000 troy oz
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 0.035,
    digits: 3,
    baseFallbackPrice: 65.765,
  },
  {
    symbol: 'XPTUSD',
    yahooTicker: 'PL=F',
    name: 'XPTUSD',
    subtitle: 'Platinum Spot',
    category: 'Metals',
    iconType: 'platinum',
    contractSize: 50,
    minLot: 0.01,
    maxLot: 10.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 2.10,
    digits: 2,
    baseFallbackPrice: 1780.44,
  },
  {
    symbol: 'XPDUSD',
    yahooTicker: 'PA=F',
    name: 'XPDUSD',
    subtitle: 'Palladium Spot',
    category: 'Metals',
    iconType: 'palladium',
    contractSize: 50,
    minLot: 0.01,
    maxLot: 10.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 3.50,
    digits: 2,
    baseFallbackPrice: 1278.91,
  },
  {
    symbol: 'HGCOP-DEC26',
    yahooTicker: 'HG=F',
    name: 'HGCOP-DEC26',
    subtitle: 'High Grade Copper Futures December 2026',
    category: 'Metals',
    iconType: 'copper',
    contractSize: 25000, // 25,000 lbs
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 0.0035,
    digits: 4,
    baseFallbackPrice: 6.6523,
  },

  // --- ENERGIES ---
  {
    symbol: 'OILCash',
    yahooTicker: 'CL=F',
    name: 'OILCash',
    subtitle: 'WTI Oil Cash',
    category: 'Energies',
    iconType: 'oil',
    contractSize: 1000, // 1,000 barrels
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 0.05,
    digits: 2,
    baseFallbackPrice: 101.03,
  },
  {
    symbol: 'BRENTCash',
    yahooTicker: 'BZ=F',
    name: 'BRENTCash',
    subtitle: 'BRENT Cash',
    category: 'Energies',
    iconType: 'brent',
    contractSize: 1000, // 1,000 barrels
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 0.06,
    digits: 2,
    baseFallbackPrice: 104.75,
  },
  {
    symbol: 'NGASCash',
    yahooTicker: 'NG=F',
    name: 'NGASCash',
    subtitle: 'Natural Gas Cash',
    category: 'Energies',
    iconType: 'gas',
    contractSize: 10000, // 10,000 mmBtu
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 20,
    spread: 0.008,
    digits: 3,
    baseFallbackPrice: 2.902,
  },

  // --- AGRICULTURE & SOFT COMMODITIES ---
  {
    symbol: 'COCOA-DEC26',
    yahooTicker: 'CC=F',
    name: 'COCOA-DEC26',
    subtitle: 'US Cocoa Futures December 2026',
    category: 'Agriculture',
    iconType: 'cocoa',
    contractSize: 10, // 10 metric tonnes
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 5.0,
    digits: 0,
    baseFallbackPrice: 5805,
  },
  {
    symbol: 'COFFE-DEC26',
    yahooTicker: 'KC=F',
    name: 'COFFE-DEC26',
    subtitle: 'US Coffee Futures December 2026',
    category: 'Agriculture',
    iconType: 'coffee',
    contractSize: 37500, // 37,500 lbs
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.003,
    digits: 4,
    baseFallbackPrice: 2.7640,
  },
  {
    symbol: 'CORN-DEC26',
    yahooTicker: 'ZC=F',
    name: 'CORN-DEC26',
    subtitle: 'US Corn Futures December 2026',
    category: 'Agriculture',
    iconType: 'corn',
    contractSize: 5000, // 5,000 bushels
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.005,
    digits: 4,
    baseFallbackPrice: 5.2738,
  },
  {
    symbol: 'WHEAT-DEC26',
    yahooTicker: 'ZW=F',
    name: 'WHEAT-DEC26',
    subtitle: 'US Wheat Futures December 2026',
    category: 'Agriculture',
    iconType: 'wheat',
    contractSize: 5000,
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.005,
    digits: 4,
    baseFallbackPrice: 7.2417,
  },
  {
    symbol: 'SUGAR-OCT26',
    yahooTicker: 'SB=F',
    name: 'SUGAR-OCT26',
    subtitle: 'US Sugar No.11 Futures October 2026',
    category: 'Agriculture',
    iconType: 'sugar',
    contractSize: 112000, // 112,000 lbs
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.0005,
    digits: 4,
    baseFallbackPrice: 0.1745,
  },
  {
    symbol: 'COTTO-DEC26',
    yahooTicker: 'CT=F',
    name: 'COTTO-DEC26',
    subtitle: 'US Cotton No.2 Futures December 2026',
    category: 'Agriculture',
    iconType: 'cotton',
    contractSize: 50000, // 50,000 lbs
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.001,
    digits: 4,
    baseFallbackPrice: 0.8241,
  },
  {
    symbol: 'SBEAN-NOV26',
    yahooTicker: 'ZS=F',
    name: 'SBEAN-NOV26',
    subtitle: 'US Soybeans Futures November 2026',
    category: 'Agriculture',
    iconType: 'soybeans',
    contractSize: 5000,
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    maxLeverage: 10,
    spread: 0.01,
    digits: 4,
    baseFallbackPrice: 13.1545,
  }
];

export function getCommodityBySymbol(symbol) {
  return COMMODITY_CATALOG.find(c => c.symbol === symbol || c.name === symbol) || null;
}

/**
 * Checks whether global commodity exchanges are currently open for trading.
 * Follows CME (COMEX/NYMEX), ICE, and LME global schedule:
 * - Weekly Session: Sunday 18:00 EST to Friday 17:00 EST
 * - Weekend Close: Friday 17:00 EST to Sunday 18:00 EST (Entire Saturday & Sunday daytime)
 * - Daily Maintenance Break: Mon-Thu 17:00 to 18:00 EST
 * - Special 24/7 contracts (e.g. GOLD24-7) remain open 24/7
 */
export function isCommodityMarketOpen(symbol = '', date = new Date()) {
  if (symbol && (symbol.endsWith('24-7') || symbol.includes('247'))) {
    return true;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const comps = {};
    for (const p of parts) comps[p.type] = p.value;

    const day = comps.weekday; // 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
    const hour = parseInt(comps.hour, 10);
    const minute = parseInt(comps.minute, 10);
    const timeInMinutes = hour * 60 + minute;

    // Friday after 17:00 (5:00 PM) ET is closed for the weekend
    if (day === 'Fri' && timeInMinutes >= 17 * 60) return false;
    // Saturday is completely closed
    if (day === 'Sat') return false;
    // Sunday before 18:00 (6:00 PM) ET is closed
    if (day === 'Sun' && timeInMinutes < 18 * 60) return false;

    // Daily maintenance break: Mon-Thu 17:00 to 18:00 ET
    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(day) && timeInMinutes >= 17 * 60 && timeInMinutes < 18 * 60) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

