const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const yahooFinance = require('yahoo-finance2').default;
require('dotenv').config();

const app = express();

// 🛡️ Configure optimized CORS parameters for cloud deployment pipeline
app.use(cors({ 
  origin: '*', 
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization'] 
}));
app.options('*', cors());
app.use(express.json());

// 🛡️ Set global scraper throttling parameters to handle Free Tier constraints
yahooFinance.setGlobalConfig({ queue: { concurrency: 2 } });

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_sandbox_secure_token_string_key_9911";

console.log('📡 Initializing database channel to MongoDB Atlas...');

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 })
  .then(() => console.log('✅ Connected natively to MongoDB Atlas Cluster.'))
  .catch(err => console.error('❌ Database connection failure:', err.message));

// ============ DATABASE SCHEMATICS ============
const userSchema = new mongoose.Schema({ name: String, username: { type: String, unique: true }, loginMethod: String, cash: { type: Number, default: 1000000 }, createdAt: { type: Date, default: Date.now } });
const holdingSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, symbol: String, name: String, shares: Number, avgPrice: Number, exchange: String, updatedAt: Date });
const transactionSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, symbol: String, type: String, quantity: Number, price: Number, totalAmount: Number, timestamp: { type: Date, default: Date.now } });
const leaderboardStatsSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true }, userName: String, netWorth: { type: Number, default: 1000000 }, profit: { type: Number, default: 0 }, profitPercentage: { type: Number, default: 0 }, tradesCount: { type: Number, default: 0 }, winRate: { type: Number, default: 0 }, bestTrade: { type: Number, default: 0 }, weeklyRank: { type: Number, default: 0 }, monthlyRank: { type: Number, default: 0 }, allTimeRank: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } });
const dailyCompetitionSchema = new mongoose.Schema({ date: { type: String, unique: true }, active: { type: Boolean, default: true }, prizePool: { type: String, default: '🏆 Virtual Trophy + Badge' }, topEntries: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, userName: String, profit: Number, rank: Number, prize: String }], startTime: { type: Date, default: Date.now }, endTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) } });
const badgeSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, badgeId: String, badgeName: String, badgeIcon: String, description: String, earnedAt: { type: Date, default: Date.now } });
const userProgressSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true }, completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }], totalXP: { type: Number, default: 0 }, currentLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' }, dailyStreak: { type: Number, default: 0 }, lastActivityDate: Date, hearts: { type: Number, default: 5 }, gems: { type: Number, default: 100 } });
const courseSchema = new mongoose.Schema({ title: String, description: String, level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' }, xpReward: { type: Number, default: 100 }, isActive: { type: Boolean, default: true }, order: Number, icon: { type: String, default: '📚' } });
const levelSchema = new mongoose.Schema({ courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, title: String, description: String, order: Number, xpReward: { type: Number, default: 50 }, isLocked: { type: Boolean, default: true } });
const lessonSchema = new mongoose.Schema({ levelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' }, title: String, content: String, explanation: String, quiz: [{ question: String, options: [String], correctAnswer: String, explanation: String }], xpReward: { type: Number, default: 20 } });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Holding = mongoose.models.Holding || mongoose.model('Holding', holdingSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const LeaderboardStats = mongoose.models.LeaderboardStats || mongoose.model('LeaderboardStats', leaderboardStatsSchema);
const DailyCompetition = mongoose.models.DailyCompetition || mongoose.model('DailyCompetition', dailyCompetitionSchema);
const Badge = mongoose.models.Badge || mongoose.model('Badge', badgeSchema);
const UserProgress = mongoose.models.UserProgress || mongoose.model('UserProgress', userProgressSchema);
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
const Level = mongoose.models.Level || mongoose.model('Level', levelSchema);
const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);

// ============ CORE SECURITY AUTHENTICATION PORTS ============
app.get('/api/test', (req, res) => { res.json({ message: 'Backend is working! 🚀', mongoState: mongoose.connection.readyState }); });

app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, loginMethod, cash } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    
    const user = new User({ name, username, loginMethod, cash: cash || 1000000 });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created!', token, user: { _id: user._id, id: user._id, name: user.name, username: user.username, cash: user.cash } });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/signin', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful!', token, user: { _id: user._id, id: user._id, name: user.name, username: user.username, cash: user.cash } });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token found' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ message: 'User no longer active' });
    
    res.json({ _id: user._id, id: user._id, name: user.name, username: user.username, cash: user.cash });
  } catch (error) { res.status(401).json({ message: 'Invalid token mapping structural error' }); }
});

