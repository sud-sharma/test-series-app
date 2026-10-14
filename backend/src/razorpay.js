import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from './config.js';

export const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Signature sent to the browser by Razorpay Checkout after a successful payment. */
export function verifyPaymentSignature({ orderId, paymentId, signature }, secret = config.razorpay.keySecret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Signature on webhook calls (X-Razorpay-Signature), computed over the raw request body. */
export function verifyWebhookSignature(rawBody, signature, secret = config.razorpay.webhookSecret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
