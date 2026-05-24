import express from 'express';

export function getAuthRouter(prisma) {
  const router = express.Router();

  // STAGE 1: OTP GENERATION AND LOOKUP
  router.post('/otp-request', async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number entry is mandatory!' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { mobile: mobile.trim() }
      });

      console.log(`✉️ Mock OTP Token Generated for ${mobile}: Code [1234]`);

      res.status(200).json({
        message: 'Verification token generated successfully!',
        isNewUser: !user 
      });
    } catch (err) {
      console.error("❌ Database query crash:", err.message);
      res.status(500).json({ error: 'Server database verification mismatch.' });
    }
  });

  // STAGE 2: VERIFY OTP AND ESTABLISH SESSION
  router.post('/otp-verify', async (req, res) => {
    const { mobile, code, name } = req.body;

    if (!mobile || !code) {
      return res.status(400).json({ error: 'Mobile number and validation token pin are required!' });
    }

    if (code !== '1234') {
      return res.status(401).json({ error: 'Invalid 4-digit verification code.' });
    }

    try {
      let user = await prisma.user.findUnique({
        where: { mobile: mobile.trim() }
      });

      if (!user) {
        if (!name) {
          return res.status(400).json({ error: 'Full profile name is required for registering new accounts!' });
        }

        // Setup a brand new account with initial virtual trading capital
        user = await prisma.user.create({
          data: {
            mobile: mobile.trim(),
            name: name.trim(),
            username: `trader_${Math.floor(1000 + Math.random() * 9000)}`,
            cash: 1000000.0, // Initial structural paper trading capital matching schema
            streak: 1,
            lastActive: new Date()
          }
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { lastActive: new Date() }
        });
      }

      res.status(200).json({
        id: user.id,
        mobile: user.mobile,
        name: user.name,
        streak: user.streak
      });
    } catch (err) {
      console.error('❌ Database signup mutation failure:', err.message);
      res.status(500).json({ error: 'Database execution failure. Syncing schema columns.' });
    }
  });

  return router;
}
