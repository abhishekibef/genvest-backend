import express from 'express';

export function getAuthRouter(prisma) {
  const router = express.Router();

  // 📝 STAGE 1: OTP GENERATION AND USER LOOKUP ENDPOINT
  router.post('/otp-request', async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number query string entry is mandatory!' });
    }

    try {
      // Query database to locate account by mobile phone number column
      const user = await prisma.user.findFirst({
        where: { mobile: mobile.trim() }
      });

      // Log delivery tracking to system console interface
      console.log(`✉️ Mock OTP Token Generated for ${mobile}: Code [1234]`);

      res.status(200).json({
        message: 'Verification token generated successfully!',
        isNewUser: !user // Returns true if number isn't registered yet
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server internal validation engine timeout.' });
    }
  });

  // 🔐 STAGE 2: CONFIRM PIN AND ESTABLISH LOGGED-IN ACCOUNT SESSION
  router.post('/otp-verify', async (req, res) => {
    const { mobile, code, name } = req.body;

    if (!mobile || !code) {
      return res.status(400).json({ error: 'Mobile number and validation token pin are required!' });
    }

    // Strict Evaluation Rule: Enforce 4-digit PIN confirmation values
    if (code !== '1234') {
      return res.status(401).json({ error: 'Invalid 4-digit verification code. Please try again!' });
    }

    try {
      let user = await prisma.user.findFirst({
        where: { mobile: mobile.trim() }
      });

      if (!user) {
        if (!name) {
          return res.status(400).json({ error: 'Full profile name is required for registering new accounts!' });
        }

        // Setup a brand new account inside database tables seamlessly
        user = await prisma.user.create({
          data: {
            mobile: mobile.trim(),
            name: name.trim(),
            username: `user_${Math.floor(1000 + Math.random() * 9000)}`, // Generates clean random username placeholder
            streak: 1,
            lastActive: new Date()
          }
        });

        // Seed wallet assets for newly validated profile ID
        await prisma.portfolio.create({
          data: {
            userId: user.id,
            cashBalance: 10000.00 // Seed with $10,000 baseline paper trading balance
          }
        });
      } else {
        // Track logging metrics for returning traders
        user = await prisma.user.update({
          where: { id: user.id },
          data: { lastActive: new Date() }
        });
      }

      // Return clean session profile properties to frontend hooks
      res.status(200).json({
        id: user.id,
        mobile: user.mobile,
        name: user.name,
        streak: user.streak
      });
    } catch (err) {
      console.error('❌ Database token registration mapping error:', err);
      res.status(500).json({ error: 'Internal system secure row entry mutation failure.' });
    }
  });

  return router;
}
