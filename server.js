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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
