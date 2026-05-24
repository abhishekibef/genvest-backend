import express from 'express';

export function getAuthRouter(prisma) {
  const router = express.Router();

  // 🔐 1. THE LOGIN ENDPOINT
  router.post('/login', async (req, res) => {
    const { identifier } = req.body; // Expects Username from the frontend input

    if (!identifier) {
      return res.status(400).json({ error: 'Username is required to sign in!' });
    }

    try {
      // Find the user by their unique username
      let user = await prisma.user.findUnique({
        where: { username: identifier.trim().toLowerCase() }
      });

      if (!user) {
        return res.status(404).json({ error: 'Account not found! Please register first.' });
      }

      // Update login streak metrics
      const now = new Date();
      const lastActive = new Date(user.lastActive || now);
      const hourDiff = (now - lastActive) / (1000 * 60 * 60);

      let newStreak = user.streak || 1;
      if (hourDiff > 20 && hourDiff <= 48) {
        newStreak += 1;
      } else if (hourDiff > 48) {
        newStreak = 1;
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          streak: newStreak,
          lastActive: now
        }
      });

      // Send response data matching your frontend shape (data.id, data.name)
      res.status(200).json({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        streak: user.streak
      });

    } catch (error) {
      console.error('❌ Login database mismatch:', error);
      res.status(500).json({ error: 'Server internal login failure.' });
    }
  });

  // 📝 2. THE NEWLY ADDED REGISTER ENDPOINT
  router.post('/register', async (req, res) => {
    const { username, name, email, mobile } = req.body;

    if (!username || !name) {
      return res.status(400).json({ error: 'Full Name and Username are mandatory fields!' });
    }

    if (!email && !mobile) {
      return res.status(400).json({ error: 'You must provide either an Email ID or a Mobile Number.' });
    }

    try {
      // Verify username uniqueness to avoid replication crashes
      const existingUser = await prisma.user.findUnique({
        where: { username: username.trim().toLowerCase() }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'This username is already taken. Try a different one!' });
      }

      console.log(`🆕 Registering data properties for account holder: ${username}`);

      // Create user row with schema mappings
      const newUser = await prisma.user.create({
        data: {
          username: username.trim().toLowerCase(),
          name: name.trim(),
          email: email ? email.trim().toLowerCase() : null,
          mobile: mobile ? mobile.trim() : null,
          streak: 1,
          lastActive: new Date()
        }
      });

      // Automatically build a starting portfolio wallet row for this new trader ID
      try {
        await prisma.portfolio.create({
          data: {
            userId: newUser.id,
            cashBalance: 10000.0 // Start user off with $10,000 virtual trading cash
          }
        });
      } catch (portfolioErr) {
        console.error('⚠️ Virtual portfolio auto-generation failed:', portfolioErr.message);
      }

      // Return user properties back to your frontend framework state setter
      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        streak: newUser.streak
      });

    } catch (error) {
      console.error('❌ Server registration controller failure:', error);
      res.status(500).json({ error: 'Database record assignment failed. Check column definitions.' });
    }
  });

  return router;
}
