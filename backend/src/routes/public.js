import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { razorpay, verifyPaymentSignature } from '../razorpay.js';
import { validate } from '../middleware/validate.js';
import { markOrderPaid } from '../services/payments.js';

const router = Router();

const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
    .refine((s) => /^[6-9]\d{9}$/.test(s), 'Please enter a valid 10-digit mobile number'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(190),
  classLevel: z.enum(['11', '12', 'dropper'], { message: 'Please select your class' }),
  mode: z.enum(['online', 'offline'], { message: 'Please select a mode' }),
  city: z.string().trim().max(100).optional().or(z.literal('')),
});

// Public course info so the landing page can show the live fee
router.get('/course', (req, res) => {
  res.json({
    name: config.course.name,
    feePaise: config.course.feePaise,
    currency: 'INR',
    razorpayKeyId: config.razorpay.keyId,
  });
});

// Step 1: save the registration form
router.post('/registrations', validate(registrationSchema), async (req, res, next) => {
  try {
    const { name, phone, email, classLevel, mode, city } = req.valid.body;
    const [result] = await pool.query(
      `INSERT INTO registrations (name, phone, email, class_level, mode, city, amount_paise)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email, classLevel, mode, city || null, config.course.feePaise]
    );
    res.status(201).json({
      registrationId: result.insertId,
      amountPaise: config.course.feePaise,
      currency: 'INR',
    });
  } catch (err) {
    next(err);
  }
});

// Step 2: create a Razorpay order for that registration
router.post(
  '/payments/order',
  validate(z.object({ registrationId: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      const { registrationId } = req.valid.body;
      const [rows] = await pool.query(
        'SELECT id, name, email, phone, status, amount_paise FROM registrations WHERE id = ?',
        [registrationId]
      );
      const reg = rows[0];
      if (!reg) return res.status(404).json({ error: 'Registration not found' });
      if (reg.status === 'paid') return res.status(409).json({ error: 'This registration is already paid' });

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
  validate(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
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

      res.json({ success: true, registrationId: result.registrationId });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
