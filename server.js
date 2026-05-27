const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// ============ CORS CONFIGURATION (Mobile Friendly) ============
const corsOptions = {
  origin: [
    'https://genvest-frontend.vercel.app',
    'http://localhost:3000',
    'https://genvest-frontend.vercel.app',
    'https://thegenvest.com',
    /\.vercel\.app$/,
    /\.onrender\.com$/
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// ============ MONGODB CONNECTION (WITH DETAILED LOGGING) ============
const MONGODB_URI = process.env.MONGODB_URI;

console.log('='.repeat(50));
console.log('📡 ATTEMPTING TO CONNECT TO MONGODB...');
console.log(`🔗 Connection string starts with: ${MONGODB_URI ? MONGODB_URI.substring(0, 60) : 'UNDEFINED!'}...`);
console.log('='.repeat(50));

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
  .then(() => {
    console.log('✅✅✅ MONGODB CONNECTED SUCCESSFULLY! ✅✅✅');
    console.log(`📦 Database name: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
  })
  .catch(err => {
    console.error('❌❌❌ MONGODB CONNECTION ERROR ❌❌❌');
    console.error(`Error message: ${err.message}`);
    console.error(`Error name: ${err.name}`);
    if (err.reason) console.error(`Reason: ${err.reason}`);
    console.error('Full error:', err);
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

// ============ API ROUTES ============

// Test endpoint - checks if server is running
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend is working! 🚀',
    mongoState: mongoose.connection.readyState,
    mongoStateText: {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }[mongoose.connection.readyState] || 'unknown'
  });
});

// Sign Up
app.post('/api/signup', async (req, res) => {
  console.log('📝 Signup request received for:', req.body.username);
  
  try {
    const { name, username, loginMethod, cash } = req.body;
    
    // Check MongoDB connection state
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected. State:', mongoose.connection.readyState);
      return res.status(500).json({ message: 'Database connection not ready. Please try again.' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists. Please Sign In.' });
    }
    
    // Create new user
    const user = new User({
      name,
      username,
      loginMethod,
      cash: cash || 1000000.00
    });
    
    await user.save();
    console.log('✅ User created successfully:', username);
    
    // Create token
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
    console.error('❌ Signup error details:', error);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Sign In
app.post('/api/signin', async (req, res) => {
  console.log('🔐 Signin request received for:', req.body.username);
  
  try {
    const { username } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection not ready.' });
    }
    
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'No active profile found. Please Sign Up first.' });
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
    console.error('❌ Signin error:', error);
    res.status(500).json({ message: `Server error: ${error.message}` });
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

// Get user by ID
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-__v');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Ready to accept connections`);
});
