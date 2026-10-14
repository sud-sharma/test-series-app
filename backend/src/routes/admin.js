import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post(
  '/login',
  loginLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })),
  async (req, res, next) => {
    try {
      const { email, password } = req.valid.body;
      const [rows] = await pool.query('SELECT id, name, email, password_hash FROM admins WHERE email = ?', [email]);
      const admin = rows[0];
      const ok = admin && (await bcrypt.compare(password, admin.password_hash));
      if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

      await pool.query('UPDATE admins SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [admin.id]);
      const token = jwt.sign({ sub: admin.id, email: admin.email, name: admin.name }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      });
      res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
    } catch (err) {
      next(err);
    }
  }
);

router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ admin: req.admin }));

router.get('/stats', async (req, res, next) => {
  try {
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'paid')    AS paid,
              SUM(status = 'pending') AS pending,
              SUM(status = 'failed')  AS failed,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paise END), 0) AS revenuePaise,
              SUM(created_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY) AS last24h
         FROM registrations`
    );
    const [byMode] = await pool.query(
      `SELECT mode, COUNT(*) AS count FROM registrations WHERE status = 'paid' GROUP BY mode`
    );
    const [byClass] = await pool.query(
      `SELECT class_level AS classLevel, COUNT(*) AS count FROM registrations WHERE status = 'paid' GROUP BY class_level`
    );
    const [daily] = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS registrations, SUM(status = 'paid') AS paid
         FROM registrations
        WHERE created_at >= UTC_DATE() - INTERVAL 13 DAY
        GROUP BY DATE(created_at)
        ORDER BY day`
    );
    const num = (v) => Number(v || 0);
    res.json({
      total: num(totals.total),
      paid: num(totals.paid),
      pending: num(totals.pending),
      failed: num(totals.failed),
      revenuePaise: num(totals.revenuePaise),
      last24h: num(totals.last24h),
      byMode: byMode.map((r) => ({ mode: r.mode, count: num(r.count) })),
      byClass: byClass.map((r) => ({ classLevel: r.classLevel, count: num(r.count) })),
      daily: daily.map((r) => ({ day: r.day, registrations: num(r.registrations), paid: num(r.paid) })),
    });
  } catch (err) {
    next(err);
  }
});

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['pending', 'paid', 'failed']).optional().or(z.literal('')),
  mode: z.enum(['online', 'offline']).optional().or(z.literal('')),
  classLevel: z.enum(['11', '12', 'dropper']).optional().or(z.literal('')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

function buildFilters(q) {
  const where = [];
  const params = [];
  if (q.search) {
    where.push('(r.name LIKE ? OR r.email LIKE ? OR r.phone LIKE ? OR r.city LIKE ?)');
    const like = `%${q.search}%`;
    params.push(like, like, like, like);
  }
  if (q.status) { where.push('r.status = ?'); params.push(q.status); }
  if (q.mode) { where.push('r.mode = ?'); params.push(q.mode); }
  if (q.classLevel) { where.push('r.class_level = ?'); params.push(q.classLevel); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const regColumns = `r.id, r.name, r.phone, r.email, r.class_level AS classLevel, r.mode, r.city,
  r.status, r.amount_paise AS amountPaise, r.paid_at AS paidAt, r.created_at AS createdAt`;

router.get('/registrations', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.valid.query;
    const { sql, params } = buildFilters(q);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM registrations r ${sql}`, params);
    const [rows] = await pool.query(
      `SELECT ${regColumns} FROM registrations r ${sql} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, q.limit, (q.page - 1) * q.limit]
    );
    res.json({ data: rows, page: q.page, limit: q.limit, total: Number(total) });
  } catch (err) {
    next(err);
  }
});

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Guard against spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/registrations/export.csv', validate(listQuery.omit({ page: true, limit: true }), 'query'), async (req, res, next) => {
  try {
    const { sql, params } = buildFilters(req.valid.query);
    const [rows] = await pool.query(
      `SELECT ${regColumns},
              (SELECT p.razorpay_payment_id FROM payments p
                WHERE p.registration_id = r.id AND p.status = 'paid' LIMIT 1) AS paymentId
         FROM registrations r ${sql} ORDER BY r.created_at DESC`,
      params
    );
    const header = ['ID', 'Name', 'Phone', 'Email', 'Class', 'Mode', 'City', 'Status', 'Amount (INR)', 'Payment ID', 'Paid at', 'Registered at'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [r.id, r.name, r.phone, r.email, r.classLevel, r.mode, r.city, r.status, (r.amountPaise / 100).toFixed(2), r.paymentId, r.paidAt, r.createdAt]
          .map(csvCell)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registrations-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

router.get('/registrations/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const [rows] = await pool.query(`SELECT ${regColumns}, r.updated_at AS updatedAt FROM registrations r WHERE r.id = ?`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Registration not found' });
    const [payments] = await pool.query(
      `SELECT id, razorpay_order_id AS orderId, razorpay_payment_id AS paymentId, amount_paise AS amountPaise,
              currency, status, method, error_description AS errorDescription, created_at AS createdAt, updated_at AS updatedAt
         FROM payments WHERE registration_id = ? ORDER BY created_at DESC`,
      [id]
    );
    res.json({ ...rows[0], payments });
  } catch (err) {
    next(err);
  }
});

router.delete('/registrations/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const [[reg]] = await pool.query('SELECT status FROM registrations WHERE id = ?', [id]);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    if (reg.status === 'paid') return res.status(409).json({ error: 'Paid registrations cannot be deleted' });
    await pool.query('DELETE FROM registrations WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
