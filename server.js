const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// ============ SIMPLIFIED CORS - ALLOWS ALL ORIGINS ============
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());

// ============ MONGODB CONNECTION ============
const MONGODB_URI = process.env.MONGODB_URI;

console.log('='.repeat(50));
console.log('📡 ATTEMPTING TO CONNECT TO MONGODB...');
console.log('='.repeat(50));

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
  .then(() => {
    console.log('✅✅✅ MONGODB CONNECTED SUCCESSFULLY! ✅✅✅');
    console.log(`📦 Database name: ${mongoose.connection.name}`);
  })
  .catch(err => {
    console.error('❌❌❌ MONGODB CONNECTION ERROR ❌❌❌');
    console.error(`Error message: ${err.message}`);
  });

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  loginMethod: { type: String, enum: ['mobile', 'email'] },
  cash: { type: Number, default: 1000000.00 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ============ PORTFOLIO SCHEMAS ============

// Holding Schema (stocks owned by user)
const holdingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  shares: { type: Number, required: true, default: 0 },
  avgPrice: { type: Number, required: true },
  exchange: { type: String, default: 'NSE' },
  updatedAt: { type: Date, default: Date.now }
});

// Transaction Schema (buy/sell records)
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Holding = mongoose.model('Holding', holdingSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ============ API ROUTES ============

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend is working! 🚀',
    mongoState: mongoose.connection.readyState
  });
});

// Sign Up
app.post('/api/signup', async (req, res) => {
  console.log('📝 Signup request for:', req.body.username);
  
  try {
    const { name, username, loginMethod, cash } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database not ready' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    const user = new User({
      name,
      username,
      loginMethod,
      cash: cash || 1000000.00
    });
    
    await user.save();
    console.log('✅ User created:', username);
    
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        cash: user.cash
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Sign In
app.post('/api/signin', async (req, res) => {
  console.log('🔐 Signin request for:', req.body.username);
  
  try {
    const { username } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database not ready' });
    }
    
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found. Please sign up first.' });
    }
    
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ User signed in:', username);
    
    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        cash: user.cash
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Verify Token
app.get('/api/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      id: user._id,
      name: user.name,
      username: user.username,
      cash: user.cash
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ============ PORTFOLIO API ROUTES ============

// Get user's portfolio (holdings + cash balance)
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const holdings = await Holding.find({ userId });
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let holdingsValue = 0;
    const holdingsList = holdings.map(h => {
      const value = h.shares * h.avgPrice;
      holdingsValue += value;
      return {
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgPrice: h.avgPrice,
        exchange: h.exchange,
        totalValue: value
      };
    });
    
    res.json({
      cashBalance: user.cash,
      holdingsValue: holdingsValue,
      netWorth: user.cash + holdingsValue,
      holdings: holdingsList
    });
  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Buy stock
app.post('/api/portfolio/buy', async (req, res) => {
  try {
    const { userId, symbol, quantity, price, name, exchange } = req.body;
    const totalAmount = quantity * price;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.cash < totalAmount) {
      return res.status(400).json({ message: 'Insufficient funds', success: false });
    }
    
    // Deduct cash
    user.cash -= totalAmount;
    await user.save();
    
    // Update or create holding
    let holding = await Holding.findOne({ userId, symbol });
    if (holding) {
      const newShares = holding.shares + quantity;
      const newAvgPrice = ((holding.shares * holding.avgPrice) + totalAmount) / newShares;
      holding.shares = newShares;
      holding.avgPrice = newAvgPrice;
      holding.updatedAt = Date.now();
    } else {
      holding = new Holding({ 
        userId, 
        symbol, 
        name: name || symbol, 
        shares: quantity, 
        avgPrice: price, 
        exchange: exchange || 'NSE' 
      });
    }
    await holding.save();
    
    // Record transaction
    const transaction = new Transaction({ 
      userId, 
      symbol, 
      type: 'BUY', 
      quantity, 
      price, 
      totalAmount 
    });
    await transaction.save();
    
    console.log(`✅ BUY: ${quantity} ${symbol} for user ${userId}`);
    res.json({ success: true, cashBalance: user.cash });
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).json({ message: error.message, success: false });
  }
});

// Sell stock
app.post('/api/portfolio/sell', async (req, res) => {
  try {
    const { userId, symbol, quantity, price } = req.body;
    const totalAmount = quantity * price;
    
    const holding = await Holding.findOne({ userId, symbol });
    if (!holding || holding.shares < quantity) {
      return res.status(400).json({ message: 'Insufficient shares', success: false });
    }
    
    // Add cash
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.cash += totalAmount;
    await user.save();
    
    // Update holding
    holding.shares -= quantity;
    if (holding.shares === 0) {
      await holding.deleteOne();
    } else {
      await holding.save();
    }
    
    // Record transaction
    const transaction = new Transaction({ 
      userId, 
      symbol, 
      type: 'SELL', 
      quantity, 
      price, 
      totalAmount 
    });
    await transaction.save();
    
    console.log(`✅ SELL: ${quantity} ${symbol} for user ${userId}`);
    res.json({ success: true, cashBalance: user.cash });
  } catch (error) {
    console.error('Sell error:', error);
    res.status(500).json({ message: error.message, success: false });
  }
});

// Get user's transaction history
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(transactions);
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ============ LEADERBOARD, BADGES & COMPETITION SCHEMAS ============

// Leaderboard Stats Schema
const leaderboardStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  userName: { type: String, required: true },
  netWorth: { type: Number, default: 1000000 },
  profit: { type: Number, default: 0 },
  profitPercentage: { type: Number, default: 0 },
  tradesCount: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  bestTrade: { type: Number, default: 0 },
  weeklyRank: { type: Number, default: 0 },
  monthlyRank: { type: Number, default: 0 },
  allTimeRank: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

// Daily Competition Schema
const dailyCompetitionSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
  prizePool: { type: String, default: '🏆 Virtual Trophy + Badge' },
  topEntries: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    profit: { type: Number },
    rank: { type: Number },
    prize: { type: String }
  }],
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
});

