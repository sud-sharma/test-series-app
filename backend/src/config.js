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

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
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
