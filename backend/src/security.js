import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';

/* ---------- Registration access tokens ----------
 * Each registration gets a random secret returned only to the browser that created it.
 * The database stores just its SHA-256 hash. Creating a payment order requires the token,
 * so nobody can guess registration IDs and read other students' details or create orders.
 */
export function newAccessToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Cloudflare Turnstile (CAPTCHA) ----------
 * Enabled when TURNSTILE_SECRET_KEY is set. Tokens are single-use and valid for 5 minutes.
 */
export const captchaEnabled = () => Boolean(config.turnstile.secretKey);

export async function verifyCaptcha(token, remoteIp, fetchImpl = globalThis.fetch) {
  if (!captchaEnabled()) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'missing-token' };
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.turnstile.secretKey, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!data.success) return { ok: false, reason: (data['error-codes'] || []).join(',') || 'failed' };
    // Reject tokens solved on some other website
    if (config.turnstile.allowedHostnames.length && !config.turnstile.allowedHostnames.includes(data.hostname)) {
      return { ok: false, reason: 'hostname-mismatch' };
    }
    return { ok: true };
  } catch (err) {
    console.error('Turnstile verification error:', err.message);
    return { ok: false, reason: 'verification-unavailable' };
  }
}

/* ---------- Rate limits (per client IP) ---------- */
const limiter = (windowMinutes, limit, error) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error },
  });

export const limits = {
  general: limiter(1, 60, 'Too many requests. Please wait a minute and try again.'),
  register: limiter(15, 5, 'Too many registration attempts from your network. Please try again in 15 minutes.'),
  order: limiter(15, 10, 'Too many payment attempts. Please try again in 15 minutes.'),
  verify: limiter(15, 20, 'Too many requests. Please try again in 15 minutes.'),
};
