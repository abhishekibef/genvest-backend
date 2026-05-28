const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({ origin: '*', credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;
console.log('📡 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB error:', err.message));

// ============ SCHEMAS ============
const userSchema = new mongoose.Schema({ name: String, username: { type: String, unique: true }, loginMethod: String, cash: { type: Number, default: 1000000 }, createdAt: { type: Date, default: Date.now } });
const holdingSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, symbol: String, name: String, shares: Number, avgPrice: Number, exchange: String, updatedAt: Date });
const transactionSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, symbol: String, type: String, quantity: Number, price: Number, totalAmount: Number, timestamp: { type: Date, default: Date.now } });
const leaderboardStatsSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true }, userName: String, netWorth: { type: Number, default: 1000000 }, profit: { type: Number, default: 0 }, profitPercentage: { type: Number, default: 0 }, tradesCount: { type: Number, default: 0 }, winRate: { type: Number, default: 0 }, bestTrade: { type: Number, default: 0 }, weeklyRank: { type: Number, default: 0 }, monthlyRank: { type: Number, default: 0 }, allTimeRank: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } });
const dailyCompetitionSchema = new mongoose.Schema({ date: { type: String, unique: true }, active: { type: Boolean, default: true }, prizePool: { type: String, default: '🏆 Virtual Trophy + Badge' }, topEntries: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, userName: String, profit: Number, rank: Number, prize: String }], startTime: { type: Date, default: Date.now }, endTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) } });
const badgeSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, badgeId: String, badgeName: String, badgeIcon: String, description: String, earnedAt: { type: Date, default: Date.now } });
const tutorialProgressSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, tutorialId: String, tutorialName: String, completed: { type: Boolean, default: false }, completedAt: Date, score: { type: Number, default: 0 } });
const courseSchema = new mongoose.Schema({ title: String, description: String, level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' }, xpReward: { type: Number, default: 100 }, isActive: { type: Boolean, default: true }, order: Number, icon: { type: String, default: '📚' } });
const levelSchema = new mongoose.Schema({ courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, title: String, description: String, order: Number, xpReward: { type: Number, default: 50 }, isLocked: { type: Boolean, default: true } });
const lessonSchema = new mongoose.Schema({ levelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' }, title: String, content: String, explanation: String, quiz: [{ question: String, options: [String], correctAnswer: String, explanation: String }], xpReward: { type: Number, default: 20 } });
const userProgressSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true }, completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }], totalXP: { type: Number, default: 0 }, currentLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' }, dailyStreak: { type: Number, default: 0 }, lastActivityDate: Date, hearts: { type: Number, default: 5 }, gems: { type: Number, default: 100 } });

const User = mongoose.model('User', userSchema);
const Holding = mongoose.model('Holding', holdingSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const LeaderboardStats = mongoose.model('LeaderboardStats', leaderboardStatsSchema);
const DailyCompetition = mongoose.model('DailyCompetition', dailyCompetitionSchema);
const Badge = mongoose.model('Badge', badgeSchema);
const TutorialProgress = mongoose.model('TutorialProgress', tutorialProgressSchema);
const Course = mongoose.model('Course', courseSchema);
const Level = mongoose.model('Level', levelSchema);
const Lesson = mongoose.model('Lesson', lessonSchema);
const UserProgress = mongoose.model('UserProgress', userProgressSchema);

// ============ BASIC API ROUTES ============
app.get('/api/test', (req, res) => { res.json({ message: 'Backend is working! 🚀', mongoState: mongoose.connection.readyState }); });

app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, loginMethod, cash } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const user = new User({ name, username, loginMethod, cash: cash || 1000000 });
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created!', token, user: { id: user._id, name: user.name, username: user.username, cash: user.cash } });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/signin', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful!', token, user: { id: user._id, name: user.name, username: user.username, cash: user.cash } });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    res.json({ id: user._id, name: user.name, username: user.username, cash: user.cash });
  } catch (error) { res.status(401).json({ message: 'Invalid token' }); }
});

