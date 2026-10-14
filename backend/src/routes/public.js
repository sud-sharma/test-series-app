import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { razorpay, verifyPaymentSignature } from '../razorpay.js';
import { validate } from '../middleware/validate.js';
import { markOrderPaid } from '../services/payments.js';
import { captchaEnabled, verifyCaptcha, newAccessToken, tokenMatches, limits } from '../security.js';

const router = Router();

const registrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(120)
    .refine((s) => !/[<>{}\\]|https?:\/\/|www\./i.test(s), 'Please enter a valid name'),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((s) => s.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
    .refine((s) => /^[6-9]\d{9}$/.test(s), 'Please enter a valid 10-digit mobile number'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(190),
  studentType: z.enum(['new', 'old_student', 'repeater', 'optional_student'], {
    message: 'Please select your category',
  }),
  city: z
    .string()
    .trim()
    .max(100)
    .refine((s) => !/[<>{}\\]|https?:\/\/|www\./i.test(s), 'Please enter a valid city')
    .optional()
    .or(z.literal('')),
  // Honeypot: a field hidden from people. Real visitors leave it empty; many bots fill it.
  website: z.string().max(200).optional(),
  captchaToken: z.string().max(2048).optional(),
});

// Public course info so the landing page can show the live fee and set up the CAPTCHA
router.get('/course', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    name: config.course.name,
    feePaise: config.course.feePaise,
    currency: 'INR',
    razorpayKeyId: config.razorpay.keyId,
    turnstileSiteKey: captchaEnabled() ? config.turnstile.siteKey : null,
  });
});

// Step 1: save the registration form
router.post('/registrations', limits.register, validate(registrationSchema), async (req, res, next) => {
  try {
    const { name, phone, email, studentType, city, website, captchaToken } = req.valid.body;

    if (website) {
      // Honeypot filled: almost certainly a bot. Same generic error, nothing saved.
      return res.status(400).json({ error: 'Could not submit the form. Please try again.' });
    }

    const captcha = await verifyCaptcha(captchaToken, req.ip);
    if (!captcha.ok) {
      const unavailable = captcha.reason === 'verification-unavailable';
      return res.status(unavailable ? 503 : 400).json({
        error: unavailable
          ? 'We could not verify the security check right now. Please try again in a moment.'
          : 'Please complete the security check and submit again.',
        captcha: true,
      });
    }

    const { token, hash } = newAccessToken();
    const [result] = await pool.query(
      `INSERT INTO registrations (name, phone, email, student_type, city, amount_paise, access_token_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email, studentType, city || null, config.course.feePaise, hash]
    );
    res.status(201).json({
      registrationId: result.insertId,
      registrationToken: token,
      amountPaise: config.course.feePaise,
      currency: 'INR',
    });
  } catch (err) {
    next(err);
  }
});

// Step 2: create a Razorpay order for that registration (needs the token from step 1)
router.post(
  '/payments/order',
  limits.order,
  validate(
    z.object({
      registrationId: z.coerce.number().int().positive(),
      registrationToken: z.string().min(20).max(100),
    })
  ),
  async (req, res, next) => {
    try {
      const { registrationId, registrationToken } = req.valid.body;
      const [rows] = await pool.query(
        `SELECT id, name, email, phone, status, student_type, amount_paise, access_token_hash
           FROM registrations WHERE id = ?`,
        [registrationId]
      );
      const reg = rows[0];
      // Same response for "no such registration" and "wrong token", so IDs can't be probed
      if (!reg || !tokenMatches(registrationToken, reg.access_token_hash)) {
        return res.status(404).json({ error: 'Registration not found. Please submit the form again.' });
      }
      if (reg.status === 'paid') return res.status(409).json({ error: 'This registration is already paid' });
      if (reg.student_type !== 'new') {
        return res.status(409).json({ error: 'Our team will confirm your concession fee and share a payment link.' });
      }

      // Amount always comes from the database, never from the browser
      const order = await razorpay.orders.create({
        amount: reg.amount_paise,
        currency: 'INR',
        receipt: `reg_${reg.id}_${Date.now()}`,
        notes: { registration_id: String(reg.id), course: config.course.name },
      });

      await pool.query(
        `INSERT INTO payments (registration_id, razorpay_order_id, amount_paise, currency)
         VALUES (?, ?, ?, ?)`,
        [reg.id, order.id, order.amount, order.currency]
      );

      res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: config.razorpay.keyId,
        courseName: config.course.name,
        prefill: { name: reg.name, email: reg.email, contact: reg.phone },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Step 3: verify the signature Razorpay Checkout hands back to the browser
router.post(
  '/payments/verify',
  limits.verify,
  validate(
    z.object({
      razorpay_order_id: z.string().min(1).max(64),
      razorpay_payment_id: z.string().min(1).max(64),
      razorpay_signature: z.string().min(1).max(256),
    })
  ),
  async (req, res, next) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.valid.body;
      const ok = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!ok) return res.status(400).json({ error: 'Payment verification failed' });

      const result = await markOrderPaid({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!result.found) return res.status(404).json({ error: 'Order not found' });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
