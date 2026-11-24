# Panduan Deploy VPS — `robotic-hand.my.id`

Panduan lengkap menjalankan **RoboticHand** (React + Node.js + WebSocket + MySQL Auth + Cloudflare Turnstile + Gemini AI) di VPS Ubuntu dengan domain **`robotic-hand.my.id`**.

---

## 1. Arahkan DNS Domain ke IP VPS

Di dashboard DNS domain / Cloudflare untuk **`robotic-hand.my.id`**, buat **A Record**:

| Type | Name | Content / Target | Proxy (Cloudflare) |
| --- | --- | --- | --- |
| `A` | `@` (`robotic-hand.my.id`) | `IP_VPS_KAMU` | DNS Only (abu-abu) *disarankan* |
| `A` | `www` | `IP_VPS_KAMU` | DNS Only (abu-abu) *disarankan* |

> **Kenapa disarankan DNS Only (abu-abu)?**  
> Karena ESP32 terhubung ke `robotic-hand.my.id:3000` langsung via WebSocket (`ws://`). Cloudflare Proxy (awan oranye) memblokir port `3000`. Jika ingin pakai awan oranye di domain utama, buat subdomain khusus `esp.robotic-hand.my.id` (DNS Only) untuk ESP32, atau ubah firmware ESP32 ke `ws.beginSSL("robotic-hand.my.id", 443, "/esp")`.

---

## 2. Buat Cloudflare Turnstile (Checklist Box Login)

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) → menu **Turnstile** → klik **Add widget**.
2. Isi:
   - **Widget name**: `RoboticHand Control`
   - **Hostname / Domain**: `robotic-hand.my.id` dan `www.robotic-hand.my.id`
   - **Widget Mode**: pilih **Managed** (menampilkan checkbox *"Verify you are human"* saat dibutuhkan) atau **Non-interactive**.
3. Klik **Create** lalu salin **Site Key** dan **Secret Key**.

---

## 3. Upload Proyek & Jalankan Setup Otomatis di VPS

Login ke VPS Ubuntu (22.04 / 24.04) via SSH, lalu:

```bash
# Contoh: clone atau upload folder proyek ke /var/www/robotic-hand
sudo mkdir -p /var/www/robotic-hand
# (Upload seluruh folder proyek ke /var/www/robotic-hand via git clone / scp / FileZilla)

cd /var/www/robotic-hand
chmod +x deploy/setup-vps.sh
sudo ./deploy/setup-vps.sh
```

Skrip `setup-vps.sh` otomatis melakukan:
- Install Node.js 20 LTS, PM2, MySQL Server, Nginx, Certbot, dan UFW firewall
- Membuat database MySQL **`robotic_hand`** dan tabel `users` beserta akun default:
  - **Username**: `robohand`
  - **Password**: `robohandti24` (tersimpan dalam bentuk hash **bcrypt**)
- Membuat file `.env` produksi lengkap dengan password MySQL & `AUTH_SECRET` acak
- Build frontend (`npm run build`)
- Memasang konfigurasi Nginx untuk `robotic-hand.my.id` (termasuk WebSocket `/browser` & `/esp`)
- Menjalankan server 24/7 via PM2

---

## 4. Isi API Key di `.env` & Restart PM2

Edit file `.env`:

```bash
nano /var/www/robotic-hand/.env
```

Isi 3 baris ini:

```env
GEMINI_API_KEY=ISI_GEMINI_API_KEY_KAMU
TURNSTILE_SITE_KEY=ISI_SITE_KEY_CLOUDFLARE_TURNSTILE
TURNSTILE_SECRET_KEY=ISI_SECRET_KEY_CLOUDFLARE_TURNSTILE
```

Simpan (`Ctrl+O`, Enter, `Ctrl+X`), lalu restart PM2:

```bash
pm2 restart robotic-hand
pm2 logs robotic-hand --lines 30
```

Pastikan log menampilkan:
- `Gemini Jarvis  : AKTIF`
- `MySQL Auth     : AKTIF (robotic_hand @ 127.0.0.1)`
- `Turnstile      : LIVE`

---

## 5. Aktifkan HTTPS SSL Gratis (Certbot)

Wajib HTTPS supaya **Kamera (Hand Tracking)** dan **Mikrofon (Kontrol Suara AI)** berfungsi di HP & laptop:

```bash
sudo certbot --nginx -d robotic-hand.my.id -d www.robotic-hand.my.id
```

Setelah selesai, buka **`https://robotic-hand.my.id`**.

---

## 6. Hubungkan ESP32 ke VPS

1. Nyalakan robot (ESP32), buka halaman setup `http://handrobot.local` (atau hotspot `HandRobot-Setup` jika WiFi belum diset).
2. Isi WiFi yang memiliki akses internet.
3. Di kolom **Server**, isi:
   ```
   robotic-hand.my.id:3000
   ```
4. Simpan. ESP32 akan langsung terhubung ke VPS lewat internet, dan indikator **ESP32 (WiFi)** di `https://robotic-hand.my.id/robot-hand` berubah hijau!

---

## Perintah Berguna di VPS

```bash
# Cek status aplikasi
pm2 status

# Lihat log real-time
pm2 logs robotic-hand

# Update setelah edit kode baru
cd /var/www/robotic-hand
npm install
npm run build
pm2 restart robotic-hand

# Reset / inisialisasi ulang database & akun default
npm run db:init
```
