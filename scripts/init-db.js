// Skrip inisialisasi database MySQL & akun default RoboticHand.
// Jalankan: npm run db:init
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !(k in process.env)) process.env[k] = v;
  }
}

const { initDatabase } = require('../lib/auth');

(async () => {
  const res = await initDatabase({ force: true });
  if (!res.ok) {
    console.error('[DB] Gagal inisialisasi MySQL:', res.error);
    process.exit(1);
  }
  console.log('[DB] Database MySQL & tabel users siap.');
  console.log(`[DB] Akun default: ${process.env.DEFAULT_ADMIN_USER || 'robohand'}`);
  process.exit(0);
})();
