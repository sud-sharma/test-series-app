import express, { Router } from 'express';
import { verifyWebhookSignature } from '../razorpay.js';
import { markOrderPaid, markOrderFailed } from '../services/payments.js';

const router = Router();

/**
 * Razorpay webhook. Configure in Dashboard → Webhooks with events:
 *   payment.captured, payment.failed, order.paid
 * URL: https://<your-api>/api/webhooks/razorpay
 *
 * Uses the raw body because the signature is computed over the exact bytes sent.
 */
router.post('/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  try {
    const payment = event.payload?.payment?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (payment?.order_id) {
          await markOrderPaid({ orderId: payment.order_id, paymentId: payment.id, method: payment.method });
        }
        break;
      case 'payment.failed':
        if (payment?.order_id) {
          await markOrderFailed({
            orderId: payment.order_id,
            paymentId: payment.id,
            reason: payment.error_description,
          });
        }
        break;
      default:
        break; // ignore other events
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    // 500 makes Razorpay retry later
    res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
