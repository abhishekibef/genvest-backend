import express from 'express';
import https from 'https';
import { COMMODITY_CATALOG, getCommodityBySymbol } from '../commodityConfig.js';

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
        const closes = result?.indicators?.quote?.[0]?.close?.filter(c => c != null && !isNaN(c)) || [];
        // True previous close is second-to-last candle close
        const prevClose = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose || currentPrice);
        const change = currentPrice - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
        const dayHigh = meta.regularMarketDayHigh || currentPrice * 1.008;
        const dayLow = meta.regularMarketDayLow || currentPrice * 0.992;

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
          bid,
          ask,
          spread: item.spread,
          prevClose,
          change,
          changePercent,
          dayHigh,
          dayLow,
          contractSize: item.contractSize,
          leverage: item.leverage,
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
    leverage: item.leverage,
    digits: item.digits,
    updatedAt: Date.now()
  };
}

// Trigger first live fetch immediately and then schedule every 25s
refreshCommodityQuotes();
setInterval(refreshCommodityQuotes, 25000);

export function getCommodityRouter(prisma) {
  const router = express.Router();

  // 1. GET /api/commodities - List all commodities with live prices
  router.get('/commodities', (req, res) => {
    const list = COMMODITY_CATALOG.map(item => {
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
        leverage: item.leverage,
        digits: item.digits
      };
      return q;
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
      const timeframe = req.query.timeframe || '1H'; // 1H, 1D, 1W, 1M, 3M, 1Y
      const config = getCommodityBySymbol(symbol);
      if (!config) return res.status(404).json({ error: 'Commodity not found' });

      // Map timeframes to Yahoo intervals and ranges
      const tfMap = {
        '1H': { interval: '1m', range: '1d' },
        '1D': { interval: '5m', range: '1d' },
        '1W': { interval: '15m', range: '5d' },
        '1M': { interval: '1d', range: '1mo' },
        '3M': { interval: '1d', range: '3mo' },
        '1Y': { interval: '1wk', range: '1y' }
      };

      const { interval, range } = tfMap[timeframe] || tfMap['1H'];
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
      const numCandles = 60;
      const stepSec = timeframe === '1H' ? 60 : (timeframe === '1D' ? 300 : 86400);
      let p = currentPrice * 0.985;
      const now = Math.floor(Date.now() / 1000);

      for (let i = numCandles; i >= 0; i--) {
        const t = now - (i * stepSec);
        const delta = (Math.random() - 0.48) * (currentPrice * 0.003);
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

  // 4. POST /api/commodities/trade - Execute Buy (Long) or Sell (Short)
  router.post('/commodities/trade', async (req, res) => {
    try {
      const { userId, symbol, type, lots, stopLoss, takeProfit } = req.body;
      const numLots = parseFloat(lots) || 1.0;

      if (!['BUY', 'SELL'].includes(type)) {
        return res.status(400).json({ error: 'Order type must be BUY or SELL' });
      }

      const config = getCommodityBySymbol(symbol);
      if (!config) return res.status(404).json({ error: 'Invalid commodity symbol' });

      if (numLots < config.minLot || numLots > config.maxLot) {
        return res.status(400).json({ error: `Lots must be between ${config.minLot} and ${config.maxLot}` });
      }

      const quote = quotesCache[config.symbol] || { price: config.baseFallbackPrice, bid: config.baseFallbackPrice, ask: config.baseFallbackPrice };
      // Buy executes at Ask, Sell executes at Bid (XM 360 broker mechanics)
      const executionPrice = type === 'BUY' ? quote.ask : quote.bid;

      // Margin required = (Price * UnitsPerLot * Lots) / Leverage
      const notionalValue = executionPrice * config.contractSize * numLots;
      const marginRequired = notionalValue / config.leverage;

      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const currentBalance = user.commodityCash != null ? user.commodityCash : 10000.0;
      if (currentBalance < marginRequired) {
        return res.status(400).json({ 
          error: `Insufficient USD funds. Required Margin: $${marginRequired.toFixed(2)}, Available: $${currentBalance.toFixed(2)}` 
        });
      }

      // Deduct margin from virtual USD cash
      const updatedUser = await prisma.user.update({
        where: { id: Number(userId) },
        data: { commodityCash: currentBalance - marginRequired }
      });

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
          marginUsed: marginRequired,
          status: 'OPEN'
        }
      });

      res.json({
        success: true,
        position,
        balance: updatedUser.commodityCash
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. POST /api/commodities/close - Close an open position
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
      const returnAmount = position.marginUsed + pnl;

      const updatedUser = await prisma.user.update({
        where: { id: Number(userId) },
        data: { commodityCash: Math.max(0, currentBalance + returnAmount) }
      });

      const updatedPosition = await prisma.commodityPosition.update({
        where: { id: Number(positionId) },
        data: {
          status: 'CLOSED',
          exitPrice,
          pnl,
          closedAt: new Date()
        }
      });

      res.json({
        success: true,
        position: updatedPosition,
        pnl,
        balance: updatedUser.commodityCash
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. GET /api/commodities/positions/:userId - Get open and closed trades with live mark-to-market PnL
  router.get('/commodities/positions/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const positions = await prisma.commodityPosition.findMany({
        where: { userId: Number(userId) },
        orderBy: { openedAt: 'desc' },
        take: 100
      });

      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      const balance = user?.commodityCash != null ? user.commodityCash : 10000.0;

      const enriched = positions.map(pos => {
        if (pos.status === 'OPEN') {
          const config = getCommodityBySymbol(pos.symbol);
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

      res.json({
        success: true,
        balance,
        positions: enriched
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. POST /api/commodities/reset-balance - Reset demo balance to $10,000.00
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

  return router;
}
