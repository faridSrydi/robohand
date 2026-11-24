#!/usr/bin/env bash
# =============================================================================
# Setup VPS Ubuntu (22.04 / 24.04) untuk robotic-hand.my.id
# Jalankan sebagai root atau dengan sudo dari root folder proyek:
#   chmod +x deploy/setup-vps.sh
#   sudo ./deploy/setup-vps.sh
# =============================================================================
set -euo pipefail

DOMAIN="robotic-hand.my.id"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="robotic_hand"
DB_USER="robohand_app"

echo "==> [1/7] Update paket & pasang dependensi sistem..."
apt-get update -y
apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx mysql-server ufw

echo "==> [2/7] Pasang Node.js 20 LTS & PM2..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> [3/7] Konfigurasi MySQL (${DB_NAME})..."
systemctl enable --now mysql
DB_PASS="$(openssl rand -hex 16)"

mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

mysql -u root "${DB_NAME}" < "${APP_DIR}/deploy/init.sql"
echo "    MySQL database '${DB_NAME}' & akun login default 'robohand' berhasil dibuat."

echo "==> [4/7] Menyiapkan file .env produksi..."
AUTH_SECRET="$(openssl rand -hex 32)"
if [ ! -f "${APP_DIR}/.env" ]; then
  cat > "${APP_DIR}/.env" <<ENV
PORT=3000
NODE_ENV=production

# Isi dengan API key Gemini kamu (https://aistudio.google.com/apikey)
GEMINI_API_KEY=

# Secret sesi login (otomatis dibuat acak)
AUTH_SECRET=${AUTH_SECRET}

# Koneksi MySQL lokal VPS
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=${DB_USER}
MYSQL_PASSWORD=${DB_PASS}
MYSQL_DATABASE=${DB_NAME}

DEFAULT_ADMIN_USER=robohand
DEFAULT_ADMIN_PASS=robohandti24

# WAJIB isi dari Cloudflare Dashboard -> Turnstile -> Add Widget (Domain: ${DOMAIN})
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
ENV
  chmod 600 "${APP_DIR}/.env"
  echo "    File .env baru dibuat. JANGAN LUPA isi GEMINI_API_KEY, TURNSTILE_SITE_KEY, dan TURNSTILE_SECRET_KEY!"
else
  echo "    File .env sudah ada (tidak ditimpa). Pastikan MYSQL_* dan TURNSTILE_* sudah benar."
fi

echo "==> [5/7] Install paket npm & build frontend..."
cd "${APP_DIR}"
npm install --omit=dev
npm install --no-save vite @vitejs/plugin-react || npm install
npm run build

echo "==> [6/7] Konfigurasi Nginx & Firewall (UFW)..."
cp "${APP_DIR}/deploy/nginx-robotic-hand.my.id.conf" "/etc/nginx/sites-available/${DOMAIN}"
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

ufw allow OpenSSH
ufw allow 'Nginx Full'
# Port 3000 dibuka agar ESP32 bisa konek via ws://robotic-hand.my.id:3000 tanpa ubah firmware
ufw allow 3000/tcp
ufw --force enable

echo "==> [7/7] Jalankan server dengan PM2..."
pm2 start "${APP_DIR}/deploy/ecosystem.config.cjs" --env production || pm2 restart robotic-hand
pm2 save
pm2 startup systemd -u root --hp /root || true

echo ""
echo "==================================================================="
echo " SELESAI! Langkah terakhir yang perlu kamu lakukan:"
echo " 1. Edit ${APP_DIR}/.env lalu isi:"
echo "    - GEMINI_API_KEY"
echo "    - TURNSTILE_SITE_KEY"
echo "    - TURNSTILE_SECRET_KEY"
echo "    Lalu restart: pm2 restart robotic-hand"
echo " 2. Aktifkan HTTPS SSL gratis (pastikan DNS A record sudah ke IP VPS):"
echo "    sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
echo " 3. Di halaman setup ESP32 (handrobot.local), isi Server:"
echo "    ${DOMAIN}:3000"
echo "==================================================================="
