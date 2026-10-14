import { withTransaction } from '../db.js';

/**
 * Mark a Razorpay order as paid. Idempotent: safe to call from both the
 * browser verify step and the webhook — whichever arrives first wins.
 */
export async function markOrderPaid({ orderId, paymentId, signature = null, method = null }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, registration_id, status FROM payments WHERE razorpay_order_id = ? FOR UPDATE',
      [orderId]
    );
    const payment = rows[0];
    if (!payment) return { found: false };

    if (payment.status !== 'paid') {
      await conn.query(
        `UPDATE payments
           SET status = 'paid',
               razorpay_payment_id = COALESCE(razorpay_payment_id, ?),
               razorpay_signature  = COALESCE(?, razorpay_signature),
               method              = COALESCE(?, method),
               error_description   = NULL
         WHERE id = ?`,
        [paymentId, signature, method, payment.id]
      );
      await conn.query(
        `UPDATE registrations SET status = 'paid', paid_at = COALESCE(paid_at, UTC_TIMESTAMP())
          WHERE id = ?`,
        [payment.registration_id]
      );
    }
    return { found: true, registrationId: payment.registration_id };
  });
}

export async function markOrderFailed({ orderId, paymentId = null, reason = null }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, registration_id, status FROM payments WHERE razorpay_order_id = ? FOR UPDATE',
      [orderId]
    );
    const payment = rows[0];
    if (!payment || payment.status === 'paid') return { found: !!payment };

    await conn.query(
      `UPDATE payments SET status = 'failed', razorpay_payment_id = COALESCE(razorpay_payment_id, ?),
              error_description = ? WHERE id = ?`,
      [paymentId, reason ? String(reason).slice(0, 255) : null, payment.id]
    );
    // Only flag the registration as failed if it was never paid through another order
    await conn.query(
      `UPDATE registrations SET status = 'failed' WHERE id = ? AND status <> 'paid'`,
      [payment.registration_id]
    );
    return { found: true, registrationId: payment.registration_id };
  });
}
