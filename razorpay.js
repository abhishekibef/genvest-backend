import Razorpay from 'razorpay';
import crypto from 'crypto';
import { b64Config } from './razorpayConfig.js';

let razorpay = null;
let rzpKeyId = process.env.RAZORPAY_KEY_ID;
let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
let rzpWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

// Fallback to base64 config if env vars are missing (e.g. on DO)
if (!rzpKeyId) {
  try {
    const config = JSON.parse(Buffer.from(b64Config, 'base64').toString('utf-8'));
    rzpKeyId = config.RAZORPAY_KEY_ID;
    rzpKeySecret = config.RAZORPAY_KEY_SECRET;
    rzpWebhookSecret = config.RAZORPAY_WEBHOOK_SECRET;
  } catch (e) {
    console.error('Failed to load b64Config', e);
  }
}

if (rzpKeyId && rzpKeySecret) {
  try {
    razorpay = new Razorpay({
      key_id: rzpKeyId,
      key_secret: rzpKeySecret,
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
    if (!rzpKeySecret) return false;
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', rzpKeySecret)
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
    if (!rzpWebhookSecret) return false;
    const expectedSignature = crypto
      .createHmac('sha256', rzpWebhookSecret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },
  
  // Expose key id for frontend config
  getKeyId: () => rzpKeyId
};

export default razorpayService;
