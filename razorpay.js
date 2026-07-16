import Razorpay from 'razorpay';
import crypto from 'crypto';

let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  } catch (err) {
    console.error('⚠️ Failed to initialize Razorpay client:', err.message);
  }
} else {
  console.warn('⚠️ Razorpay credentials missing. Razorpay service is disabled.');
}

export const razorpayService = {
  // Create a payment order (for one-time payments like contest fees or premium purchase)
  createOrder: async (amount, currency = 'INR', receipt, notes = {}) => {
    if (!razorpay) {
      throw new Error('Payment service is not configured on this server.');
    }
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt,
      notes,
    });
    return order;
  },

  // Verify payment signature
  verifyPayment: (orderId, paymentId, signature) => {
    if (!process.env.RAZORPAY_KEY_SECRET) return false;
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },

  // Fetch payment details
  getPayment: async (paymentId) => {
    if (!razorpay) {
      throw new Error('Payment service is not configured on this server.');
    }
    return await razorpay.payments.fetch(paymentId);
  },

  // Verify webhook signature
  verifyWebhookSignature: (body, signature) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },
};

export default razorpayService;