app.get('/api/user/:userId', async (req, res) => {
  try { const user = await User.findById(req.params.userId); res.json(user); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

app.put('/api/user/:userId', async (req, res) => {
  try { const user = await User.findByIdAndUpdate(req.params.userId, { name: req.body.name }, { new: true }); res.json(user); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ PORTFOLIO API ============
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const holdings = await Holding.find({ userId: req.params.userId });
    const user = await User.findById(req.params.userId);
    let holdingsValue = 0;
    const holdingsList = holdings.map(h => { const value = h.shares * h.avgPrice; holdingsValue += value; return { symbol: h.symbol, name: h.name, shares: h.shares, avgPrice: h.avgPrice, exchange: h.exchange, totalValue: value }; });
    res.json({ cashBalance: user.cash, holdingsValue, netWorth: user.cash + holdingsValue, holdings: holdingsList });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// FIXED BUY ENDPOINT - Guaranteed cash deduction
app.post('/api/portfolio/buy', async (req, res) => {
  try {
    const { userId, symbol, quantity, price, name, exchange } = req.body;
    const totalAmount = quantity * price;
    
    console.log(`📊 BUY REQUEST: User ${userId}, Symbol ${symbol}, Qty ${quantity}, Price ${price}, Total ${totalAmount}`);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found', success: false });
    }
    
    console.log(`💰 Current cash balance: ${user.cash}`);
    
    if (user.cash < totalAmount) {
      console.log(`❌ Insufficient funds: Need ${totalAmount}, Have ${user.cash}`);
      return res.status(400).json({ message: 'Insufficient funds', success: false });
    }
    
    // DEDUCT CASH - This is the critical line
    user.cash = user.cash - totalAmount;
    await user.save();
    
    console.log(`✅ Cash deducted. New balance: ${user.cash}`);
    
    // Update or create holding
    let holding = await Holding.findOne({ userId, symbol });
    if (holding) {
      const newShares = holding.shares + quantity;
      const newAvgPrice = ((holding.shares * holding.avgPrice) + totalAmount) / newShares;
      holding.shares = newShares;
      holding.avgPrice = newAvgPrice;
      console.log(`📈 Updated holding: ${symbol}, Shares: ${newShares}, Avg Price: ${newAvgPrice}`);
    } else {
      holding = new Holding({ userId, symbol, name: name || symbol, shares: quantity, avgPrice: price, exchange: exchange || 'NSE' });
      await holding.save();
      console.log(`📈 Created new holding: ${symbol}, Shares: ${quantity}, Avg Price: ${price}`);
    }
    
    // Record transaction
    await new Transaction({ userId, symbol, type: 'BUY', quantity, price, totalAmount }).save();
    console.log(`📝 Transaction recorded: BUY ${quantity} ${symbol}`);
    
    res.json({ success: true, cashBalance: user.cash, message: `Bought ${quantity} shares of ${symbol}` });
  } catch (error) {
    console.error('❌ Buy error:', error);
    res.status(500).json({ message: error.message, success: false });
  }
});

// FIXED SELL ENDPOINT - Guaranteed cash addition
app.post('/api/portfolio/sell', async (req, res) => {
  try {
    const { userId, symbol, quantity, price } = req.body;
    const totalAmount = quantity * price;
    
    console.log(`📊 SELL REQUEST: User ${userId}, Symbol ${symbol}, Qty ${quantity}, Price ${price}, Total ${totalAmount}`);
    
    const holding = await Holding.findOne({ userId, symbol });
    if (!holding || holding.shares < quantity) {
      console.log(`❌ Insufficient shares: Have ${holding?.shares || 0}, Need ${quantity}`);
      return res.status(400).json({ message: 'Insufficient shares', success: false });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found', success: false });
    }
    
    console.log(`💰 Current cash balance: ${user.cash}`);
    
    // ADD CASH
    user.cash = user.cash + totalAmount;
    await user.save();
    
    console.log(`✅ Cash added. New balance: ${user.cash}`);
    
    // Update holding
    holding.shares -= quantity;
    if (holding.shares === 0) {
      await holding.deleteOne();
      console.log(`📈 Holding deleted: ${symbol}`);
    } else {
      await holding.save();
      console.log(`📈 Updated holding: ${symbol}, Remaining shares: ${holding.shares}`);
    }
    
    // Record transaction
    await new Transaction({ userId, symbol, type: 'SELL', quantity, price, totalAmount }).save();
    console.log(`📝 Transaction recorded: SELL ${quantity} ${symbol}`);
    
    res.json({ success: true, cashBalance: user.cash, message: `Sold ${quantity} shares of ${symbol}` });
  } catch (error) {
    console.error('❌ Sell error:', error);
    res.status(500).json({ message: error.message, success: false });
  }
});

app.get('/api/transactions/:userId', async (req, res) => {
  try { const transactions = await Transaction.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(50); res.json(transactions); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ LEADERBOARD API ============
app.post('/api/leaderboard/update', async (req, res) => {
  try {
    const { userId, userName, netWorth, profit, profitPercentage, tradesCount } = req.body;
    let stats = await LeaderboardStats.findOne({ userId });
    if (!stats) stats = new LeaderboardStats({ userId, userName });
    Object.assign(stats, { userName, netWorth, profit, profitPercentage, tradesCount, updatedAt: Date.now() });
    await stats.save();
    const allUsers = await LeaderboardStats.find().sort({ netWorth: -1 });
    for (let i = 0; i < allUsers.length; i++) { allUsers[i].allTimeRank = i + 1; await allUsers[i].save(); }
    res.json({ success: true, stats });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    let sortField = period === 'weekly' ? 'weeklyRank' : period === 'monthly' ? 'monthlyRank' : 'netWorth';
    const leaderboard = await LeaderboardStats.find().sort({ [sortField]: 1, netWorth: -1 }).limit(parseInt(limit)).populate('userId', 'name');
    res.json(leaderboard);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/leaderboard/rank/:userId', async (req, res) => {
  try {
    const stats = await LeaderboardStats.findOne({ userId: req.params.userId });
    if (!stats) return res.json({ rank: null });
    const higherRanked = await LeaderboardStats.countDocuments({ netWorth: { $gt: stats.netWorth } });
    res.json({ rank: higherRanked + 1, stats });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ COMPETITION API ============
app.get('/api/competition/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let competition = await DailyCompetition.findOne({ date: today });
    if (!competition) { competition = new DailyCompetition({ date: today }); await competition.save(); }
    res.json(competition);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/competition/join', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const today = new Date().toISOString().split('T')[0];
    let competition = await DailyCompetition.findOne({ date: today });
    if (!competition) { competition = new DailyCompetition({ date: today }); }
    if (!competition.topEntries.some(e => e.userId.toString() === userId)) {
      competition.topEntries.push({ userId, userName, profit: 0, rank: 0 });
      await competition.save();
    }
    res.json({ success: true, competition });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/competition/update', async (req, res) => {
  try {
    const { userId, profit } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const competition = await DailyCompetition.findOne({ date: today });
    if (!competition) return res.json({ message: 'No active competition' });
    const entry = competition.topEntries.find(e => e.userId.toString() === userId);
    if (entry) {
      entry.profit = profit;
      competition.topEntries.sort((a, b) => b.profit - a.profit);
      competition.topEntries.forEach((e, idx) => { e.rank = idx + 1; e.prize = idx === 0 ? '🏆 Champion Badge + 500 Points' : idx === 1 ? '🥈 Runner Up Badge + 300 Points' : idx === 2 ? '🥉 Third Place Badge + 100 Points' : '🎖️ Participation Badge'; });
      await competition.save();
    }
    res.json({ success: true, competition });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ BADGES API ============
app.get('/api/badges/:userId', async (req, res) => { try { const badges = await Badge.find({ userId: req.params.userId }); res.json(badges); } catch (error) { res.status(500).json({ message: error.message }); } });

app.post('/api/badges/award', async (req, res) => {
  try {
    const { userId, badgeId } = req.body;
    const badges = { 'first_trade': { name: 'First Trade', icon: '🎯', description: 'Completed your first trade' }, 'profit_master': { name: 'Profit Master', icon: '📈', description: 'Made 10% profit overall' }, 'daily_champion': { name: 'Daily Champion', icon: '🏆', description: 'Won a daily competition' }, 'tutorial_complete': { name: 'Scholar', icon: '📚', description: 'Completed all tutorials' }, 'trade_streak': { name: 'Streak Master', icon: '🔥', description: 'Traded 7 days in a row' }, 'high_roller': { name: 'High Roller', icon: '💰', description: 'Portfolio crossed ₹50 Lakhs' } };
    const badgeInfo = badges[badgeId];
    if (!badgeInfo) return res.status(400).json({ message: 'Invalid badge ID' });
    const existing = await Badge.findOne({ userId, badgeId });
    if (existing) return res.json({ message: 'Badge already awarded' });
    const badge = new Badge({ userId, badgeId, badgeName: badgeInfo.name, badgeIcon: badgeInfo.icon, description: badgeInfo.description });
    await badge.save();
    res.json({ success: true, badge });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ LEARN MODULE API ============
app.get('/api/learn/courses', async (req, res) => {
  try {
    const courses = await Course.find().sort({ order: 1 });
    const coursesWithLevels = await Promise.all(courses.map(async (course) => {
      const levels = await Level.find({ courseId: course._id }).sort({ order: 1 });
      return { ...course.toObject(), levels };
    }));
    res.json(coursesWithLevels);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/learn/progress/:userId', async (req, res) => {
  try {
    let progress = await UserProgress.findOne({ userId: req.params.userId });
    if (!progress) { progress = new UserProgress({ userId: req.params.userId }); await progress.save(); }
    res.json(progress);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/learn/lessons/:levelId/:userId', async (req, res) => {
  try {
    const { levelId, userId } = req.params;
    const progress = await UserProgress.findOne({ userId });
    const level = await Level.findById(levelId);
    if (level.isLocked && (!progress || !progress.completedLessons.includes(levelId))) {
      return res.status(403).json({ message: 'Level is locked. Complete previous level first.' });
    }
    const lessons = await Lesson.find({ levelId }).sort({ order: 1 });
    res.json(lessons);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/complete-lesson', async (req, res) => {
  try {
    const { userId, lessonId, score } = req.body;
    let progress = await UserProgress.findOne({ userId });
    if (!progress) progress = new UserProgress({ userId });
    if (progress.completedLessons.includes(lessonId)) return res.json({ message: 'Lesson already completed', progress });
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    const earnedXP = Math.floor(lesson.xpReward * (score / 100));
    progress.completedLessons.push(lessonId);
    progress.totalXP += earnedXP;
    progress.lastActivityDate = new Date();
    const today = new Date();
    if (progress.lastActivityDate && today.toDateString() !== new Date(progress.lastActivityDate).toDateString()) {
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      if (new Date(progress.lastActivityDate).toDateString() === yesterday.toDateString()) progress.dailyStreak += 1;
      else progress.dailyStreak = 1;
    } else if (!progress.lastActivityDate) progress.dailyStreak = 1;
    progress.hearts = Math.min(progress.hearts + 1, 5);
    await progress.save();
    const allLessonsInLevel = await Lesson.find({ levelId: lesson.levelId });
    const completedCount = await Promise.all(allLessonsInLevel.map(l => progress.completedLessons.includes(l._id))).then(r => r.filter(Boolean).length);
    if (completedCount === allLessonsInLevel.length) {
      const currentLevel = await Level.findById(lesson.levelId);
      const nextLevel = await Level.findOne({ courseId: currentLevel.courseId, order: currentLevel.order + 1 });
      if (nextLevel) { nextLevel.isLocked = false; await nextLevel.save(); }
    }
    res.json({ success: true, earnedXP, totalXP: progress.totalXP, dailyStreak: progress.dailyStreak, hearts: progress.hearts, progress });
  } catch (error) { console.error('Complete lesson error:', error); res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/use-heart', async (req, res) => {
  try {
    const { userId } = req.body;
    const progress = await UserProgress.findOne({ userId });
    if (!progress) return res.status(404).json({ message: 'User progress not found' });
    if (progress.hearts <= 0) return res.status(400).json({ message: 'No hearts left!' });
    progress.hearts -= 1;
    await progress.save();
    res.json({ success: true, hearts: progress.hearts });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/refill-hearts', async (req, res) => {
  try {
    const { userId } = req.body;
    const progress = await UserProgress.findOne({ userId });
    if (!progress) return res.status(404).json({ message: 'User progress not found' });
    if (progress.gems < 50) return res.status(400).json({ message: 'Not enough gems!' });
    progress.gems -= 50;
    progress.hearts = 5;
    await progress.save();
    res.json({ success: true, hearts: progress.hearts, gems: progress.gems });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/award-gems', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const progress = await UserProgress.findOne({ userId });
    if (!progress) return res.status(404).json({ message: 'User progress not found' });
    progress.gems += amount;
    await progress.save();
    res.json({ success: true, gems: progress.gems });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ SEED COURSES (RUN ONCE) ============
app.post('/api/seed-courses', async (req, res) => {
  try {
    const existing = await Course.countDocuments();
    if (existing > 0) return res.json({ message: 'Courses already exist!', count: existing });
    const course = new Course({ title: '📈 Stock Market Wizard', description: 'Learn the fundamentals of stock market investing from scratch.', level: 'Beginner', xpReward: 100, order: 1, icon: '📈' });
    await course.save();
    const level = new Level({ courseId: course._id, title: 'What is a Stock?', description: 'Understanding the basics of stocks and ownership', order: 1, xpReward: 50, isLocked: false });
    await level.save();
    const lesson1 = new Lesson({ levelId: level._id, title: 'What is a Share?', content: 'A share represents a unit of ownership in a company.', explanation: 'Understanding shares is the foundation of stock market investing.', xpReward: 20, order: 1, quiz: [{ question: 'What does a share represent?', options: ['A loan', 'Unit of ownership', 'Guaranteed profit', 'Bank deposit'], correctAnswer: 'Unit of ownership', explanation: 'A share represents partial ownership in a company.' }] });
    await lesson1.save();
    const lesson2 = new Lesson({ levelId: level._id, title: 'Why Do Stock Prices Move?', content: 'Stock prices change due to supply and demand.', explanation: 'Understanding price movements helps you trade better.', xpReward: 20, order: 2, quiz: [{ question: 'What primarily drives stock price changes?', options: ['Company size', 'Supply and demand', 'CEO salary', 'Office location'], correctAnswer: 'Supply and demand', explanation: 'Stock prices change based on buyers and sellers.' }] });
    await lesson2.save();
    res.json({ success: true, message: '✅ Courses seeded!', courses: 1, levels: 1, lessons: 2 });
  } catch (error) { res.status(500).json({ message: error.message }); }
});
// ============ LIVE MARKET PRICES API ============

// CORRECT IMPORTS
const TwelveData = require('@twelvedata/twelvedata-node');
const yahooFinance = require('yahoo-finance2').default;

// Initialize Twelve Data with your API key
const twelvedata = new TwelveData.TwelveDataClient({
    apikey: process.env.TWELVE_DATA_API_KEY || 'f8700aeb354a4effbf4d8fca57ee83a1'
});

// Cache to reduce API calls
let priceCache = {};
let lastCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// List of NSE stocks to track
const TRACKED_SYMBOLS = [
    'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS', 'KOTAKBANK.NS',
    'TATAPOWER.NS', 'RELIANCE.NS', 'ZOMATO.NS', 'TCS.NS', 'INFY.NS'
];

function getBaseSymbol(fullSymbol) {
    return fullSymbol.replace('.NS', '');
}

// Endpoint to get live prices
app.get('/api/live-prices', async (req, res) => {
    try {
        const now = Date.now();
        
        // Return cached prices if still fresh
        if (lastCacheTime && (now - lastCacheTime) < CACHE_DURATION && Object.keys(priceCache).length > 0) {
            return res.json({
                success: true,
                prices: priceCache,
                cached: true,
                lastUpdated: lastCacheTime
            });
        }
        
        console.log('🔄 Fetching live prices...');
        
        // Try Twelve Data first (primary source)
        try {
            const quotes = await Promise.all(
                TRACKED_SYMBOLS.map(symbol => 
                    twelvedata.quote(symbol).catch(e => null)
                )
            );
            
            const newPrices = {};
            quotes.forEach((quote, index) => {
                if (quote && quote.price) {
                    const baseSymbol = getBaseSymbol(TRACKED_SYMBOLS[index]);
                    newPrices[baseSymbol] = {
                        price: parseFloat(quote.price),
                        change: quote.change || 0,
                        changePercent: quote.percent_change || 0,
                        source: 'twelvedata'
                    };
                }
            });
            
            if (Object.keys(newPrices).length > 0) {
                priceCache = newPrices;
                lastCacheTime = now;
                console.log(`✅ Twelve Data: ${Object.keys(newPrices).length} stocks`);
                return res.json({ success: true, prices: newPrices, cached: false, lastUpdated: now });
            }
        } catch (tdError) {
            console.log('⚠️ Twelve Data failed, falling back to Yahoo Finance');
        }
        
        // Fallback to Yahoo Finance
        const quotes = await yahooFinance.quoteCombine(TRACKED_SYMBOLS);
        const newPrices = {};
        quotes.forEach(quote => {
            const baseSymbol = getBaseSymbol(quote.symbol);
            newPrices[baseSymbol] = {
                price: quote.regularMarketPrice || 0,
                change: quote.regularMarketChange || 0,
                changePercent: quote.regularMarketChangePercent || 0,
                source: 'yahoo'
            };
        });
        
        priceCache = newPrices;
        lastCacheTime = now;
        
        console.log(`✅ Yahoo Finance: ${Object.keys(newPrices).length} stocks`);
        
        res.json({
            success: true,
            prices: newPrices,
            cached: false,
            lastUpdated: now
        });
        
    } catch (error) {
        console.error('❌ Live prices error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