// Badge Schema
const badgeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  badgeId: { type: String, required: true },
  badgeName: { type: String, required: true },
  badgeIcon: { type: String },
  description: { type: String },
  earnedAt: { type: Date, default: Date.now }
});

// Tutorial Progress Schema
const tutorialProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tutorialId: { type: String, required: true },
  tutorialName: { type: String, required: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  score: { type: Number, default: 0 }
});

const LeaderboardStats = mongoose.model('LeaderboardStats', leaderboardStatsSchema);
const DailyCompetition = mongoose.model('DailyCompetition', dailyCompetitionSchema);
const Badge = mongoose.model('Badge', badgeSchema);
const TutorialProgress = mongoose.model('TutorialProgress', tutorialProgressSchema);

// Available badges
const AVAILABLE_BADGES = {
  'first_trade': { name: 'First Trade', icon: '🎯', description: 'Completed your first trade' },
  'profit_master': { name: 'Profit Master', icon: '📈', description: 'Made 10% profit overall' },
  'daily_champion': { name: 'Daily Champion', icon: '🏆', description: 'Won a daily competition' },
  'tutorial_complete': { name: 'Scholar', icon: '📚', description: 'Completed all tutorials' },
  'trade_streak': { name: 'Streak Master', icon: '🔥', description: 'Traded 7 days in a row' },
  'high_roller': { name: 'High Roller', icon: '💰', description: 'Portfolio crossed ₹50 Lakhs' }
};

// ============ LEADERBOARD API ROUTES ============

