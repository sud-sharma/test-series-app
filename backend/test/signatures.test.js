import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'hook_secret';
process.env.JWT_SECRET ||= 'jwt';
process.env.COURSE_FEE_INR ||= '7355';

const { verifyPaymentSignature, verifyWebhookSignature } = await import('../src/razorpay.js');

test('payment signature: valid passes, tampered fails', () => {
  const sig = crypto.createHmac('sha256', 'key_secret').update('order_1|pay_1').digest('hex');
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }, 'key_secret'), true);
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }, 'key_secret'), false);
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'abc' }, 'key_secret'), false);
});

test('webhook signature over raw body', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
  const sig = crypto.createHmac('sha256', 'hook_secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'hook_secret'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{}'), sig, 'hook_secret'), false);
  assert.equal(verifyWebhookSignature(body, undefined, 'hook_secret'), false);
});
