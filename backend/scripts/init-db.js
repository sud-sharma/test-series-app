// Creates the database (if missing) and all tables from schema.sql
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbName = process.env.DB_NAME;
if (!dbName || !/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error('DB_NAME must be set and contain only letters, digits and underscores');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

try {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  const sql = await fs.readFile(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await conn.query(sql);
  console.log(`Database "${dbName}" is ready.`);
} finally {
  await conn.end();
}
