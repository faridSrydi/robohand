# Robotic Hand

## Jalankan (wajib urutan ini)

1. Hapus folder `public/` lama jika ada (sisa versi sebelumnya).
2. `npm install`
3. `npm run build`   -> membuat ulang folder `public/`
4. `npm start`       -> buka http://localhost:3000 (lalu tekan Ctrl+F5 untuk refresh paksa)

Mode pengembangan: `npm run dev` (terminal kedua: `npm start` untuk WebSocket ke ESP32).

## Struktur

- `src/pages/` halaman Beranda, Simulasi, Kontrol
- `src/components/` layout, kanvas 3D, pembungkus model
- `src/three/` model 3D asli (robotRig, components, features) yang dimuat ke React Three Fiber
- `src/control/` WebSocket, tracking MediaPipe, wizard kalibrasi
- `server.js` server Node.js, `firmware/esp32_hand.ino` firmware ESP32
