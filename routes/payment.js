import express from 'express';
import razorpayService from '../razorpay.js';
import crypto from 'crypto';

// Premium plan pricing (in INR)
const PLANS = {
  monthly: { amount: 299, label: 'Monthly Premium', days: 30 },
  yearly: { amount: 2499, label: 'Yearly Premium', days: 365 },
};

export function getPaymentRouter(prisma) {
  const router = express.Router();

  // 1. POST /api/payment/create-order — Create a Razorpay order
  router.post('/create-order', async (req, res) => {
    const { userId, type, planType, lobbyCode } = req.body;
    // type: "premium" or "contest"
    // planType: "monthly" or "yearly" (for premium)
    // lobbyCode: lobby code (for contest entry fee)

    if (!userId || !type) {
      return res.status(400).json({ error: 'userId and type are required' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      let amount, description, metadata;

      if (type === 'premium') {
        if (!planType || !PLANS[planType]) {
          return res.status(400).json({ error: 'Invalid planType. Use "monthly" or "yearly"' });
        }

        // Check if already premium
        if (user.isPremium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date()) {
          return res.status(400).json({ error: 'You already have an active premium subscription!' });
        }

        amount = PLANS[planType].amount;
        description = PLANS[planType].label;
        metadata = JSON.stringify({ planType });

      } else if (type === 'contest') {
        if (!lobbyCode) {
          return res.status(400).json({ error: 'lobbyCode is required for contest entry' });
        }

        const lobby = await prisma.privateLobby.findUnique({
          where: { code: lobbyCode.toUpperCase().trim() }
        });

        if (!lobby) return res.status(404).json({ error: 'Contest not found' });
        if (!lobby.entryFee || lobby.entryFee <= 0) {
          return res.status(400).json({ error: 'This contest has no entry fee' });
        }

        // Check if already joined
        const existingEntry = await prisma.privateLobbyEntry.findUnique({
          where: { userId_lobbyId: { userId: Number(userId), lobbyId: lobby.id } }
        });
        if (existingEntry) {
          return res.status(400).json({ error: 'You have already joined this contest' });
        }

        amount = lobby.entryFee;
        description = `Entry fee for contest: ${lobby.name}`;
        metadata = JSON.stringify({ lobbyCode: lobby.code, lobbyId: lobby.id });

      } else {
        return res.status(400).json({ error: 'Invalid type. Use "premium" or "contest"' });
      }

      // Create Razorpay order
      const order = await razorpayService.createOrder(
        amount,
        'INR',
        `${type}_${userId}_${Date.now()}`,
        { userId: String(userId), type, description }
      );

      // Save order to database
      await prisma.order.create({
        data: {
          userId: Number(userId),
          razorpayOrderId: order.id,
          amount,
          type,
          description,
          metadata,
          status: 'created',
        },
      });

      res.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount, // in paise
          currency: order.currency,
        },
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    } catch (error) {
      console.error('❌ Create Order Error:', error);
      res.status(500).json({ error: 'Failed to create payment order' });
    }
  });

  // 2. POST /api/payment/verify — Verify payment after Razorpay checkout
  router.post('/verify', async (req, res) => {
    const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    try {
      // Verify signature
      const isValid = razorpayService.verifyPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValid) {
        return res.status(400).json({ error: 'Payment verification failed — invalid signature' });
      }

      // Find the order
      const order = await prisma.order.findUnique({
        where: { razorpayOrderId: razorpay_order_id },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.userId !== Number(userId)) {
        return res.status(403).json({ error: 'Order does not belong to this user' });
      }

      if (order.status === 'paid') {
        return res.status(400).json({ error: 'This order has already been processed' });
      }

      // Update order status
      await prisma.order.update({
        where: { razorpayOrderId: razorpay_order_id },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          status: 'paid',
        },
      });

      // Process based on order type
      if (order.type === 'premium') {
        const meta = order.metadata ? JSON.parse(order.metadata) : {};
        const plan = PLANS[meta.planType] || PLANS.monthly;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.days);

        // Update user to premium
        await prisma.user.update({
          where: { id: Number(userId) },
          data: {
            isPremium: true,
            premiumExpiresAt: endDate,
          },
        });

        // Create/update subscription record
        await prisma.subscription.upsert({
          where: { userId: Number(userId) },
          create: {
            userId: Number(userId),
            planType: meta.planType || 'monthly',
            status: 'active',
            endDate,
            razorpayPaymentId: razorpay_payment_id,
          },
          update: {
            planType: meta.planType || 'monthly',
            status: 'active',
            startDate: new Date(),
            endDate,
            razorpayPaymentId: razorpay_payment_id,
          },
        });

        res.json({
          success: true,
          message: '🎉 Welcome to Moolzen Premium!',
          isPremium: true,
          premiumExpiresAt: endDate,
        });

      } else if (order.type === 'contest') {
        const meta = order.metadata ? JSON.parse(order.metadata) : {};

        // Find the lobby
        const lobby = await prisma.privateLobby.findUnique({
          where: { code: meta.lobbyCode },
        });

        if (!lobby) {
          return res.status(404).json({ error: 'Contest no longer exists' });
        }

        // Join the lobby
        const entry = await prisma.privateLobbyEntry.create({
          data: {
            lobbyId: lobby.id,
            userId: Number(userId),
            startingCash: lobby.startingCash,
            currentCash: lobby.startingCash,
            profit: 0.0,
          },
        });

        res.json({
          success: true,
          message: `🎮 Joined contest "${lobby.name}" successfully!`,
          entry,
          lobbyCode: lobby.code,
        });

      } else {
        res.json({ success: true, message: 'Payment verified' });
      }
    } catch (error) {
      console.error('❌ Payment Verify Error:', error);
      res.status(500).json({ error: 'Payment verification failed' });
    }
  });

  // 3. GET /api/payment/history/:userId — Payment history
  router.get('/history/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const orders = await prisma.order.findMany({
        where: { userId: Number(userId) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const subscription = await prisma.subscription.findUnique({
        where: { userId: Number(userId) },
      });

      res.json({ orders, subscription });
    } catch (error) {
      console.error('❌ Payment History Error:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  });

  // 4. GET /api/payment/plans — Get available premium plans
  router.get('/plans', (req, res) => {
    res.json({
      plans: Object.entries(PLANS).map(([key, val]) => ({
        id: key,
        ...val,
      })),
    });
  });

  // 5. GET /api/payment/premium-status/:userId — Check premium status
  router.get('/premium-status/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { isPremium: true, premiumExpiresAt: true },
      });

      if (!user) return res.status(404).json({ error: 'User not found' });

      // Check if premium has expired
      const isActive = user.isPremium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date();

      if (user.isPremium && !isActive) {
        // Premium expired, update the flag
        await prisma.user.update({
          where: { id: Number(userId) },
          data: { isPremium: false },
        });

        await prisma.subscription.updateMany({
          where: { userId: Number(userId), status: 'active' },
          data: { status: 'expired' },
        });
      }

      res.json({
        isPremium: isActive,
        premiumExpiresAt: user.premiumExpiresAt,
      });
    } catch (error) {
      console.error('❌ Premium Status Error:', error);
      res.status(500).json({ error: 'Failed to check premium status' });
    }
  });

  // 6. POST /api/payment/webhook — Razorpay webhook handler
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const isValid = razorpayService.verifyWebhookSignature(body, signature);

      if (!isValid) {
        console.warn('⚠️ Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const event = payload.event;

      console.log(`📩 Razorpay webhook: ${event}`);

      switch (event) {
        case 'payment.captured': {
          const payment = payload.payload.payment.entity;
          const orderId = payment.order_id;

          if (orderId) {
            await prisma.order.updateMany({
              where: { razorpayOrderId: orderId, status: 'created' },
              data: {
                razorpayPaymentId: payment.id,
                status: 'paid',
              },
            });
          }
          break;
        }

        case 'payment.failed': {
          const payment = payload.payload.payment.entity;
          const orderId = payment.order_id;

          if (orderId) {
            await prisma.order.updateMany({
              where: { razorpayOrderId: orderId },
              data: { status: 'failed' },
            });
          }
          break;
        }

        default:
          console.log(`ℹ️ Unhandled webhook event: ${event}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook Error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
}