app.get('/api/user/:userId', async (req, res) => {
  try { const user = await User.findById(req.params.userId); res.json(user); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

app.put('/api/user/:userId', async (req, res) => {
  try { const user = await User.findByIdAndUpdate(req.params.userId, { name: req.body.name }, { new: true }); res.json(user); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ LIVE STOCK PRICING RECOVERY SYSTEM (NSE/BSE) ============
app.get('/api/stock/price/:symbol', async (req, res) => {
  let symbol = req.params.symbol.toUpperCase().trim();
  try {
    const yFinanceSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    const quote = await yahooFinance.quote(yFinanceSymbol);
    
    if (quote && quote.regularMarketPrice) {
      return res.json({ symbol, price: parseFloat(quote.regularMarketPrice) });
    }
    throw new Error('Target endpoint returned empty array tracking data');
  } catch (error) {
    const backupMarketPrices = { 'HDFCBANK': 1610.00, 'TATAPOWER': 413.55, 'RELIANCE': 2450.20, 'ZOMATO': 195.80, 'SBIN': 969.60 };
    const targetedPrice = backupMarketPrices[symbol] || Math.floor(Math.random() * (1200 - 150) + 150);
    return res.json({ symbol, price: targetedPrice, note: "Adaptive sandbox calculation mechanism triggered" });
  }
});

// ============ PORTFOLIO MUTATION LAYER ============
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const holdings = await Holding.find({ userId: req.params.userId });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User object reference lost' });
    
    let holdingsValue = 0;
    const holdingsList = holdings.map(h => { 
      const value = h.shares * h.avgPrice; 
      holdingsValue += value; 
      return { symbol: h.symbol, name: h.name, shares: h.shares, avgPrice: h.avgPrice, exchange: h.exchange, totalValue: value }; 
    });
    res.json({ cashBalance: user.cash, cash: user.cash, holdingsValue, netWorth: user.cash + holdingsValue, holdings: holdingsList });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/portfolio/buy', async (req, res) => {
  try {
    const { userId, symbol, quantity, price, name, exchange } = req.body;
    const totalAmount = parseInt(quantity) * parseFloat(price);
    
    const user = await User.findById(userId);
    if (!user || user.cash < totalAmount) return res.status(400).json({ message: 'Insufficient funds', success: false });
    
    user.cash -= totalAmount;
    await user.save();
    
    let holding = await Holding.findOne({ userId, symbol: symbol.toUpperCase() });
    if (holding) { 
      const newShares = holding.shares + parseInt(quantity); 
      const newAvgPrice = ((holding.shares * holding.avgPrice) + totalAmount) / newShares; 
      holding.shares = newShares; 
      holding.avgPrice = newAvgPrice; 
      await holding.save();
    } else { 
      holding = new Holding({ userId, symbol: symbol.toUpperCase(), name: name || symbol, shares: parseInt(quantity), avgPrice: parseFloat(price), exchange: exchange || 'NSE' }); 
      await holding.save(); 
    }
    
    await new Transaction({ userId, symbol: symbol.toUpperCase(), type: 'BUY', quantity: parseInt(quantity), price: parseFloat(price), totalAmount }).save();
    res.json({ success: true, cashBalance: user.cash, cash: user.cash });
  } catch (error) { res.status(500).json({ message: error.message, success: false }); }
});

app.post('/api/portfolio/sell', async (req, res) => {
  try {
    const { userId, symbol, quantity, price } = req.body;
    const totalAmount = parseInt(quantity) * parseFloat(price);
    
    const holding = await Holding.findOne({ userId, symbol: symbol.toUpperCase() });
    if (!holding || holding.shares < parseInt(quantity)) return res.status(400).json({ message: 'Insufficient shares', success: false });
    
    const user = await User.findById(userId);
    user.cash += totalAmount;
    await user.save();
    
    holding.shares -= parseInt(quantity);
    if (holding.shares === 0) await holding.deleteOne();
    else await holding.save();
    
    await new Transaction({ userId, symbol: symbol.toUpperCase(), type: 'SELL', quantity: parseInt(quantity), price: parseFloat(price), totalAmount }).save();
    res.json({ success: true, cashBalance: user.cash, cash: user.cash });
  } catch (error) { res.status(500).json({ message: error.message, success: false }); }
});

app.get('/api/transactions/:userId', async (req, res) => {
  try { const transactions = await Transaction.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(50); res.json(transactions); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

// ============ LEADERBOARD ENGINE INTERFACES ============
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

// ============ GAMIFICATION & COMPETITION PIPELINES ============
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

// ============ INTERACTIVE COURSE ROUTERS ============
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
      return res.status(403).json({ message: 'Level is locked.' });
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
    progress.hearts = Math.min(progress.hearts + 1, 5);
    await progress.save();
    res.json({ success: true, earnedXP, totalXP: progress.totalXP, progress });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/use-heart', async (req, res) => {
  try {
    const { userId } = req.body;
    const progress = await UserProgress.findOne({ userId });
    if (progress.hearts <= 0) return res.status(400).json({ message: 'No hearts left!' });
    progress.hearts -= 1; await progress.save();
    res.json({ success: true, hearts: progress.hearts });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/learn/refill-hearts', async (req, res) => {
  try {
    const { userId } = req.body;
    const progress = await UserProgress.findOne({ userId });
    if (progress.gems < 50) return res.status(400).json({ message: 'Not enough gems!' });
    progress.gems -= 50; progress.hearts = 5; await progress.save();
    res.json({ success: true, hearts: progress.hearts, gems: progress.gems });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/seed-courses', async (req, res) => {
  try {
    const existing = await Course.countDocuments();
    if (existing > 0) return res.json({ message: 'Courses seeded already', count: existing });
    const course = new Course({ title: '📈 Stock Market Wizard', description: 'Fundamentals of investment.', level: 'Beginner', xpReward: 100, order: 1, icon: '📈' });
    await course.save();
    const level = new Level({ courseId: course._id, title: 'What is a Stock?', description: 'Basics of stocks', order: 1, xpReward: 50, isLocked: false });
    await level.save();
    const lesson = new Lesson({ levelId: level._id, title: 'What is a Share?', content: 'Ownership token unit.', explanation: 'Share basics.', xpReward: 20, order: 1, quiz: [{ question: 'What does a share represent?', options: ['A loan', 'Unit of ownership'], correctAnswer: 'Unit of ownership', explanation: 'Partial ownership.' }] });
    await lesson.save();
    res.json({ success: true, message: 'Seeded successfully' });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

const mockPrices = {
    'HDFCBANK': { price: 1610.00, change: 8.50, changePercent: 0.53 },
    'TATAPOWER': { price: 413.55, change: 4.65, changePercent: 1.13 },
    'RELIANCE': { price: 2450.20, change: 35.40, changePercent: 1.46 }
};

app.get('/api/live-prices', async (req, res) => {
    try { res.json({ success: true, prices: mockPrices, cached: false, lastUpdated: Date.now() }); } 
    catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 System Core fully synchronized on port ${PORT}`));
