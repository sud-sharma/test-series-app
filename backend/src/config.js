import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const feeInr = Number(process.env.COURSE_FEE_INR || 0);
if (!Number.isFinite(feeInr) || feeInr <= 0) {
  throw new Error('COURSE_FEE_INR must be a positive number');
}

// How many reverse proxies sit in front of the API (nginx = 1). Needed so rate limits see the
// real visitor IP. Never set it higher than the real number: that lets visitors fake their IP.
function parseTrustProxy(v) {
  if (v === undefined || v === '' || v === 'false' || v === '0') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // e.g. "loopback" or a list of proxy IPs
}

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    // Hostnames the landing page is served from, e.g. geography.guidanceias.com
    allowedHostnames: list(process.env.TURNSTILE_HOSTNAMES),
  },
  corsOrigins: list(process.env.CORS_ORIGINS),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  },
  razorpay: {
    keyId: required('RAZORPAY_KEY_ID'),
    keySecret: required('RAZORPAY_KEY_SECRET'),
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  course: {
    name: process.env.COURSE_NAME || 'Test Series',
    feePaise: Math.round(feeInr * 100),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
};

if (config.isProd) {
  if (config.jwt.secret.length < 32 || /replace_with/.test(config.jwt.secret)) {
    throw new Error('JWT_SECRET must be a long random string in production');
  }
  if (!config.turnstile.secretKey) {
    console.warn('WARNING: TURNSTILE_SECRET_KEY is not set, so the registration form has no CAPTCHA.');
  }
  if (!config.razorpay.webhookSecret || config.razorpay.webhookSecret === 'change_me') {
    console.warn('WARNING: RAZORPAY_WEBHOOK_SECRET is not set; payment webhooks will be rejected.');
  }
}
