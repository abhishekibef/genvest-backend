import express from 'express';
import crypto from 'crypto';

// In-memory OTP storage
const otpStore = {};

// Helper to decode base32
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  let index = 0;
  const buffer = Buffer.alloc(Math.floor((clean.length * 5) / 8));
  
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer;
}

// Generate HOTP (RFC 4226)
function generateHOTP(secret, counter) {
  const buffer = Buffer.alloc(8);
  let tempCounter = BigInt(counter);
  for (let i = 0; i < 8; i++) {
    buffer[7 - i] = Number(tempCounter & 0xffn);
    tempCounter = tempCounter >> 8n;
  }

  const hmac = crypto.createHmac('sha1', base32Decode(secret));
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

// Verify TOTP (RFC 6238)
function verifyTOTP(token, secret) {
  const epoch = Math.floor(Date.now() / 1000);
  const step = Math.floor(epoch / 30);

  // Check current step and ±1 step for clock drift
  for (let i = -1; i <= 1; i++) {
    if (generateHOTP(secret, step + i) === token) {
      return true;
    }
  }
  return false;
}

// Helper function to send SMS OTP via Twilio or Textbelt
async function sendSMSOTP(phone, code) {
  const cleanPhone = phone.trim().replace(/[\s-]/g, '');
  
  // Try Twilio SMS first
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (twilioSid && twilioToken && twilioPhone) {
    try {
      const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const smsRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`,
          From: twilioPhone,
          Body: `Your Moolzen verification code is: ${code}`
        })
      });

      if (smsRes.ok) {
        console.log(`✅ Sent SMS via Twilio to ${cleanPhone}`);
        return { success: true, method: 'twilio' };
      } else {
        const errText = await smsRes.text();
        console.error(`❌ Twilio API failed: ${errText}`);
      }
    } catch (err) {
      console.error('❌ Twilio send error:', err);
    }
  }

  // Try Textbelt SMS fallback
  try {
    console.log(`⏳ Attempting Textbelt fallback for ${cleanPhone}`);
    const textbeltRes = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        message: `Your Moolzen verification code is: ${code}`,
        key: 'textbelt'
      })
    });

    if (textbeltRes.ok) {
      const textbeltData = await textbeltRes.json();
      if (textbeltData.success) {
        console.log(`✅ Sent SMS via Textbelt to ${cleanPhone}`);
        return { success: true, method: 'textbelt' };
      } else {
        console.warn(`⚠️ Textbelt failed: ${textbeltData.error || 'quota limit hit'}`);
      }
    }
  } catch (err) {
    console.error('❌ Textbelt send error:', err);
  }

  return { success: false };
}

export function getAuthRouter(prisma) {
  const router = express.Router();

  // Simple string auth: Login or Register
  router.post('/login', async (req, res) => {
    const { identifier, password, isSignUp } = req.body; // email/phone, password, isSignUp flag

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone string is required!' });
    }

    try {
      let user = await prisma.user.findUnique({
        where: { email: identifier.trim().toLowerCase() }
      });

      if (isSignUp) {
        // Sign Up Flow
        if (user) {
          return res.status(400).json({ error: 'Account already exists! Please sign in instead.' });
        }

        console.log(`🆕 Creating new user for: ${identifier}`);
        const baseUsername = identifier.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9_]/g, '');
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
        const usernameVal = `${baseUsername}_${uniqueSuffix}`;

        user = await prisma.user.create({
          data: {
            email: identifier.trim().toLowerCase(),
            username: usernameVal,
            password: password ? password.trim() : null,
            cash: 1000000.0, // Credit ₹10,00,000 virtual cash
            streak: 1,
            lastActive: new Date()
          }
        });
      } else {
        // Sign In Flow
        if (!user) {
          return res.status(400).json({ error: 'Account does not exist! Please sign up first.' });
        }

        // Validate password if user has one set in DB
        if (user.password && password) {
          if (user.password.trim() !== password.trim()) {
            return res.status(401).json({ error: 'Incorrect password! Please try again.' });
          }
        } else if (user.password && !password) {
          return res.status(400).json({ error: 'Password is required!' });
        } else if (!user.password && password) {
          // Update legacy user with a password
          user = await prisma.user.update({
            where: { id: user.id },
            data: { password: password.trim() }
          });
        }

        // Calculate dynamic streaks!
        const now = new Date();
        const lastActive = new Date(user.lastActive);
        
        const msDiff = now - lastActive;
        const hourDiff = msDiff / (1000 * 60 * 60);

        let newStreak = user.streak;
        if (hourDiff > 20 && hourDiff <= 48) {
          // Logged in the next calendar day, increment streak!
          newStreak += 1;
        } else if (hourDiff > 48) {
          // Lost the streak! Resets to 1
          newStreak = 1;
        }

        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            streak: newStreak,
            lastActive: now
          }
        });
      }

      // Check if Two-Factor Authentication is enabled
      if (user.twoFactorEnabled) {
        const method = user.phone ? 'sms' : 'authenticator';
        console.log(`🛡️ 2FA verification required for user ${user.id} via ${method}`);

        if (method === 'sms') {
          const cleanPhone = user.phone.trim().replace(/[\s-]/g, '');
          const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
          otpStore[cleanPhone] = {
            code: generatedOTP,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiry
          };

          console.log(`💬 Generated login OTP ${generatedOTP} for phone: ${cleanPhone}`);
          const sendRes = await sendSMSOTP(cleanPhone, generatedOTP);

          if (sendRes.success) {
            return res.status(200).json({
              twoFactorRequired: true,
              userId: user.id,
              method: 'sms',
              phone: user.phone
            });
          } else {
            // Simulator fallback
            return res.status(200).json({
              twoFactorRequired: true,
              userId: user.id,
              method: 'sms',
              phone: user.phone,
              otp: generatedOTP
            });
          }
        } else {
          // Authenticator method
          return res.status(200).json({
            twoFactorRequired: true,
            userId: user.id,
            method: 'authenticator'
          });
        }
      }

      // 2FA not enabled, login immediately
      res.status(200).json({
        message: 'Auth successful! Ready to trade 🚀',
        user: {
          id: user.id,
          email: user.email,
          username: user.username || user.email.split('@')[0],
          name: user.name,
          phone: user.phone,
          password: user.password,
          twoFactorEnabled: user.twoFactorEnabled,
          cash: user.cash,
          streak: user.streak,
          lastActive: user.lastActive,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      res.status(500).json({ error: 'Auth failed. Please check your setup!' });
    }
  });

  // Google sign in / sign up
  router.post('/google-login', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required!' });
    }

    try {
      let email;
      let name;

      if (idToken.startsWith('mock_token_')) {
        // Handle mock Google OAuth login in sandbox
        email = idToken.replace('mock_token_', '').toLowerCase();
        name = email.split('@')[0];
      } else {
        // Call Google's tokeninfo endpoint to verify token
        const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!googleRes.ok) {
          return res.status(401).json({ error: 'Invalid Google id_token!' });
        }

        const payload = await googleRes.json();
        
        // Verify audience if client id is configured
        const clientID = process.env.GOOGLE_CLIENT_ID;
        if (clientID && payload.aud !== clientID) {
          return res.status(401).json({ error: 'Audience mismatch! Incorrect client ID.' });
        }

        email = payload.email?.toLowerCase();
        if (!email) {
          return res.status(400).json({ error: 'No email found in Google token!' });
        }

        name = payload.name;
      }
      
      // Find or create user
      let user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        console.log(`🆕 Auto-creating Google user for: ${email}`);
        const baseUsername = email.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9_]/g, '');
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
        const usernameVal = `${baseUsername}_${uniqueSuffix}`;

        user = await prisma.user.create({
          data: {
            email,
            username: usernameVal,
            name: name || email.split('@')[0],
            cash: 1000000.0, // Credit ₹10,00,000 virtual cash
            streak: 1,
            lastActive: new Date()
          }
        });
      } else {
        // Calculate dynamic streaks!
        const now = new Date();
        const lastActive = new Date(user.lastActive);
        
        const msDiff = now - lastActive;
        const hourDiff = msDiff / (1000 * 60 * 60);

        let newStreak = user.streak;
        if (hourDiff > 20 && hourDiff <= 48) {
          newStreak += 1;
        } else if (hourDiff > 48) {
          newStreak = 1;
        }

        const updateData = {
          lastActive: now,
          streak: newStreak
        };
        // Update user's name if they don't have one set, or use the one from google
        if (!user.name && name) {
          updateData.name = name;
        }

        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }

      res.status(200).json({
        message: 'Google auth successful! Ready to trade 🚀',
        user: {
          id: user.id,
          email: user.email,
          username: user.username || user.email.split('@')[0],
          name: user.name,
          phone: user.phone,
          twoFactorEnabled: user.twoFactorEnabled,
          cash: user.cash,
          streak: user.streak,
          lastActive: user.lastActive,
          createdAt: user.createdAt
        }
      });

    } catch (error) {
      console.error('❌ Google authentication failed:', error);
      res.status(500).json({ error: 'Google authentication failed. Please check your setup!' });
    }
  });

  // Get user details by ID
  router.get('/user/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(id) }
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }
      res.status(200).json({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        phone: user.phone,
        password: user.password,
        twoFactorEnabled: user.twoFactorEnabled,
        cash: user.cash,
        streak: user.streak,
        totalXP: user.totalXP,
        gems: user.gems,
        lastActive: user.lastActive,
        createdAt: user.createdAt
      });
    } catch (error) {
      console.error('❌ Failed to fetch user details:', error);
      res.status(500).json({ error: 'Internal Server Error!' });
    }
  });

  // Update user details by ID
  router.put('/user/:id', async (req, res) => {
    const { id } = req.params;
    const { name, username, phone, password, twoFactorEnabled } = req.body;
    try {
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (username !== undefined) {
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanUsername) {
          const existing = await prisma.user.findFirst({
            where: {
              username: cleanUsername,
              NOT: { id: Number(id) }
            }
          });
          if (existing) {
            return res.status(400).json({ error: 'Username is already taken! Please try another one.' });
          }
          updateData.username = cleanUsername;
        }
      }
      if (phone !== undefined) updateData.phone = phone;
      if (password !== undefined) updateData.password = password;
      if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = twoFactorEnabled;

      const updatedUser = await prisma.user.update({
        where: { id: Number(id) },
        data: updateData
      });
      res.status(200).json({
        message: 'User updated successfully!',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username || updatedUser.email.split('@')[0],
          name: updatedUser.name,
          phone: updatedUser.phone,
          password: updatedUser.password,
          twoFactorEnabled: updatedUser.twoFactorEnabled,
          cash: updatedUser.cash,
          streak: updatedUser.streak,
          totalXP: updatedUser.totalXP,
          gems: updatedUser.gems,
          lastActive: updatedUser.lastActive,
          createdAt: updatedUser.createdAt
        }
      });
    } catch (error) {
      console.error('❌ Failed to update user details:', error);
      res.status(500).json({ error: 'Internal Server Error!' });
    }
  });

  // POST endpoint to send SMS OTP
  router.post('/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required!' });
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[cleanPhone] = {
      code: generatedOTP,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiry
    };

    console.log(`💬 Generated OTP ${generatedOTP} for phone: ${cleanPhone}`);

    const sendRes = await sendSMSOTP(cleanPhone, generatedOTP);
    if (sendRes.success) {
      return res.status(200).json({ success: true, method: sendRes.method });
    }

    // Fallback to simulator
    console.log(`⚠️ SMS gateway not active. Falling back to simulator for ${cleanPhone}`);
    return res.status(200).json({
      success: false,
      error: 'SMS gateways not configured or rate-limited. Falling back to simulated OTP.',
      otp: generatedOTP
    });
  });

  // POST endpoint to verify 2FA and enable it
  router.post('/verify-2fa', async (req, res) => {
    const { userId, method, code, phone } = req.body;
    
    if (!userId || !method || !code) {
      return res.status(400).json({ error: 'userId, method, and code are required!' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) }
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      let isVerified = false;

      if (method === 'sms') {
        if (!phone) {
          return res.status(400).json({ error: 'Phone number is required for SMS verification!' });
        }
        const cleanPhone = phone.trim().replace(/[\s-]/g, '');
        const activeOTP = otpStore[cleanPhone];
        
        if (activeOTP && activeOTP.expiresAt > Date.now() && activeOTP.code === code.trim()) {
          isVerified = true;
          delete otpStore[cleanPhone]; // consume code
        } else {
          return res.status(400).json({ error: 'Incorrect or expired verification code.' });
        }
      } else if (method === 'authenticator') {
        // Shared secret is MOOLZENTRADERSECUREKEY32
        const secret = 'MOOLZENTRADERSECUREKEY32';
        isVerified = verifyTOTP(code.trim(), secret);
        if (!isVerified) {
          return res.status(400).json({ error: 'Incorrect authenticator code. Please check your app.' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid 2FA method!' });
      }

      if (isVerified) {
        const updateData = { twoFactorEnabled: true };
        if (method === 'sms') {
          updateData.phone = phone.trim();
        }

        const updatedUser = await prisma.user.update({
          where: { id: Number(userId) },
          data: updateData
        });

        console.log(`🛡️ 2FA Activated successfully for user ${userId} using ${method}`);
        return res.status(200).json({
          success: true,
          message: 'Two-Factor Authentication activated successfully!',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            phone: updatedUser.phone,
            password: updatedUser.password,
            twoFactorEnabled: updatedUser.twoFactorEnabled,
            cash: updatedUser.cash,
            streak: updatedUser.streak,
            totalXP: updatedUser.totalXP,
            gems: updatedUser.gems,
            lastActive: updatedUser.lastActive,
            createdAt: updatedUser.createdAt
          }
        });
      }
    } catch (err) {
      console.error('❌ 2FA Verification error:', err);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

  // POST endpoint to verify login 2FA code
  router.post('/verify-login-2fa', async (req, res) => {
    const { userId, method, code, phone } = req.body;

    if (!userId || !method || !code) {
      return res.status(400).json({ error: 'userId, method, and code are required!' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) }
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found!' });
      }

      let isVerified = false;

      if (method === 'sms') {
        const targetPhone = phone || user.phone;
        if (!targetPhone) {
          return res.status(400).json({ error: 'Phone number is required for SMS verification!' });
        }
        const cleanPhone = targetPhone.trim().replace(/[\s-]/g, '');
        const activeOTP = otpStore[cleanPhone];

        if (activeOTP && activeOTP.expiresAt > Date.now() && activeOTP.code === code.trim()) {
          isVerified = true;
          delete otpStore[cleanPhone]; // consume code
        } else {
          return res.status(400).json({ error: 'Incorrect or expired verification code.' });
        }
      } else if (method === 'authenticator') {
        const secret = 'MOOLZENTRADERSECUREKEY32';
        isVerified = verifyTOTP(code.trim(), secret);
        if (!isVerified) {
          return res.status(400).json({ error: 'Incorrect authenticator code. Please check your app.' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid 2FA method!' });
      }

      if (isVerified) {
        // Calculate dynamic streaks!
        const now = new Date();
        const lastActive = new Date(user.lastActive);
        
        const msDiff = now - lastActive;
        const hourDiff = msDiff / (1000 * 60 * 60);

        let newStreak = user.streak;
        if (hourDiff > 20 && hourDiff <= 48) {
          newStreak += 1;
        } else if (hourDiff > 48) {
          newStreak = 1;
        }

        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            streak: newStreak,
            lastActive: now
          }
        });

        console.log(`🛡️ 2FA Login success for user ${userId} using ${method}`);
        return res.status(200).json({
          success: true,
          message: 'Two-Factor Authentication verified successfully!',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            phone: updatedUser.phone,
            password: updatedUser.password,
            twoFactorEnabled: updatedUser.twoFactorEnabled,
            cash: updatedUser.cash,
            streak: updatedUser.streak,
            lastActive: updatedUser.lastActive,
            createdAt: updatedUser.createdAt
          }
        });
      }
    } catch (err) {
      console.error('❌ 2FA Login Verification error:', err);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

  return router;
}
