// Usage: npm run create-admin -- <email> <password> "<name>"
// Creates an admin, or resets the password if the email already exists.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> "<name>"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
});

try {
  const hash = await bcrypt.hash(password, 12);
  await conn.query(
    `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name)`,
    [name, email.trim().toLowerCase(), hash]
  );
  console.log(`Admin ${email} is ready.`);
} finally {
  await conn.end();
}
