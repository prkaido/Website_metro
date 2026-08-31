import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const required = ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_CONTRASENA', 'AUTH_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS equipments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    serial text NOT NULL DEFAULT '',
    cost_center text NOT NULL DEFAULT '',
    location text NOT NULL DEFAULT '',
    last_calibration date NOT NULL,
    interval_days integer NOT NULL CHECK (interval_days > 0),
    certificate text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}

function sign(value) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET).update(value).digest('base64url');
}
function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const [payload, signature] = token.split('.');
  const expected = sign(payload || '');
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    if (JSON.parse(Buffer.from(payload, 'base64url').toString()).exp < Date.now()) throw new Error('expired');
    next();
  } catch { return res.status(401).json({ error: 'Expired token' }); }
}
function equipment(row) {
  return { id: row.id, name: row.name, serial: row.serial, costCenter: row.cost_center, location: row.location, last: row.last_calibration, intervalDays: row.interval_days, cert: row.certificate };
}
function fields(body) {
  const value = { name: String(body.name || '').trim(), serial: String(body.serial || '').trim(), costCenter: String(body.costCenter || '').trim(), location: String(body.location || '').trim(), last: String(body.last || ''), intervalDays: Number(body.intervalDays), cert: String(body.cert || '').trim() };
  if (!value.name || !/^\d{4}-\d{2}-\d{2}$/.test(value.last) || !Number.isInteger(value.intervalDays) || value.intervalDays < 1) throw new Error('Invalid equipment data');
  return value;
}

app.get('/api/health', async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); });
app.post('/api/v1/auth/login', (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_CONTRASENA) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: issueToken() });
});
app.get('/api/v1/equipments', requireAuth, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM equipments ORDER BY name');
  res.json({ data: rows.map(equipment) });
});
app.post('/api/v1/equipments', requireAuth, async (req, res, next) => { try {
  const e = fields(req.body); const { rows } = await pool.query('INSERT INTO equipments (name, serial, cost_center, location, last_calibration, interval_days, certificate) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [e.name,e.serial,e.costCenter,e.location,e.last,e.intervalDays,e.cert]); res.status(201).json({ data: equipment(rows[0]) });
} catch (error) { next(error); } });
app.put('/api/v1/equipments/:id', requireAuth, async (req, res, next) => { try {
  const e = fields(req.body); const { rows } = await pool.query('UPDATE equipments SET name=$1, serial=$2, cost_center=$3, location=$4, last_calibration=$5, interval_days=$6, certificate=$7, updated_at=now() WHERE id=$8 RETURNING *', [e.name,e.serial,e.costCenter,e.location,e.last,e.intervalDays,e.cert,req.params.id]); if (!rows[0]) return res.status(404).json({ error: 'Equipment not found' }); res.json({ data: equipment(rows[0]) });
} catch (error) { next(error); } });
app.delete('/api/v1/equipments/:id', requireAuth, async (req, res, next) => { try {
  const result = await pool.query('DELETE FROM equipments WHERE id=$1', [req.params.id]); if (!result.rowCount) return res.status(404).json({ error: 'Equipment not found' }); res.status(204).end();
} catch (error) { next(error); } });
app.use((error, _req, res, _next) => { console.error(error); res.status(400).json({ error: 'Request could not be processed' }); });
app.get('*splat', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase().then(() => app.listen(process.env.PORT || 3000));
