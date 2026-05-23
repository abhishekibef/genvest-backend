import express from 'express';

export function getAuthRouter(prisma) {
  const router = express.Router();

  // Simple string auth: Login or Register
  router.post('/login', async (req, res) => {
    const { identifier } = req.body; // email or phone string

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone string is required!' });
    }

    try {
      let user = await prisma.user.findUnique({
        where: { email: identifier.trim().toLowerCase() }
      });

      if (!user) {
        // Registering a brand new user!
        console.log(`🆕 Creating new user for: ${identifier}`);
        user = await prisma.user.create({
          data: {
            email: identifier.trim().toLowerCase(),
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

      res.status(200).json({
        message: 'Auth successful! Ready to trade 🚀',
        user: {
          id: user.id,
          email: user.email,
          cash: user.cash,
          streak: user.streak,
          lastActive: user.lastActive
        }
      });
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      res.status(500).json({ error: 'Auth failed. Please check your setup!' });
    }
  });

  return router;
}
