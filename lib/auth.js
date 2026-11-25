const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'rh_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 hari

// Kunci pengujian resmi Cloudflare Turnstile (hanya dipakai saat lokal / non-production jika .env belum diisi)
const CF_DEV_SITE_KEY = '3x00000000000000000000FF';
const CF_DEV_SECRET_KEY = '1x0000000000000000000000000000000AA';

const isProd = () => process.env.NODE_ENV === 'production';

// Secret penanda tangan cookie sesi (wajib diisi di .env saat production)
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
function getAuthSecret() {
  return (process.env.AUTH_SECRET || '').trim() || EPHEMERAL_SECRET;
}

function isLoginEnabled() {
  const raw = String(process.env.LOGIN_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(raw);
}

function isTurnstileEnabled() {
  const raw = String(process.env.TURNSTILE_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(raw);
}

function getTurnstileConfig() {
  if (!isTurnstileEnabled()) {
    return { enabled: false, siteKey: '', secretKey: '', mode: 'disabled' };
  }
  const siteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
  const secretKey = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (siteKey && secretKey) {
    return { enabled: true, siteKey, secretKey, mode: 'live' };
  }
  if (!isProd()) {
    return { enabled: true, siteKey: CF_DEV_SITE_KEY, secretKey: CF_DEV_SECRET_KEY, mode: 'test' };
  }
  return { enabled: true, siteKey: '', secretKey: '', mode: 'unconfigured' };
}

function getMysqlConfig() {
  return {
    host: (process.env.MYSQL_HOST || '127.0.0.1').trim(),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: (process.env.MYSQL_USER || 'root').trim(),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: (process.env.MYSQL_DATABASE || 'robotic_hand').trim(),
  };
}

let pool = null;
let dbReady = false;
let dbLastError = '';
let initPromise = null;

async function initDatabase({ force = false } = {}) {
  if (dbReady && pool && !force) return { ok: true };
  if (initPromise && !force) return initPromise;

  initPromise = (async () => {
    const cfg = getMysqlConfig();
    try {
      // Pastikan database ada (jika user MySQL memiliki izin CREATE DATABASE)
      try {
        const boot = await mysql.createConnection({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          password: cfg.password,
          connectTimeout: 5000,
        });
        await boot.query(
          `CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        await boot.end();
      } catch {
        // User DB non-root (mis. di VPS) mungkin hanya punya izin pada DB yang sudah dibuat
      }

      if (pool) {
        try { await pool.end(); } catch {}
      }

      pool = mysql.createPool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000,
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(64) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'admin',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP NULL DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Seed akun default jika belum ada
      const defUser = (process.env.DEFAULT_ADMIN_USER || 'robohand').trim();
      const defPass = process.env.DEFAULT_ADMIN_PASS || 'robohandti24';
      const [rows] = await pool.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [defUser]);
      if (rows.length === 0) {
        const hash = await bcrypt.hash(defPass, 10);
        await pool.execute(
          'INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [defUser, hash, 'admin']
        );
      }

      dbReady = true;
      dbLastError = '';
      return { ok: true };
    } catch (err) {
      dbReady = false;
      dbLastError = err.message || String(err);
      return { ok: false, error: dbLastError };
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

function getDbStatus() {
  return { ready: dbReady, error: dbLastError };
}

function parseCookies(req) {
  const header = req?.headers?.cookie || '';
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    if (!data.u) return null;
    return { id: data.sub, username: data.u, role: data.r || 'admin' };
  } catch {
    return null;
  }
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

function isHttpsReq(req) {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function setSessionCookie(res, req, user) {
  const token = signToken({
    sub: user.id,
    u: user.username,
    r: user.role || 'admin',
    exp: Date.now() + SESSION_TTL_SEC * 1000,
  });
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
  ];
  if (isHttpsReq(req) || isProd()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttpsReq(req) || isProd()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getClientIp(req) {
  const cf = req?.headers?.['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.socket?.remoteAddress || '';
}

async function verifyTurnstile(token, remoteIp) {
  const cfg = getTurnstileConfig();
  if (!cfg.enabled) {
    return { ok: true, disabled: true };
  }
  if (!cfg.secretKey) {
    return { ok: false, reason: 'turnstile_unconfigured' };
  }
  if (!token || typeof token !== 'string' || token.length < 10) {
    return { ok: false, reason: 'turnstile_missing' };
  }
  try {
    const form = new URLSearchParams();
    form.set('secret', cfg.secretKey);
    form.set('response', token);
    if (remoteIp) form.set('remoteip', remoteIp);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    if (data?.success) return { ok: true };
    return { ok: false, reason: 'turnstile_failed', codes: data?.['error-codes'] || [] };
  } catch (err) {
    return { ok: false, reason: 'turnstile_network', error: err.message };
  }
}

// Rate limiter sederhana per IP untuk /api/auth/login (maks 15 percobaan / 15 menit)
const loginHits = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 15;

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = loginHits.get(key);
  if (!entry || now > entry.resetAt) {
    loginHits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retrySec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

function resetRateLimit(ip) {
  if (ip) loginHits.delete(ip);
}

async function authenticateUser(username, password) {
  if (!dbReady || !pool) {
    const res = await initDatabase();
    if (!res.ok) return { ok: false, reason: 'db_unavailable', error: res.error };
  }
  try {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');
    if (!cleanUser || !cleanPass) {
      return { ok: false, reason: 'invalid_credentials' };
    }
    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, role FROM users WHERE username = ? LIMIT 1',
      [cleanUser]
    );
    if (rows.length === 0) {
      return { ok: false, reason: 'invalid_credentials' };
    }
    const user = rows[0];
    const match = await bcrypt.compare(cleanPass, user.password_hash);
    if (!match) {
      return { ok: false, reason: 'invalid_credentials' };
    }
    pool.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]).catch(() => {});
    return { ok: true, user: { id: user.id, username: user.username, role: user.role } };
  } catch (err) {
    dbReady = false;
    dbLastError = err.message || String(err);
    return { ok: false, reason: 'db_unavailable', error: dbLastError };
  }
}

function requireAuth(req, res, next) {
  if (!isLoginEnabled()) {
    return next();
  }
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }
  req.user = session;
  return next();
}

module.exports = {
  isLoginEnabled,
  initDatabase,
  getDbStatus,
  getTurnstileConfig,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  getClientIp,
  verifyTurnstile,
  checkRateLimit,
  resetRateLimit,
  authenticateUser,
  requireAuth,
};
