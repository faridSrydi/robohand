const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');

// Mode kabel butuh paket "serialport". Kalau belum terpasang, mode WiFi tetap jalan.
let SerialPort = null;
try { ({ SerialPort } = require('serialport')); }
catch { console.log('[!] Paket serialport belum terpasang -> mode kabel nonaktif. Jalankan: npm install'); }

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const browsers = new WebSocketServer({ noServer: true }); // halaman web
const boards = new WebSocketServer({ noServer: true });   // ESP32 lewat WiFi

// Browser -> ESP32 (protokol sama untuk WiFi dan kabel)
//  "p,p,p,p,p"       target 5 jari 0-100 (0 = buka, 100 = tutup)
//  "A,i,buka,tutup"   simpan sudut buka dan tutup servo i (derajat)
//  "W,i,sudut"        gerakkan servo i ke sudut (untuk kalibrasi, belum disimpan)
//  "V,speed"          kecepatan gerak semua servo (derajat per detik, 360 = maks)
//  "G"                minta config
//  Jempol (servo kontinu 360°):
//  "C,neutral,power,dir,closeMs,openMs"  simpan kalibrasi jempol (dir = 1 atau -1)
//  "U,us"             pulsa manual jempol untuk kalibrasi (diulang tiap 250 ms oleh halaman web)
//  "Z,pos"            tetapkan posisi jempol sekarang (0 = terbuka, 100 = tertutup)
//  "L,strip,animasi,r,g,b,kecerahan,kecepatan"  pengaturan LED strip
//                     (strip 0 = keduanya, 1 = strip 1 / GPIO 22, 2 = strip 2 / GPIO 23; animasi 0-10, 10 = mati)
const TARGET_FORMAT = /^\d{1,3}(,\d{1,3}){4}$/;
const NUM = '\\d+(\\.\\d+)?';
const CMD_FORMAT = new RegExp(
  `^(A,[1-4],${NUM},${NUM}|W,[1-4],${NUM}|V,\\d{2,3}|G` +
  `|C,\\d{3,4},\\d{2,3},-?1,\\d{3,5},\\d{3,5}|U,\\d{3,4}|Z,\\d{1,3}(\\.\\d+)?` +
  `|L(,\\d{1,3}){6,7})$`
);

let mode = 'wifi';          // 'wifi' | 'serial'
let lastTarget = '0,0,0,0,0';
let lastCfg = null;
let port = null, portPath = '', serialBuf = '', gotCfg = false, keepAlive = null;

const toBoards = (msg) => boards.clients.forEach((c) => c.readyState === 1 && c.send(msg));
const toBrowsers = (msg) => browsers.clients.forEach((c) => c.readyState === 1 && c.send(msg));
const status = () => JSON.stringify({
  type: 'status', esp: boards.clients.size, mode,
  serialAvailable: !!SerialPort, serial: !!(port && port.isOpen), serialPath: portPath,
});
const broadcastStatus = () => toBrowsers(status());

function sendToEsp(msg) {
  if (mode === 'serial') { if (port && port.isOpen) port.write(msg + '\n'); }
  else toBoards(msg);
}

// Pesan JSON dari ESP32 (cfg / pos), dari WiFi maupun kabel
function fromEsp(msg, via) {
  if (via !== mode) return; // hanya terima dari jalur yang sedang dipilih
  try {
    const m = JSON.parse(msg);
    if (m.type === 'cfg') { lastCfg = msg; if (via === 'serial') gotCfg = true; }
    if (m.type === 'cfg' || m.type === 'pos') toBrowsers(msg);
  } catch {}
}

async function listPorts() {
  if (!SerialPort) return [];
  try {
    return (await SerialPort.list()).map((p) => ({ path: p.path, label: p.path + (p.manufacturer ? ' - ' + p.manufacturer : '') }));
  } catch { return []; }
}

function closePort() {
  clearInterval(keepAlive); keepAlive = null;
  if (port) { const p = port; port = null; if (p.isOpen) p.close(() => {}); }
  portPath = '';
  broadcastStatus();
}

function openPort(p0) {
  closePort();
  const p = new SerialPort({ path: p0, baudRate: 115200, autoOpen: false });
  p.on('data', (buf) => {
    serialBuf += buf.toString('utf8');
    let i;
    while ((i = serialBuf.indexOf('\n')) >= 0) {
      const line = serialBuf.slice(0, i).trim();
      serialBuf = serialBuf.slice(i + 1);
      if (line[0] === '{') fromEsp(line, 'serial');
    }
    if (serialBuf.length > 4096) serialBuf = '';
  });
  p.on('error', (e) => console.log('Serial error:', e.message));
  p.on('close', () => {
    if (port === p) { port = null; portPath = ''; clearInterval(keepAlive); keepAlive = null; broadcastStatus(); }
  });
  p.open((err) => {
    if (err) {
      console.log('Gagal buka', p0, err.message);
      toBrowsers(JSON.stringify({ type: 'error', msg: `Gagal buka ${p0}: ${err.message}. Tutup Serial Monitor Arduino lalu coba lagi.` }));
      return;
    }
    port = p; portPath = p0; gotCfg = false; serialBuf = '';
    p.set({ dtr: false, rts: false }, () => {});
    // Keepalive: ESP32 hanya kirim data balik ke kabel kalau dia terima perintah dalam 3 detik terakhir
    keepAlive = setInterval(() => { if (port && port.isOpen) port.write(gotCfg ? 'K\n' : 'G\n'); }, 1000);
    console.log('Kabel USB tersambung:', p0);
    broadcastStatus();
  });
}

async function handleControl(ws, m) {
  if (m.type === 'ports') ws.send(JSON.stringify({ type: 'ports', ports: await listPorts() }));
  else if (m.type === 'mode' && (m.mode === 'wifi' || m.mode === 'serial')) {
    mode = m.mode;
    if (mode === 'wifi') closePort();
    broadcastStatus();
  } else if (m.type === 'serial' && m.action === 'open' && SerialPort) {
    if ((await listPorts()).some((p) => p.path === m.path)) openPort(m.path);
  } else if (m.type === 'serial' && m.action === 'close') closePort();
}

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const target = pathname === '/browser' ? browsers : pathname === '/esp' ? boards : null;
  if (!target) return socket.destroy();
  target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
});

browsers.on('connection', (ws) => {
  ws.send(status());
  if (lastCfg) ws.send(lastCfg);
  ws.on('message', (data) => {
    const msg = data.toString();
    if (msg[0] === '{') { try { handleControl(ws, JSON.parse(msg)); } catch {} }
    else if (TARGET_FORMAT.test(msg)) { lastTarget = msg; sendToEsp(msg); }
    else if (CMD_FORMAT.test(msg)) sendToEsp(msg);
  });
});

boards.on('connection', (ws, req) => {
  console.log('ESP32 (WiFi) terhubung dari', req.socket.remoteAddress);
  ws.send(lastTarget);
  broadcastStatus();
  ws.on('message', (data) => fromEsp(data.toString(), 'wifi'));
  ws.on('close', () => { console.log('ESP32 (WiFi) terputus'); broadcastStatus(); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nBuka di laptop : http://localhost:${PORT}`);
  console.log('IP untuk mode WiFi (isi di halaman setup ESP32, tambah :' + PORT + '):');
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  ${i.address}`));
});
