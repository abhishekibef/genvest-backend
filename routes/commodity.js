import express from 'express';
import https from 'https';
import { COMMODITY_CATALOG, getCommodityBySymbol, isCommodityMarketOpen } from '../commodityConfig.js';

// In-memory cache for live commodity quotes and 5-day charts
const quotesCache = {};
const chartCache = {};
let lastFetchTime = 0;

// Helper to fetch JSON from Yahoo Finance with standard agent headers
function fetchYahooJSON(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Background poller to refresh commodity quotes every 30 seconds
async function refreshCommodityQuotes() {
  for (const item of COMMODITY_CATALOG) {
    try {
      const path = `/v8/finance/chart/${encodeURIComponent(item.yahooTicker)}?interval=1d&range=5d`;
      const json = await fetchYahooJSON(path);
      const result = json?.chart?.result?.[0];
      const meta = result?.meta;

      if (meta && meta.regularMarketPrice) {
        const currentPrice = meta.regularMarketPrice;
        const q = result?.indicators?.quote?.[0];
        const validOpens = q?.open?.filter(o => o != null && !isNaN(o)) || [];
        const sessionOpen = validOpens.length > 0 ? validOpens[validOpens.length - 1] : null;
        
        // XM 360 calculates the daily performance from the current session open,
        // falling back to previous close (not currentPrice which would always show 0%)
        const baseRef = sessionOpen || meta.chartPreviousClose || currentPrice;
        const change = currentPrice - baseRef;
        const changePercent = baseRef > 0 ? (change / baseRef) * 100 : 0;
        const dayHigh = meta.regularMarketDayHigh || Math.max(currentPrice, baseRef);
        const dayLow = meta.regularMarketDayLow || Math.min(currentPrice, baseRef);

        const halfSpread = (item.spread || 0.5) / 2;
        const bid = Math.max(0, currentPrice - halfSpread);
        const ask = currentPrice + halfSpread;

        quotesCache[item.symbol] = {
          symbol: item.symbol,
          name: item.name,
          subtitle: item.subtitle,
          category: item.category,
          iconType: item.iconType,
          price: currentPrice,
          yahooAnchor: currentPrice, // Anchor for micro-tick mean-reversion (prevents drift)
          bid,
          ask,
          spread: item.spread,
          prevClose: meta.chartPreviousClose || currentPrice,
          baseRef,
          change,
          changePercent,
          dayHigh,
          dayLow,
          contractSize: item.contractSize,
          maxLeverage: item.maxLeverage,
          digits: item.digits,
          updatedAt: Date.now()
        };
      }
    } catch {
      // Keep existing cache
    }
  }
  lastFetchTime = Date.now();
}

// Seed initial fallback cache on boot
for (const item of COMMODITY_CATALOG) {
  const p = item.baseFallbackPrice;
  const halfSpread = (item.spread || 0.5) / 2;
  quotesCache[item.symbol] = {
    symbol: item.symbol,
    name: item.name,
    subtitle: item.subtitle,
    category: item.category,
    iconType: item.iconType,
    price: p,
    bid: p - halfSpread,
    ask: p + halfSpread,
    spread: item.spread,
    prevClose: p * 0.985,
    change: p * 0.015,
    changePercent: 1.50,
    dayHigh: p * 1.012,
    dayLow: p * 0.988,
    contractSize: item.contractSize,
    maxLeverage: item.maxLeverage,
    digits: item.digits,
    updatedAt: Date.now()
  };
}

// Trigger live fetch from Yahoo Finance every 8s (tighter than previous 20s for XM 360-accurate pricing)
refreshCommodityQuotes();
setInterval(refreshCommodityQuotes, 8000);

// Real-Time Micro-Tick Engine (simulates XM 360 live order-book liquidity during open market hours)
// Ticks prices by small increments every 1.5 seconds so users see live flashing rates when market is open.
// Uses MEAN-REVERSION anchoring: micro-ticks orbit the last Yahoo-confirmed price so displayed prices
// never drift more than a fraction of a percent from the real market price (matching XM 360 behavior).
setInterval(() => {
  for (const item of COMMODITY_CATALOG) {
    // If the market is closed, FREEZE the price (no micro-ticks on weekends / outside market hours)
    if (!isCommodityMarketOpen(item.symbol)) continue;

    const q = quotesCache[item.symbol];
    if (!q) continue;

    // Mean-reversion anchor: pull price back toward the last Yahoo-confirmed real price
    // This prevents unbounded random-walk drift that was causing Moolzen prices to diverge from XM 360
    const anchor = q.yahooAnchor || q.price;
    const drift = (anchor - q.price) * 0.05; // 5% pull toward real price per tick
    // Zero-mean random noise: (Math.random() - 0.5) has mean 0, no directional bias
    const noise = (Math.random() - 0.5) * 0.0002 * q.price;
    const newPrice = parseFloat((q.price + drift + noise).toFixed(item.digits || 2));

    const halfSpread = (item.spread || 0.5) / 2;
    const bid = parseFloat(Math.max(0, newPrice - halfSpread).toFixed(item.digits || 2));
    const ask = parseFloat((newPrice + halfSpread).toFixed(item.digits || 2));

    const ref = q.baseRef || q.prevClose || newPrice;
    const change = newPrice - ref;
    const changePercent = ref > 0 ? (change / ref) * 100 : 0;
    const dayHigh = Math.max(q.dayHigh, newPrice);
    const dayLow = Math.min(q.dayLow, newPrice);

    quotesCache[item.symbol] = {
      ...q,
      price: newPrice,
      bid,
      ask,
      change,
      changePercent,
      dayHigh,
      dayLow,
      lastTickDir: newPrice >= q.price ? 'up' : 'down',
      updatedAt: Date.now()
    };
  }
}, 1500);

export function getCommodityRouter(prisma) {
  const router = express.Router();

  // 1. GET /api/commodities - List all commodities with live prices
  router.get('/commodities', (req, res) => {
    const list = COMMODITY_CATALOG.map(item => {
      const isMarketOpen = isCommodityMarketOpen(item.symbol);
      const q = quotesCache[item.symbol] || {
        symbol: item.symbol,
        name: item.name,
        subtitle: item.subtitle,
        category: item.category,
        iconType: item.iconType,
        price: item.baseFallbackPrice,
        bid: item.baseFallbackPrice - item.spread / 2,
        ask: item.baseFallbackPrice + item.spread / 2,
        spread: item.spread,
        change: 0,
        changePercent: 0,
        dayHigh: item.baseFallbackPrice,
        dayLow: item.baseFallbackPrice,
        contractSize: item.contractSize,
        maxLeverage: item.maxLeverage,
        digits: item.digits
      };
      return {
        ...q,
        isMarketOpen,
        marketStatus: isMarketOpen ? 'Open' : 'Market Closed'
      };
    });

    res.json({
      success: true,
      commodities: list,
      count: list.length,
      timestamp: Date.now()
    });
  });

  // 2. GET /api/commodities/chart/:symbol - Candlestick OHLCV data for Lightweight-Charts
  router.get('/commodities/chart/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const timeframe = (req.query.timeframe || '1H').toLowerCase();
      const config = getCommodityBySymbol(symbol);
      if (!config) return res.status(404).json({ error: 'Commodity not found' });

      // Determine Yahoo interval, range and procedural stepSec
      let interval = '1m';
      let range = '1d';
      let stepSec = 60;
      let numCandles = 60;

      if (timeframe === '1m') {
        interval = '1m'; range = '1d'; stepSec = 60; numCandles = 60;
      } else if (timeframe === '2m') {
        interval = '2m'; range = '1d'; stepSec = 120; numCandles = 60;
      } else if (timeframe === '3m' || timeframe === '4m' || timeframe === '5m') {
        interval = '5m'; range = '1d'; stepSec = 300; numCandles = 60;
      } else if (timeframe === '10m' || timeframe === '15m') {
        interval = '15m'; range = '5d'; stepSec = 900; numCandles = 50;
      } else if (timeframe === '30m') {
        interval = '30m'; range = '5d'; stepSec = 1800; numCandles = 50;
      } else if (timeframe === '1h' || timeframe === '2h' || timeframe === '3h' || timeframe === '4h') {
        interval = '60m'; range = '1mo'; 
        const hrs = parseInt(timeframe, 10) || 1;
        stepSec = hrs * 3600;
        numCandles = 50;
      } else if (timeframe === '1d') {
        interval = '1d'; range = '3mo'; stepSec = 86400; numCandles = 60;
      } else if (timeframe === '1w' || timeframe === '1wk') {
        interval = '1wk'; range = '1y'; stepSec = 86400 * 7; numCandles = 52;
      } else if (timeframe === '1mo' || timeframe === '3mo') {
        interval = '1mo'; range = '2y'; stepSec = 86400 * 30; numCandles = 36;
      } else if (timeframe.endsWith('m')) {
        const mins = parseInt(timeframe, 10) || 15;
        interval = mins <= 5 ? '5m' : (mins <= 15 ? '15m' : '30m');
        range = mins <= 15 ? '1d' : '5d';
        stepSec = mins * 60;
        numCandles = 50;
      } else if (timeframe.endsWith('h')) {
        const hrs = parseInt(timeframe, 10) || 1;
        interval = '60m'; range = '1mo';
        stepSec = hrs * 3600;
        numCandles = 50;
      } else if (timeframe.endsWith('d')) {
        const days = parseInt(timeframe, 10) || 1;
        interval = '1d'; range = '1y';
        stepSec = days * 86400;
        numCandles = 60;
      }

      const path = `/v8/finance/chart/${encodeURIComponent(config.yahooTicker)}?interval=${interval}&range=${range}`;
      const json = await fetchYahooJSON(path);
      const result = json?.chart?.result?.[0];

      if (result && result.timestamp && result.indicators?.quote?.[0]) {
        const timestamps = result.timestamp;
        const q = result.indicators.quote[0];
        const candles = [];

        for (let i = 0; i < timestamps.length; i++) {
          if (q.open[i] != null && q.high[i] != null && q.low[i] != null && q.close[i] != null) {
            candles.push({
              time: timestamps[i],
              open: parseFloat(q.open[i].toFixed(config.digits)),
              high: parseFloat(q.high[i].toFixed(config.digits)),
              low: parseFloat(q.low[i].toFixed(config.digits)),
              close: parseFloat(q.close[i].toFixed(config.digits))
            });
          }
        }

        if (candles.length > 0) {
          return res.json({ success: true, symbol, timeframe, candles });
        }
      }

      // Procedural fallback generator if Yahoo times out
      const currentPrice = quotesCache[config.symbol]?.price || config.baseFallbackPrice;
      const candles = [];
      let p = currentPrice * 0.985;
      const now = Math.floor(Date.now() / 1000);

      for (let i = numCandles; i >= 0; i--) {
        const t = now - (i * stepSec);
        const delta = (Math.random() - 0.5) * (currentPrice * 0.003);
        const open = p;
        const close = open + delta;
        const high = Math.max(open, close) + Math.random() * (currentPrice * 0.0015);
        const low = Math.min(open, close) - Math.random() * (currentPrice * 0.0015);
        p = close;
        candles.push({
          time: t,
          open: parseFloat(open.toFixed(config.digits)),
          high: parseFloat(high.toFixed(config.digits)),
          low: parseFloat(low.toFixed(config.digits)),
          close: parseFloat(close.toFixed(config.digits))
        });
      }

      return res.json({ success: true, symbol, timeframe, candles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. GET /api/commodities/analysis/:symbol - AI Overview, sentiment, and technical score (Screenshot 5)
  router.get('/commodities/analysis/:symbol', (req, res) => {
    const { symbol } = req.params;
    const config = getCommodityBySymbol(symbol);
    if (!config) return res.status(404).json({ error: 'Commodity not found' });

    const quote = quotesCache[config.symbol] || {
      price: config.baseFallbackPrice,
      dayHigh: config.baseFallbackPrice * 1.01,
      dayLow: config.baseFallbackPrice * 0.99,
      changePercent: 1.2
    };

    const isBullish = quote.changePercent >= 0;
    const sentimentBuy = isBullish ? 51 + Math.floor(Math.random() * 8) : 42 + Math.floor(Math.random() * 6);
    const sentimentSell = 100 - sentimentBuy;

    // AI Overview narrative matching XM 360 screenshot 5
    const narrative = `${config.name} remained broadly range-bound despite big swings, sliding early this week, rallying into Wednesday's session, then testing key psychological pivot points. Shifting interest rate expectations, global supply chain inventories, and macroeconomic macro bets drove active volatility.`;

    res.json({
      success: true,
      symbol: config.symbol,
      name: config.name,
      overview: {
        sentiment: isBullish ? 'Bullish' : (Math.abs(quote.changePercent) < 0.5 ? 'Neutral' : 'Bearish'),
        narrative,
        lastUpdatedText: '20 min ago'
      },
      sentiment: {
        buyPercent: sentimentBuy,
        sellPercent: sentimentSell
      },
      dailyPriceRange: {
        low: quote.dayLow,
        high: quote.dayHigh,
        current: quote.price,
        percent: quote.changePercent
      },
      technicalScore: {
        shortTerm: isBullish ? 'Bullish' : 'Bearish',
        shortTermScore: isBullish ? 4 : 2, // out of 5
        intermediate: 'Bullish',
        intermediateScore: 4
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER: Compute full account summary (XM 360 style)
  // Balance stays constant — margin is "locked" collateral, not an expense.
  // ═══════════════════════════════════════════════════════════════════════════════
  async function computeAccountSummary(prisma, userId) {
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) return null;

    const balance = user.commodityCash != null ? user.commodityCash : 10000.0;
    const leverage = user.commodityLeverage || 100;

    const openPositions = await prisma.commodityPosition.findMany({
      where: { userId: Number(userId), status: 'OPEN' }
    });

    let totalFloatingPnl = 0;
    let totalUsedMargin = 0;

    for (const pos of openPositions) {
      const quote = quotesCache[pos.symbol] || { bid: pos.entryPrice, ask: pos.entryPrice, price: pos.entryPrice };
      const currentExitPrice = pos.type === 'BUY' ? quote.bid : quote.ask;
      const livePnl = pos.type === 'BUY'
        ? (currentExitPrice - pos.entryPrice) * pos.unitsPerLot * pos.lots
        : (pos.entryPrice - currentExitPrice) * pos.unitsPerLot * pos.lots;

      totalFloatingPnl += livePnl;
      totalUsedMargin += pos.marginUsed;
    }

    const equity = balance + totalFloatingPnl;
    const freeMargin = equity - totalUsedMargin;
    const marginLevel = totalUsedMargin > 0
      ? Math.round((equity / totalUsedMargin) * 100)
      : null;

    return {
      balance,
      equity: parseFloat(equity.toFixed(2)),
      unrealizedPnl: parseFloat(totalFloatingPnl.toFixed(2)),
      usedMargin: parseFloat(totalUsedMargin.toFixed(2)),
      freeMargin: parseFloat(freeMargin.toFixed(2)),
      marginLevel: marginLevel != null ? `${marginLevel}%` : '-',
      marginLevelRaw: marginLevel,
      leverage,
      credit: 0.00,
      openPositionCount: openPositions.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. POST /api/commodities/trade — Execute Buy (Long) or Sell (Short)
  //    XM 360 model: Balance stays constant, margin is locked collateral.
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/commodities/trade', async (req, res) => {
    try {
      const { userId, symbol, type, lots, stopLoss, takeProfit } = req.body;
      const numLots = parseFloat(lots) || 1.0;

      if (!['BUY', 'SELL'].includes(type)) {
        return res.status(400).json({ error: 'Order type must be BUY or SELL' });
      }

      const config = getCommodityBySymbol(symbol);
      if (!config) return res.status(404).json({ error: 'Invalid commodity symbol' });

      if (!isCommodityMarketOpen(config.symbol)) {
        return res.status(400).json({
          error: 'Commodity market is currently closed. Standard commodities open Sunday 6:00 PM EST (Monday 3:30 AM IST).'
        });
      }

      if (numLots < config.minLot || numLots > config.maxLot) {
        return res.status(400).json({ error: `Lots must be between ${config.minLot} and ${config.maxLot}` });
      }

      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const quote = quotesCache[config.symbol] || { price: config.baseFallbackPrice, bid: config.baseFallbackPrice, ask: config.baseFallbackPrice };
      // Buy executes at Ask, Sell executes at Bid (XM 360 broker mechanics)
      const executionPrice = type === 'BUY' ? quote.ask : quote.bid;

      // Effective leverage = min(user's leverage, instrument max)
      const userLeverage = user.commodityLeverage || 100;
      const effectiveLeverage = Math.min(userLeverage, config.maxLeverage || 1000);

      // Margin required = (Price * ContractSize * Lots) / Leverage
      const notionalValue = executionPrice * config.contractSize * numLots;
      const marginRequired = notionalValue / effectiveLeverage;

      // Compute free margin dynamically (XM 360 style — balance is NOT reduced by margin)
      const account = await computeAccountSummary(prisma, userId);
      if (account.freeMargin < marginRequired) {
        return res.status(400).json({
          error: `Insufficient free margin. Required: $${marginRequired.toFixed(2)}, Available: $${account.freeMargin.toFixed(2)}`
        });
      }

      // DO NOT deduct from commodityCash — balance stays constant (XM 360 model)
      // Margin is tracked via position.marginUsed

      const position = await prisma.commodityPosition.create({
        data: {
          userId: Number(userId),
          symbol: config.symbol,
          name: config.name,
          type,
          lots: numLots,
          unitsPerLot: config.contractSize,
          entryPrice: executionPrice,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          marginUsed: parseFloat(marginRequired.toFixed(2)),
          status: 'OPEN'
        }
      });

      // Return updated account summary
      const updatedAccount = await computeAccountSummary(prisma, userId);

      res.json({
        success: true,
        position,
        balance: updatedAccount.balance,
        account: updatedAccount
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. POST /api/commodities/close — Close an open position
  //    XM 360 model: Only realized P/L changes balance.
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/commodities/close', async (req, res) => {
    try {
      const { userId, positionId } = req.body;
      const position = await prisma.commodityPosition.findUnique({ where: { id: Number(positionId) } });

      if (!position) return res.status(404).json({ error: 'Position not found' });
      if (position.userId !== Number(userId)) return res.status(403).json({ error: 'Unauthorized' });
      if (position.status !== 'OPEN') return res.status(400).json({ error: 'Position is already closed' });

      const config = getCommodityBySymbol(position.symbol);
      const quote = quotesCache[position.symbol] || {
        price: position.entryPrice,
        bid: position.entryPrice,
        ask: position.entryPrice
      };

      // To close a BUY, we sell at BID; to close a SELL, we buy at ASK
      const exitPrice = position.type === 'BUY' ? quote.bid : quote.ask;

      // PnL calculation:
      // BUY: (Exit - Entry) * ContractSize * Lots
      // SELL: (Entry - Exit) * ContractSize * Lots
      let pnl = 0;
      if (position.type === 'BUY') {
        pnl = (exitPrice - position.entryPrice) * position.unitsPerLot * position.lots;
      } else {
        pnl = (position.entryPrice - exitPrice) * position.unitsPerLot * position.lots;
      }

      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      const currentBalance = user.commodityCash != null ? user.commodityCash : 10000.0;

      // XM 360 model: Only realized P/L changes the balance (margin is NOT "returned")
      const newBalance = Math.max(0, currentBalance + pnl);

      const updatedUser = await prisma.user.update({
        where: { id: Number(userId) },
        data: { commodityCash: newBalance }
      });

      const updatedPosition = await prisma.commodityPosition.update({
        where: { id: Number(positionId) },
        data: {
          status: 'CLOSED',
          exitPrice,
          pnl: parseFloat(pnl.toFixed(2)),
          closedAt: new Date()
        }
      });

      const account = await computeAccountSummary(prisma, userId);

      res.json({
        success: true,
        position: updatedPosition,
        pnl: parseFloat(pnl.toFixed(2)),
        balance: updatedUser.commodityCash,
        account
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. GET /api/commodities/positions/:userId — Open & closed trades with live P/L
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/commodities/positions/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const positions = await prisma.commodityPosition.findMany({
        where: { userId: Number(userId) },
        orderBy: { openedAt: 'desc' },
        take: 100
      });

      const enriched = positions.map(pos => {
        if (pos.status === 'OPEN') {
          const quote = quotesCache[pos.symbol] || { bid: pos.entryPrice, ask: pos.entryPrice, price: pos.entryPrice };
          const currentExitPrice = pos.type === 'BUY' ? quote.bid : quote.ask;
          let livePnl = 0;
          if (pos.type === 'BUY') {
            livePnl = (currentExitPrice - pos.entryPrice) * pos.unitsPerLot * pos.lots;
          } else {
            livePnl = (pos.entryPrice - currentExitPrice) * pos.unitsPerLot * pos.lots;
          }

          return {
            ...pos,
            currentPrice: currentExitPrice,
            livePnl: parseFloat(livePnl.toFixed(2))
          };
        }
        return pos;
      });

      // Return full account summary alongside positions
      const account = await computeAccountSummary(prisma, userId);

      res.json({
        success: true,
        balance: account?.balance ?? 10000.0,
        account,
        positions: enriched
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. POST /api/commodities/reset-balance — Reset demo balance to $10,000.00
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/commodities/reset-balance', async (req, res) => {
    try {
      const { userId, amount } = req.body;
      const resetAmount = parseFloat(amount) || 10000.0;
      const updatedUser = await prisma.user.update({
        where: { id: Number(userId) },
        data: { commodityCash: resetAmount }
      });
      res.json({ success: true, balance: updatedUser.commodityCash });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. GET /api/commodities/account/:userId — Full XM 360-style account summary
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/commodities/account/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const account = await computeAccountSummary(prisma, userId);
      if (!account) return res.status(404).json({ error: 'User not found' });

      res.json({ success: true, ...account });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 9. PUT /api/commodities/leverage — Update user's leverage setting
  // ═══════════════════════════════════════════════════════════════════════════════
  router.put('/commodities/leverage', async (req, res) => {
    try {
      const { userId, leverage } = req.body;
      const numLeverage = parseInt(leverage, 10);

      if (!numLeverage || numLeverage < 1 || numLeverage > 1000) {
        return res.status(400).json({ error: 'Leverage must be between 1 and 1000' });
      }

      // Check if user has open positions — warn but still allow (recalculate margin)
      const openCount = await prisma.commodityPosition.count({
        where: { userId: Number(userId), status: 'OPEN' }
      });

      const updatedUser = await prisma.user.update({
        where: { id: Number(userId) },
        data: { commodityLeverage: numLeverage }
      });

      // If user has open positions, recalculate margin for each position with new leverage
      if (openCount > 0) {
        const openPositions = await prisma.commodityPosition.findMany({
          where: { userId: Number(userId), status: 'OPEN' }
        });

        for (const pos of openPositions) {
          const config = getCommodityBySymbol(pos.symbol);
          if (config) {
            const effectiveLev = Math.min(numLeverage, config.maxLeverage || 1000);
            const newMargin = (pos.entryPrice * pos.unitsPerLot * pos.lots) / effectiveLev;
            await prisma.commodityPosition.update({
              where: { id: pos.id },
              data: { marginUsed: parseFloat(newMargin.toFixed(2)) }
            });
          }
        }
      }

      const account = await computeAccountSummary(prisma, userId);

      res.json({
        success: true,
        leverage: updatedUser.commodityLeverage,
        openPositionsRecalculated: openCount,
        account
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SL/TP Auto-Trigger + Stop-Out Engine (runs on existing 1.5s tick loop)
  // ═══════════════════════════════════════════════════════════════════════════════
  async function runStopOutAndSLTP() {
    try {
      const openPositions = await prisma.commodityPosition.findMany({
        where: { status: 'OPEN' }
      });

      if (openPositions.length === 0) return;

      // Group positions by userId for account-level stop-out checks
      const userPositions = {};
      for (const pos of openPositions) {
        if (!userPositions[pos.userId]) userPositions[pos.userId] = [];
        userPositions[pos.userId].push(pos);
      }

      for (const [uid, positions] of Object.entries(userPositions)) {
        const userId = Number(uid);

        for (const pos of positions) {
          const quote = quotesCache[pos.symbol];
          if (!quote) continue;

          const currentExitPrice = pos.type === 'BUY' ? quote.bid : quote.ask;
          const currentPrice = quote.price;

          // --- SL/TP Auto-Trigger ---
          let shouldClose = false;
          let closeReason = '';

          if (pos.stopLoss != null) {
            if (pos.type === 'BUY' && currentPrice <= pos.stopLoss) {
              shouldClose = true;
              closeReason = 'Stop Loss triggered';
            } else if (pos.type === 'SELL' && currentPrice >= pos.stopLoss) {
              shouldClose = true;
              closeReason = 'Stop Loss triggered';
            }
          }

          if (pos.takeProfit != null && !shouldClose) {
            if (pos.type === 'BUY' && currentPrice >= pos.takeProfit) {
              shouldClose = true;
              closeReason = 'Take Profit triggered';
            } else if (pos.type === 'SELL' && currentPrice <= pos.takeProfit) {
              shouldClose = true;
              closeReason = 'Take Profit triggered';
            }
          }

          if (shouldClose) {
            const exitPrice = currentExitPrice;
            const pnl = pos.type === 'BUY'
              ? (exitPrice - pos.entryPrice) * pos.unitsPerLot * pos.lots
              : (pos.entryPrice - exitPrice) * pos.unitsPerLot * pos.lots;

            const user = await prisma.user.findUnique({ where: { id: userId } });
            const bal = user?.commodityCash ?? 10000.0;

            await prisma.user.update({
              where: { id: userId },
              data: { commodityCash: Math.max(0, bal + pnl) }
            });

            await prisma.commodityPosition.update({
              where: { id: pos.id },
              data: {
                status: 'CLOSED',
                exitPrice,
                pnl: parseFloat(pnl.toFixed(2)),
                closedAt: new Date()
              }
            });

            console.log(`[SLTP] ${closeReason} for position #${pos.id} (${pos.symbol} ${pos.type}): PnL $${pnl.toFixed(2)}`);
          }
        }

        // --- Stop-Out Check (account level, 20% threshold) ---
        const account = await computeAccountSummary(prisma, userId);
        if (account && account.marginLevelRaw != null && account.marginLevelRaw < 20 && account.openPositionCount > 0) {
          // Find the position with the worst (most negative) P/L
          const openPosWithPnl = [];
          const userOpenPositions = await prisma.commodityPosition.findMany({
            where: { userId, status: 'OPEN' }
          });

          for (const pos of userOpenPositions) {
            const quote = quotesCache[pos.symbol];
            if (!quote) continue;
            const exitP = pos.type === 'BUY' ? quote.bid : quote.ask;
            const pnl = pos.type === 'BUY'
              ? (exitP - pos.entryPrice) * pos.unitsPerLot * pos.lots
              : (pos.entryPrice - exitP) * pos.unitsPerLot * pos.lots;
            openPosWithPnl.push({ pos, exitP, pnl });
          }

          // Sort by P/L ascending (worst loss first)
          openPosWithPnl.sort((a, b) => a.pnl - b.pnl);

          if (openPosWithPnl.length > 0) {
            const worst = openPosWithPnl[0];
            const user = await prisma.user.findUnique({ where: { id: userId } });
            const bal = user?.commodityCash ?? 10000.0;

            await prisma.user.update({
              where: { id: userId },
              data: { commodityCash: Math.max(0, bal + worst.pnl) }
            });

            await prisma.commodityPosition.update({
              where: { id: worst.pos.id },
              data: {
                status: 'CLOSED',
                exitPrice: worst.exitP,
                pnl: parseFloat(worst.pnl.toFixed(2)),
                closedAt: new Date()
              }
            });

            console.log(`[STOP-OUT] Auto-closed position #${worst.pos.id} (${worst.pos.symbol} ${worst.pos.type}) at margin level ${account.marginLevelRaw}%. PnL: $${worst.pnl.toFixed(2)}`);
          }
        }
      }
    } catch (err) {
      // Silent — don't crash the tick loop
      console.warn('[SLTP/StopOut] Background check error:', err.message);
    }
  }

  // Run SL/TP and stop-out checks every 3 seconds (offset from the 1.5s micro-tick)
  setInterval(() => runStopOutAndSLTP(), 3000);

  return router;
}

