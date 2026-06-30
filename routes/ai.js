import express from 'express';

// Dynamic question templates that rotate daily
const MARKET_QUESTION_TEMPLATES = [
  'Why did {market} move today?',
  'What drove {market} this session?',
  "What's behind today's {market} move?",
  'Why is {market} up or down today?',
  "What's moving {market} right now?",
  "Today's big story: What happened to {market}?",
  'What triggered {market} today?',
];

// Free RSS feed URLs for Indian stock market news
const NEWS_RSS_FEEDS = [
  'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',
  'https://www.moneycontrol.com/rss/latestnews.xml',
  'https://www.business-standard.com/rss/markets-106.rss',
];

async function fetchRSSFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moolzen/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();

    // Strip CDATA wrappers first
    const clean = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content) => content.trim());

    // Parse RSS items
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(.*?)<\/title>/;
    const linkRegex = /<link>(.*?)<\/link>|<guid[^>]*>(https?:\/\/[^<]*)<\/guid>/;
    const descRegex = /<description>([\s\S]*?)<\/description>/;

    let match;
    while ((match = itemRegex.exec(clean)) !== null && items.length < 5) {
      const itemText = match[1];
      const titleMatch = titleRegex.exec(itemText);
      const linkMatch = linkRegex.exec(itemText);
      const descMatch = descRegex.exec(itemText);

      const title = (titleMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      const link = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
      const desc = (descMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim().slice(0, 200);

      if (title && link && title.length > 5) {
        items.push({ title, link, desc });
      }
    }
    return items;
  } catch (e) {
    return [];
  }
}

export function getAiRouter() {
  const router = express.Router();

  // Returns today's dynamic market question
  router.get('/market-question', async (req, res) => {
    try {
      const marketName = req.query.market || 'NIFTY 50';
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
      const template = MARKET_QUESTION_TEMPLATES[dayOfYear % MARKET_QUESTION_TEMPLATES.length];
      const question = template.replace('{market}', marketName);
      return res.json({ success: true, question });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get market question' });
    }
  });

  // Fetches real market news from free RSS feeds
  router.get('/market-story', async (req, res) => {
    try {
      // Try RSS feeds in order until we get results
      let allItems = [];
      for (const feedUrl of NEWS_RSS_FEEDS) {
        const items = await fetchRSSFeed(feedUrl);
        if (items.length > 0) {
          allItems = items;
          break;
        }
      }

      if (allItems.length === 0) {
        return res.json({
          success: true,
          story: "Indian markets saw active trading today. Key sectors including Banking, IT, and Auto were in focus. Stay tuned for live updates from NSE and BSE.",
          sources: [],
          isLive: false
        });
      }

      // Build a story summary from the top headlines
      const headlines = allItems.slice(0, 3);
      const story = headlines
        .map((item, i) => {
          const prefix = i === 0 ? '📈 ' : i === 1 ? '🔍 ' : '💡 ';
          return `${prefix}${item.title}${item.desc ? '\n' + item.desc + '...' : ''}`;
        })
        .join('\n\n');

      const sources = headlines.map(item => ({ uri: item.link, title: item.title }));

      return res.json({ success: true, story, sources, isLive: true });
    } catch (error) {
      console.error('Error fetching market story:', error);
      return res.status(500).json({ error: 'Failed to fetch market story', details: error.message });
    }
  });

  return router;
}