// Update leaderboard stats for a user
app.post('/api/leaderboard/update', async (req, res) => {
  try {
    const { userId, userName, netWorth, profit, profitPercentage, tradesCount } = req.body;
    
    let stats = await LeaderboardStats.findOne({ userId });
    if (!stats) {
      stats = new LeaderboardStats({ userId, userName });
    }
    
    stats.userName = userName;
    stats.netWorth = netWorth;
    stats.profit = profit;
    stats.profitPercentage = profitPercentage;
    stats.tradesCount = tradesCount;
    stats.updatedAt = Date.now();
    
    await stats.save();
    
    // Update rankings
    const allUsers = await LeaderboardStats.find().sort({ netWorth: -1 });
    for (let i = 0; i < allUsers.length; i++) {
      allUsers[i].allTimeRank = i + 1;
      await allUsers[i].save();
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    
    let sortField = 'netWorth';
    if (period === 'weekly') sortField = 'weeklyRank';
    else if (period === 'monthly') sortField = 'monthlyRank';
    
    const leaderboard = await LeaderboardStats.find()
      .sort({ [sortField]: 1, netWorth: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name');
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user rank
app.get('/api/leaderboard/rank/:userId', async (req, res) => {
  try {
    const stats = await LeaderboardStats.findOne({ userId: req.params.userId });
    if (!stats) {
      return res.json({ rank: null, message: 'User not on leaderboard yet' });
    }
    
    const higherRanked = await LeaderboardStats.countDocuments({ netWorth: { $gt: stats.netWorth } });
    res.json({ rank: higherRanked + 1, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ COMPETITION API ROUTES ============

// Get today's competition
app.get('/api/competition/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let competition = await DailyCompetition.findOne({ date: today });
    
    if (!competition) {
      competition = new DailyCompetition({ date: today });
      await competition.save();
    }
    
    res.json(competition);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Join competition
app.post('/api/competition/join', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    let competition = await DailyCompetition.findOne({ date: today });
    if (!competition) {
      competition = new DailyCompetition({ date: today });
    }
    
    const alreadyJoined = competition.topEntries.some(entry => entry.userId.toString() === userId);
    if (!alreadyJoined) {
      competition.topEntries.push({ userId, userName, profit: 0, rank: 0 });
      await competition.save();
    }
    
    res.json({ success: true, competition });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update competition entry
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
      competition.topEntries.forEach((e, idx) => {
        e.rank = idx + 1;
        if (idx === 0) e.prize = '🏆 Champion Badge + 500 Points';
        else if (idx === 1) e.prize = '🥈 Runner Up Badge + 300 Points';
        else if (idx === 2) e.prize = '🥉 Third Place Badge + 100 Points';
        else e.prize = '🎖️ Participation Badge';
      });
      
      await competition.save();
    }
    
    res.json({ success: true, competition });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ BADGES & TUTORIALS API ROUTES ============

// Get user's badges
app.get('/api/badges/:userId', async (req, res) => {
  try {
    const badges = await Badge.find({ userId: req.params.userId });
    res.json(badges);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Award badge to user
app.post('/api/badges/award', async (req, res) => {
  try {
    const { userId, badgeId } = req.body;
    const badgeInfo = AVAILABLE_BADGES[badgeId];
    
    if (!badgeInfo) {
      return res.status(400).json({ message: 'Invalid badge ID' });
    }
    
    const existing = await Badge.findOne({ userId, badgeId });
    if (existing) {
      return res.json({ message: 'Badge already awarded' });
    }
    
    const badge = new Badge({
      userId,
      badgeId,
      badgeName: badgeInfo.name,
      badgeIcon: badgeInfo.icon,
      description: badgeInfo.description
    });
    
    await badge.save();
    res.json({ success: true, badge });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get tutorial progress
app.get('/api/tutorials/:userId', async (req, res) => {
  try {
    const tutorials = await TutorialProgress.find({ userId: req.params.userId });
    res.json(tutorials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Complete tutorial
app.post('/api/tutorials/complete', async (req, res) => {
  try {
    const { userId, tutorialId, tutorialName, score } = req.body;
    
    let tutorial = await TutorialProgress.findOne({ userId, tutorialId });
    if (!tutorial) {
      tutorial = new TutorialProgress({ userId, tutorialId, tutorialName });
    }
    
    tutorial.completed = true;
    tutorial.completedAt = Date.now();
    tutorial.score = score || 100;
    await tutorial.save();
    
    res.json({ success: true, tutorial });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
