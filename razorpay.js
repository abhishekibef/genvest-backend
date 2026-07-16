import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const razorpayService = {
  // Create a payment order (for one-time payments like contest fees or premium purchase)
  createOrder: async (amount, currency = 'INR', receipt, notes = {}) => {
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
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },

  // Fetch payment details
  getPayment: async (paymentId) => {
    return await razorpay.payments.fetch(paymentId);
  },

  // Verify webhook signature
  verifyWebhookSignature: (body, signature) => {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },
};

export default razorpayService;
