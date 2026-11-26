// Robot hand - ESP32 + 4 servo MG996R (180°, jari) + 1 servo kontinu 360° (jempol)
//              + 2 LED strip WS2812B (34 LED per strip) + buzzer
//              dengan WiFi setup otomatis (captive portal)
// Library (Library Manager):  "WebSockets" by Markus Sattler,  "ESP32Servo" by Kevin Harrington,
//                             "Adafruit NeoPixel" by Adafruit
// Board: ESP32 Dev Module
//
// Kontrol bisa lewat WiFi (WebSocket) atau kabel USB (Serial 115200), pilih di halaman web.
//
// Cara kerja WiFi:
//  - Belum ada WiFi tersimpan / gagal nyambung -> ESP32 bikin hotspot "HandRobot-Setup",
//    halaman setup muncul otomatis (atau buka http://handrobot.local / http://192.168.4.1)
//  - Sudah nyambung -> halaman setup tetap bisa dibuka di http://handrobot.local
//  - Reset pengaturan: tahan tombol BOOT (GPIO0) selama 3 detik
//
// Saat dinyalakan: buzzer bunyi "tu-la-lit", selesai itu LED strip menyala (default: meteor berjalan).
// LED strip: strip 1 (GPIO 22) dan strip 2 (GPIO 23) diatur TERPISAH dari halaman web: animasi, warna,
//  kecerahan, kecepatan masing-masing, tersimpan di ESP32. Arus total dibatasi otomatis (LED_BUDGET_MA).
//
// Jempol (servo kontinu): tidak punya sensor posisi. Gerakannya dihitung dari WAKTU putar:
//  titik diam (neutral), kecepatan, arah, waktu tutup penuh dan waktu buka penuh. Semua diatur lewat
//  tombol Kalibrasi Jempol di halaman web dan tersimpan di ESP32.

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <ESP32Servo.h>
#include <Adafruit_NeoPixel.h>

// Definisi struct di bagian atas agar prototipe otomatis Arduino IDE selalu mengenali tipenya
struct LedCfg { int mode; int r, g, b; int bright; int speed; int rgb; };
struct ServoCfg { float open; float close; };
struct ThumbCfg {
  int neutral;    // pulsa berhenti (us), biasanya sekitar 1500 tapi tiap servo beda
  int power;      // selisih pulsa dari neutral (us). Makin besar makin cepat
  int dir;        // +1 / -1: arah putar yang MENUTUP jempol
  int closeMs;    // waktu putar dari terbuka penuh sampai tertutup penuh (ms)
  int openMs;     // waktu putar dari tertutup penuh sampai terbuka penuh (ms)
};
void ledColor(const LedCfg& L, uint32_t st, int i, uint8_t& r, uint8_t& g, uint8_t& b);

const char* AP_NAME  = "HandRobot-Setup";
const char* HOSTNAME = "handrobot";          // -> http://handrobot.local
const char* DEFAULT_SERVER = "robotic-hand.my.id:3000";
const int   RESET_PIN = 0;                   // tombol BOOT
// Urutan: jempol (kontinu 360°), telunjuk, tengah, manis, kelingking (180°)
const int SERVO_PINS[5] = {13, 14, 26, 27, 25};

// LED strip WS2812B (data lewat resistor 220 ohm)
const int LED_PIN1 = 22;
const int LED_PIN2 = 23;
const int LED_COUNT = 34;            // jumlah LED per strip
const uint8_t LED_BRIGHTNESS = 60;      // kecerahan awal (0-255) sebelum pernah diatur dari web
const uint8_t LED_MAX_BRIGHTNESS = 255; // batas atas dari web
const bool STRIP2_REVERSED = false;  // true = strip 2 berjalan berlawanan arah dengan strip 1
// Pembatas arus: 68 LED putih penuh bisa tarik ~4 A. Kecerahan kedua strip diturunkan otomatis kalau
// perkiraan arus total melebihi angka ini. XL4015 enak dipakai terus-menerus sekitar 3 A (lebih dari itu panas).
// ESP32 sendiri makan ~0,25 A dari XL4015 yang sama, jadi total sekitar 3,25 A.
const int LED_BUDGET_MA = 3000;      // batas arus total 2 strip (mA)
const int LED_MA_PER_CH = 20;        // arus 1 warna (R/G/B) WS2812B pada nilai 255
const int LED_IDLE_MA = 1;           // arus diam per LED walau mati

// Buzzer (GPIO 18 lewat resistor 100 ohm, kaki satunya ke GND)
const int BUZZER_PIN = 18;
const bool BUZZER_ACTIVE = true;     // false = buzzer pasif (bisa nada), true = buzzer aktif (cuma on/off)

Servo servos[5];
Adafruit_NeoPixel strip1(LED_COUNT, LED_PIN1, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip2(LED_COUNT, LED_PIN2, NEO_GRB + NEO_KHZ800);
Preferences prefs;
WebServer web(80);
DNSServer dns;
WebSocketsClient ws;

String cSsid, cPass, cServer;
String wsHost;
uint16_t wsPort = 3000;
bool portalMode = false;
String scanCache = "{\"scanning\":false,\"list\":[]}";
unsigned long restartAt = 0;
unsigned long resetHeldSince = 0;

// ---------------- Halaman setup ----------------
const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html lang="id" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup Robot Hand</title>
<script>try{var t=localStorage.getItem('rh-t')||(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
:root{--font:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace;--ease:cubic-bezier(.2,.8,.2,1)}
[data-theme=dark]{--bg:#0b0b0c;--sf:#131316;--sf2:#1a1a1f;--fg:#f4f4f5;--mut:#9a9aa3;--ln:rgba(255,255,255,.1);--ac:#f5b82e;--ai:#111113;--at:#f5b82e;--ok:#3fb950;--sh:0 24px 60px -24px rgba(0,0,0,.75);color-scheme:dark}
[data-theme=light]{--bg:#f7f6f2;--sf:#ffffff;--sf2:#efeee9;--fg:#111113;--mut:#6b6b73;--ln:rgba(0,0,0,.1);--ac:#f5b82e;--ai:#111113;--at:#9a6a00;--ok:#2b8a3e;--sh:0 24px 60px -28px rgba(17,17,19,.18);color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(ellipse 80% 45% at 50% -10%,rgba(245,184,46,.16),transparent 70%),var(--bg);color:var(--fg);font-family:var(--font);padding:20px 16px 36px;display:grid;place-items:center;-webkit-font-smoothing:antialiased;transition:background .3s,color .3s}
.wrap{width:min(440px,100%);display:grid;gap:14px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 4px}
.brand{display:inline-flex;align-items:center;gap:10px;font-weight:650;font-size:1.05rem;letter-spacing:-.02em}
.brand svg{width:28px;height:28px;display:block;flex:none}
.tbtn{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--ln);background:var(--sf);color:var(--fg);cursor:pointer;font-size:16px;padding:0;transition:border-color .2s,transform .2s var(--ease)}
.tbtn:hover{border-color:var(--mut);transform:translateY(-1px)}
.card{background:var(--sf);border:1px solid var(--ln);border-radius:20px;padding:24px;box-shadow:var(--sh);display:grid;gap:16px}
.head{display:grid;gap:10px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--at)}
.eyebrow::before{content:"";width:14px;height:1px;background:currentColor}
h1{margin:0;font-size:1.55rem;font-weight:650;letter-spacing:-.03em;line-height:1.1}
.pill{display:inline-flex;align-items:center;gap:8px;width:fit-content;max-width:100%;padding:6px 12px;border-radius:999px;border:1px solid var(--ln);background:var(--sf2);font-size:.82rem;color:var(--mut)}
.pill .dot{width:8px;height:8px;border-radius:50%;background:var(--ac);flex:none;box-shadow:0 0 0 3px rgba(245,184,46,.22)}
.pill.on{color:var(--fg)}
.pill.on .dot{background:var(--ok);box-shadow:0 0 0 3px rgba(63,185,80,.22)}
form{display:grid;gap:14px}
.fld{display:grid;gap:6px}
label{font-size:.85rem;font-weight:550;color:var(--fg)}
select,input[type=text],input[type=password]{width:100%;font:inherit;font-size:.94rem;padding:11px 13px;border:1px solid var(--ln);border-radius:12px;background:var(--sf2);color:var(--fg);outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
select:focus,input[type=text]:focus,input[type=password]:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(245,184,46,.2)}
.row{display:flex;gap:8px;align-items:stretch}
.row select{flex:1;min-width:0}
.pw{position:relative}
.pw input{padding-right:68px}
.eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--mut);font-size:.78rem;font-weight:600;padding:6px 9px;border-radius:8px;cursor:pointer}
.eye:hover{color:var(--fg);background:var(--ln)}
button{font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--ln);background:var(--sf2);color:var(--fg);padding:10px 14px;border-radius:12px;transition:transform .2s var(--ease),border-color .2s,filter .2s}
button:hover:not(:disabled){border-color:var(--mut);transform:translateY(-1px)}
button:active:not(:disabled){transform:scale(.98)}
button.go{width:100%;margin-top:4px;min-height:46px;border-radius:999px;background:var(--ac);border-color:var(--ac);color:var(--ai);font-size:.96rem;box-shadow:0 14px 30px -14px rgba(245,184,46,.7)}
button.go:hover:not(:disabled){border-color:var(--ac);filter:brightness(1.06)}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.hint{margin:0;font-size:.79rem;color:var(--mut);line-height:1.45}
.hint b{color:var(--fg);font-weight:600}
.msg{padding:14px 16px;border-radius:14px;border:1px solid rgba(245,184,46,.45);background:rgba(245,184,46,.08);font-size:.86rem;line-height:1.5;color:var(--fg);display:none}
.foot{text-align:center;font-family:var(--mono);font-size:.74rem;color:var(--mut);padding:2px 8px}
@media(max-width:420px){.card{padding:20px;border-radius:18px}.row{flex-wrap:wrap}.row button{width:100%}}
</style></head><body><div class="wrap">
<div class="top">
  <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#f5b82e"/><g fill="#111"><rect x="9.5" y="17" width="16" height="8" rx="2.5"/><rect x="9.5" y="13.5" width="3" height="5.5" rx="1"/><rect x="13.83" y="13.5" width="3" height="5.5" rx="1"/><rect x="18.17" y="13.5" width="3" height="5.5" rx="1"/><rect x="22.5" y="13.5" width="3" height="5.5" rx="1"/><rect x="9.5" y="8" width="3" height="4.5" rx="1.5"/><rect x="13.83" y="5.5" width="3" height="7" rx="1.5"/><rect x="18.17" y="7" width="3" height="5.5" rx="1.5"/><rect x="22.5" y="9.5" width="3" height="3" rx="1.5"/><path d="M9.5 22.5 5.8 18" stroke="#111" stroke-width="3" stroke-linecap="round" fill="none"/></g><circle cx="17.5" cy="21" r="1.2" fill="#f5b82e"/></svg><span>RoboticHand</span></div>
  <button type="button" class="tbtn" id="tt" aria-label="Ganti tema"></button>
</div>
<div class="card">
  <div class="head">
    <span class="eyebrow">Setup WiFi · ESP32</span>
    <h1>Hubungkan Robot Hand</h1>
    <div class="pill" id="pill"><span class="dot"></span><span id="status">Pilih WiFi 2.4 GHz &amp; alamat server</span></div>
  </div>
  <form id="f">
    <div class="fld">
      <label for="net">Jaringan WiFi</label>
      <div class="row"><select id="net"><option>Mencari WiFi...</option></select>
      <button type="button" id="rescan">Cari lagi</button></div>
      <input type="text" id="manual" placeholder="Nama WiFi (SSID)" style="display:none" autocapitalize="none">
    </div>
    <div class="fld">
      <label for="pass">Password WiFi</label>
      <div class="pw">
        <input type="password" id="pass" placeholder="Kosongkan jika tanpa password" autocomplete="off">
        <button type="button" class="eye" id="show" aria-pressed="false">Lihat</button>
      </div>
    </div>
    <div class="fld">
      <label for="server">Alamat Server</label>
      <input type="text" id="server" value="robotic-hand.my.id:3000" placeholder="robotic-hand.my.id:3000" autocapitalize="none" autocomplete="off">
      <p class="hint">Default: <b>robotic-hand.my.id:3000</b> (atau isi IP laptop seperti <b>192.168.1.10:3000</b> saat tes lokal).</p>
    </div>
    <button class="go" id="go" type="submit">Simpan &amp; Hubungkan</button>
  </form>
  <div class="msg" id="msg"></div>
</div>
<div class="foot">Reset WiFi: tahan tombol BOOT di ESP32 selama 3 detik</div>
</div>
<script>
const $=id=>document.getElementById(id);
let saved={};
function paintT(){const l=document.documentElement.dataset.theme==='light';$('tt').textContent=l?'\u263E':'\u2600'}
$('tt').onclick=()=>{const n=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=n;try{localStorage.setItem('rh-t',n)}catch(e){}paintT()};
paintT();
function bars(r){return r>-60?'kuat':r>-75?'sedang':'lemah'}
async function scan(refresh){
  $('rescan').disabled=true;
  $('net').innerHTML='<option>Mencari WiFi...</option>';
  try{
    const r=await (await fetch(refresh===true?'/scan?refresh=1':'/scan')).json();
    if(r.scanning){setTimeout(scan,1500);return}
    const sel=$('net');sel.innerHTML='';
    r.list.sort((a,b)=>b.rssi-a.rssi).forEach(n=>{
      const o=document.createElement('option');o.value=n.ssid;
      o.textContent=n.ssid+' ('+bars(n.rssi)+(n.secure?', terkunci':'')+')';
      if(n.ssid===saved.ssid)o.selected=true;sel.appendChild(o)});
    if(!r.list.length){const e=document.createElement('option');e.value='';e.textContent='Tidak ada WiFi ditemukan (cuma 2.4 GHz)';sel.appendChild(e)}
    const m=document.createElement('option');m.value='__manual';m.textContent='Ketik nama WiFi manual...';sel.appendChild(m);
    sel.onchange();
    $('rescan').disabled=false;
  }catch(e){setTimeout(scan,2000)}
}
$('net').onchange=()=>{$('manual').style.display=$('net').value==='__manual'?'block':'none'};
$('rescan').onclick=()=>scan(true);
$('show').onclick=()=>{const s=$('pass').type==='password';$('pass').type=s?'text':'password';$('show').textContent=s?'Tutup':'Lihat';$('show').setAttribute('aria-pressed',String(s))};
fetch('/info').then(r=>r.json()).then(i=>{
  saved=i;$('server').value=i.server||'robotic-hand.my.id:3000';
  if(i.connected){$('pill').classList.add('on');$('status').textContent='Tersambung · '+i.ssid+' ('+i.ip+')'}
  scan();
}).catch(scan);
$('f').onsubmit=async e=>{
  e.preventDefault();
  const ssid=$('net').value==='__manual'?$('manual').value.trim():$('net').value;
  if(!ssid){alert('Pilih atau isi nama WiFi dulu');return}
  if(!$('server').value.trim()){alert('Isi alamat server dulu');return}
  $('go').disabled=true;$('go').textContent='Menyimpan...';
  const body=new URLSearchParams({ssid,pass:$('pass').value,server:$('server').value.trim()});
  try{await fetch('/save',{method:'POST',body})}catch(e){}
  $('msg').style.display='block';
  $('msg').innerHTML='Pengaturan tersimpan. ESP32 restart dan menyambung ke <b>'+ssid.replace(/</g,'&lt;')+'</b>. Jika berhasil, indikator ESP32 di web kontrol berubah hijau. Jika gagal, hotspot <b>HandRobot-Setup</b> muncul lagi dalam ~20 detik.';
  $('go').textContent='Terkirim';
};
</script></body></html>
)rawliteral";

// ---------------- Helper ----------------
String jsonEscape(const String& s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if ((uint8_t)c < 0x20) { o += ' '; }
    else o += c;
  }
  return o;
}

// Terima "192.168.1.10:3000", "ws://host:3000", "http://host:3000/" dst.
void parseServer(String s) {
  s.trim();
  int p = s.indexOf("://");
  if (p >= 0) s = s.substring(p + 3);
  p = s.indexOf('/');
  if (p >= 0) s = s.substring(0, p);
  p = s.indexOf(':');
  if (p >= 0) {
    wsHost = s.substring(0, p);
    wsPort = s.substring(p + 1).toInt();
    if (wsPort == 0) wsPort = 3000;
  } else {
    wsHost = s;
    wsPort = 3000;
  }
}

// ---------------- Web handlers ----------------
void handleRoot() { web.send_P(200, "text/html", PAGE); }

void handleInfo() {
  bool conn = WiFi.status() == WL_CONNECTED;
  String j = "{\"ssid\":\"" + jsonEscape(cSsid) + "\",\"server\":\"" + jsonEscape(cServer) +
             "\",\"connected\":" + (conn ? "true" : "false") +
             ",\"ip\":\"" + (conn ? WiFi.localIP().toString() : String("")) + "\"}";
  web.send(200, "application/json", j);
}

String buildScanJson(int n) {
  String j = "{\"scanning\":false,\"list\":[";
  bool first = true;
  for (int i = 0; i < n; i++) {
    String name = WiFi.SSID(i);
    if (name.length() == 0) continue;
    if (!first) j += ",";
    first = false;
    j += "{\"ssid\":\"" + jsonEscape(name) + "\",\"rssi\":" + String(WiFi.RSSI(i)) +
         ",\"secure\":" + (WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  j += "]}";
  return j;
}

// Tanpa ?refresh=1 -> kirim hasil scan tersimpan (cepat, tidak ganggu hotspot).
// Dengan ?refresh=1 -> scan ulang di background, web polling sampai selesai.
void handleScan() {
  int n = WiFi.scanComplete();
  if (web.hasArg("refresh") && n != WIFI_SCAN_RUNNING) {
    WiFi.scanNetworks(true);
    web.send(200, "application/json", "{\"scanning\":true}");
    return;
  }
  if (n == WIFI_SCAN_RUNNING) {
    web.send(200, "application/json", "{\"scanning\":true}");
    return;
  }
  if (n >= 0) {
    scanCache = buildScanJson(n);
    WiFi.scanDelete();
  }
  web.send(200, "application/json", scanCache);
}

void handleSave() {
  String ssid = web.arg("ssid"), pass = web.arg("pass"), server = web.arg("server");
  if (ssid.length() == 0 || server.length() == 0) {
    web.send(400, "text/plain", "ssid dan server wajib diisi");
    return;
  }
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("server", server);
  web.send(200, "text/plain", "ok");
  restartAt = millis() + 1500;  // beri waktu respons terkirim
}

// Semua URL lain (cek koneksi Android/iOS/Windows) diarahkan ke halaman setup -> popup otomatis
void handleRedirect() {
  web.sendHeader("Location", "http://192.168.4.1/", true);
  web.send(302, "text/plain", "");
}

void startWeb() {
  web.on("/", handleRoot);
  web.on("/info", handleInfo);
  web.on("/scan", handleScan);
  web.on("/save", HTTP_POST, handleSave);
  if (portalMode) {
    web.on("/generate_204", handleRedirect);
    web.on("/gen_204", handleRedirect);
    web.on("/hotspot-detect.html", handleRedirect);
    web.on("/library/test/success.html", handleRedirect);
    web.on("/connecttest.txt", handleRedirect);
    web.on("/ncsi.txt", handleRedirect);
    web.on("/fwlink", handleRedirect);
    web.onNotFound(handleRedirect);
  } else {
    web.onNotFound([]() { web.send(404, "text/plain", "Not found"); });
  }
  web.begin();
}

// ---------------- WiFi ----------------
void startPortal() {
  portalMode = true;
  Serial.println("Menyiapkan hotspot setup...");

  // Bersihkan sisa percobaan sambung WiFi (ini yang bikin hotspot hilang/nggak stabil)
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(300);

  // Scan WiFi dulu sebelum hotspot nyala, hasilnya disimpan
  WiFi.mode(WIFI_STA);
  delay(100);
  int n = WiFi.scanNetworks();
  Serial.printf("Ketemu %d WiFi\n", n);
  if (n >= 0) scanCache = buildScanJson(n);
  WiFi.scanDelete();

  // Hotspot di channel tetap 6
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  bool ok = WiFi.softAP(AP_NAME, NULL, 6);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  delay(200);
  Serial.println(ok ? "Hotspot AKTIF" : "Hotspot GAGAL dibuat");

  dns.start(53, "*", WiFi.softAPIP());
  startWeb();
  Serial.print("Hubungkan HP/laptop ke WiFi: "); Serial.println(AP_NAME);
  Serial.print("Halaman setup: http://"); Serial.println(WiFi.softAPIP());
}

bool connectSta() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setAutoReconnect(true);
  WiFi.begin(cSsid.c_str(), cPass.c_str());
  Serial.print("Menyambung ke "); Serial.print(cSsid);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    for (int k = 0; k < 16; k++) { ledTick(); delay(25); }   // 400 ms, LED tetap berjalan
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

// ---------------- Buzzer ----------------
// Bunyi dibuat langsung dengan GPIO (tanpa LEDC) supaya tidak bentrok dengan PWM servo.
void buzzNote(int freq, int ms) {
  if (freq <= 0) { delay(ms); return; }
  if (BUZZER_ACTIVE) {
    digitalWrite(BUZZER_PIN, HIGH); delay(ms); digitalWrite(BUZZER_PIN, LOW);
    return;
  }
  unsigned long half = 500000UL / freq;
  unsigned long end = millis() + ms;
  while (millis() < end) {
    digitalWrite(BUZZER_PIN, HIGH); delayMicroseconds(half);
    digitalWrite(BUZZER_PIN, LOW);  delayMicroseconds(half);
  }
  digitalWrite(BUZZER_PIN, LOW);
}

// "tu-la-lit": tiga nada naik, nada terakhir lebih panjang. Ubah angkanya kalau mau nada lain.
void bootJingle() {
  buzzNote(1047, 80);  buzzNote(0, 40);    // tu
  buzzNote(1319, 80);  buzzNote(0, 40);    // la
  buzzNote(1760, 260);                     // lit
  digitalWrite(BUZZER_PIN, LOW);
}

// ---------------- LED strip: 11 animasi, tiap strip diatur sendiri ----------------
// Strip 1 (GPIO 22) dan strip 2 (GPIO 23) punya pengaturan masing-masing (animasi, warna, kecerahan, kecepatan),
// disimpan di ESP32. Kalau diatur "kedua strip" dari web, keduanya dibuat sama dan animasinya sinkron.
//  0 Meteor   1 Warna tetap   2 Napas   3 Pelangi   4 Kejar   5 Pemindai   6 Berkelip   7 Api   8 Gelombang
//  9 Kedip bergantian (strip 1 dan strip 2 menyala bergantian; pasang di kedua strip dengan kecepatan sama)
// 10 Mati
// Pelangi dan Api memakai warna sendiri, animasi lain memakai warna pilihan.
const int LED_MODES = 11;
LedCfg led[2] = {{0, 255, 170, 30, LED_BRIGHTNESS, 60, 0},     // speed 1 (pelan) - 100 (cepat), rgb 0/1
                 {0, 255, 170, 30, LED_BRIGHTNESS, 60, 0}};
Adafruit_NeoPixel* strips[2] = {&strip1, &strip2};
uint8_t ledBuf[2][LED_COUNT][3];
uint8_t heat[2][LED_COUNT];
uint32_t ledStep[2] = {0, 0};
uint32_t ledRawMa[2] = {0, 0};       // perkiraan arus warna tiap strip (mA) pada kecerahan pilihan
unsigned long lastLed[2] = {0, 0}, ledSaveAt = 0;
bool ledsOn = false, ledSaveDirty = false;

// Kunci memori: strip 1 = "lm","lr",... (sama dengan versi lama), strip 2 = "lm2","lr2",...
int ledGet(const char* k, int s, int def) { return prefs.getInt((String(k) + (s ? "2" : "")).c_str(), def); }
void ledPut(const char* k, int s, int v) { prefs.putInt((String(k) + (s ? "2" : "")).c_str(), v); }

void loadLed() {
  for (int s = 0; s < 2; s++) {
    LedCfg d = led[0];   // strip 2 belum pernah disimpan -> ikut strip 1
    led[s].mode   = constrain(ledGet("lm", s, d.mode), 0, LED_MODES - 1);
    led[s].r      = constrain(ledGet("lr", s, d.r), 0, 255);
    led[s].g      = constrain(ledGet("lg", s, d.g), 0, 255);
    led[s].b      = constrain(ledGet("lb", s, d.b), 0, 255);
    led[s].bright = constrain(ledGet("lbr", s, d.bright), 1, (int)LED_MAX_BRIGHTNESS);
    led[s].speed  = constrain(ledGet("lsp", s, d.speed), 1, 100);
    led[s].rgb    = ledGet("lrgb", s, d.rgb) ? 1 : 0;
  }
}
void saveLed() {
  for (int s = 0; s < 2; s++) {
    ledPut("lm", s, led[s].mode); ledPut("lr", s, led[s].r); ledPut("lg", s, led[s].g);
    ledPut("lb", s, led[s].b); ledPut("lbr", s, led[s].bright); ledPut("lsp", s, led[s].speed);
    ledPut("lrgb", s, led[s].rgb);
  }
}

void ledsBegin() {
  for (int s = 0; s < 2; s++) {
    strips[s]->begin();
    strips[s]->setBrightness(led[s].bright);
    strips[s]->clear();
    strips[s]->show();
  }
}

void bset(int s, int i, uint8_t r, uint8_t g, uint8_t b) { ledBuf[s][i][0] = r; ledBuf[s][i][1] = g; ledBuf[s][i][2] = b; }
void bfill(int s, uint8_t r, uint8_t g, uint8_t b) { for (int i = 0; i < LED_COUNT; i++) bset(s, i, r, g, b); }
void bclear(int s) { memset(ledBuf[s], 0, sizeof(ledBuf[s])); }
void bfade(int s, uint8_t keep) {   // keep 0-255: makin kecil, jejak makin cepat hilang
  for (int i = 0; i < LED_COUNT; i++) for (int c = 0; c < 3; c++) ledBuf[s][i][c] = (uint16_t)ledBuf[s][i][c] * keep / 256;
}
uint8_t sc(uint8_t v, float k) { return (uint8_t)(v * k); }

unsigned long ledFrameMs(int s) { return map(constrain(led[s].speed, 1, 100), 1, 100, 70, 10); }

void ledColor(const LedCfg& L, uint32_t st, int i, uint8_t& r, uint8_t& g, uint8_t& b) {
  if (!L.rgb) { r = L.r; g = L.g; b = L.b; return; }
  uint32_t c = Adafruit_NeoPixel::ColorHSV((uint16_t)(st * 700 + i * (65536 / LED_COUNT)), 255, 255);
  r = (c >> 16) & 255; g = (c >> 8) & 255; b = c & 255;
}

void ledRender(int s, unsigned long now) {
  const int N = LED_COUNT;
  const LedCfg& L = led[s];
  uint8_t* H = heat[s];
  uint32_t st = ledStep[s];
  uint8_t r, g, b;
  switch (L.mode) {
    case 0: {   // Meteor: kepala 3 LED berjalan, ekor memudar
      bfade(s, 190);
      int pos = st % (N + 14);
      for (int j = 0; j < 3; j++) {
        int idx = pos - j;
        if (idx >= 0 && idx < N) { ledColor(L, st, idx, r, g, b); bset(s, idx, r, g, b); }
      }
      break;
    }
    case 1:     // Warna tetap (atau siklus RGB pelan kalau mode RGB aktif)
      if (L.rgb) {
        uint32_t c = Adafruit_NeoPixel::ColorHSV((uint16_t)(st * 300), 255, 255);
        bfill(s, (c >> 16) & 255, (c >> 8) & 255, c & 255);
      } else {
        bfill(s, L.r, L.g, L.b);
      }
      break;
    case 2: {   // Napas: terang-redup pelan
      float v = (sinf(st * 0.06f - 1.5708f) + 1.0f) / 2.0f; v *= v;
      if (L.rgb) {
        for (int i = 0; i < N; i++) {
          ledColor(L, st / 2, i, r, g, b);
          bset(s, i, sc(r, v), sc(g, v), sc(b, v));
        }
      } else {
        bfill(s, sc(L.r, v), sc(L.g, v), sc(L.b, v));
      }
      break;
    }
    case 3:     // Pelangi bergeser
      for (int i = 0; i < N; i++) {
        uint32_t c = Adafruit_NeoPixel::ColorHSV((uint16_t)(st * 600 + i * (65536 / N)), 255, 255);
        bset(s, i, (c >> 16) & 255, (c >> 8) & 255, c & 255);
      }
      break;
    case 4:     // Kejar: tiap 3 LED menyala, bergeser
      bclear(s);
      for (int i = 0; i < N; i++) {
        if ((i + st / 2) % 3 == 0) { ledColor(L, st, i, r, g, b); bset(s, i, r, g, b); }
      }
      break;
    case 5: {   // Pemindai: bolak-balik seperti mata KITT
      bfade(s, 150);
      int cyc = 2 * (N - 1), p = st % cyc, pos = p < N ? p : cyc - p;
      ledColor(L, st, pos, r, g, b);
      bset(s, pos, r, g, b);
      if (pos > 0)     bset(s, pos - 1, sc(r, .35f), sc(g, .35f), sc(b, .35f));
      if (pos < N - 1) bset(s, pos + 1, sc(r, .35f), sc(g, .35f), sc(b, .35f));
      break;
    }
    case 6:     // Berkelip: titik acak menyala lalu memudar
      bfade(s, 225);
      if (random(100) < 45) { int idx = random(N); ledColor(L, st, idx, r, g, b); bset(s, idx, r, g, b); }
      if (random(100) < 20) { int idx = random(N); ledColor(L, st + 17, idx, r, g, b); bset(s, idx, r, g, b); }
      break;
    case 7:     // Api
      for (int i = 0; i < N; i++) { int d = random(0, (55 * 10 / N) + 2); H[i] = H[i] > d ? H[i] - d : 0; }
      for (int k = N - 1; k >= 2; k--) H[k] = (H[k - 1] + H[k - 2] + H[k - 2]) / 3;
      if (random(255) < 120) { int y = random(7); H[y] = min(255, H[y] + (int)random(160, 255)); }
      for (int i = 0; i < N; i++) {
        uint8_t t = (uint16_t)H[i] * 191 / 255, ramp = (t & 0x3F) << 2;
        if (t & 0x80)      bset(s, i, 255, 255, ramp);
        else if (t & 0x40) bset(s, i, 255, ramp, 0);
        else               bset(s, i, ramp, 0, 0);
      }
      break;
    case 8:     // Gelombang warna
      for (int i = 0; i < N; i++) {
        float v = (sinf(i * 0.45f - st * 0.15f) + 1.0f) / 2.0f; v *= v;
        ledColor(L, st, i, r, g, b);
        bset(s, i, sc(r, v), sc(g, v), sc(b, v));
      }
      break;
    case 9: {   // Kedip bergantian: fase dari jam, jadi strip 1 dan 2 selalu berlawanan kalau kecepatannya sama
      unsigned long phase = now / (ledFrameMs(s) * 6);
      bool on = (phase % 2) == (unsigned long)s;
      if (on) {
        if (L.rgb) {
          uint32_t c = Adafruit_NeoPixel::ColorHSV((uint16_t)(phase * 7000), 255, 255);
          bfill(s, (c >> 16) & 255, (c >> 8) & 255, c & 255);
        } else {
          bfill(s, L.r, L.g, L.b);
        }
      } else {
        bclear(s);
      }
      break;
    }
    default:    // 10 Mati
      bclear(s);
      break;
  }
}

// Gambar satu frame untuk strip s, dengan pembatas arus total kedua strip
void ledFrame(int s, unsigned long now) {
  Adafruit_NeoPixel& strip = *strips[s];
  uint8_t (*B)[3] = ledBuf[s];
  ledRender(s, now);

  uint32_t sum = 0;
  for (int i = 0; i < LED_COUNT; i++) sum += B[i][0] + B[i][1] + B[i][2];
  ledRawMa[s] = sum * led[s].bright / 255 * LED_MA_PER_CH / 255;
  uint32_t total = ledRawMa[0] + ledRawMa[1];
  uint32_t avail = LED_BUDGET_MA - 2 * LED_COUNT * LED_IDLE_MA;
  uint32_t eff = led[s].bright;
  if (total > avail) eff = max((uint32_t)1, eff * avail / total);

  strip.setBrightness(eff);   // dipasang sebelum setPixelColor supaya warna tidak rusak oleh pembulatan
  for (int i = 0; i < LED_COUNT; i++) {
    int k = (s == 1 && STRIP2_REVERSED) ? (LED_COUNT - 1 - i) : i;
    strip.setPixelColor(i, B[k][0], B[k][1], B[k][2]);
  }
  strip.show();
  ledStep[s]++;
}

// Dipanggil terus dari loop() dan dari penantian WiFi; tidak memblokir
void ledTick() {
  if (!ledsOn) return;
  unsigned long now = millis();
  for (int s = 0; s < 2; s++) {
    unsigned long frameMs = ledFrameMs(s);
    if (now - lastLed[s] < frameMs) continue;
    lastLed[s] += frameMs;                            // jaga ritme tetap, supaya 2 strip yang disinkron tetap barengan
    if (now - lastLed[s] >= frameMs) lastLed[s] = now; // ketinggalan jauh (misal habis delay) -> mulai dari sekarang
    ledFrame(s, now);
  }

  // simpan ke memori 1,5 detik setelah pengaturan terakhir berubah (supaya flash tidak ditulis terus saat slider digeser)
  if (ledSaveDirty && now - ledSaveAt > 1500) { saveLed(); ledSaveDirty = false; }
}

// Animasi pembuka: 1 kali sapuan meteor RGB di kedua strip sampai ekornya memudar habis
void bootLedMeteorRgb() {
  const int N = LED_COUNT;
  const int totalSteps = N + 18;
  bclear(0); bclear(1);
  for (int step = 0; step < totalSteps; step++) {
    for (int s = 0; s < 2; s++) {
      bfade(s, 185);
      for (int j = 0; j < 3; j++) {
        int idx = step - j;
        if (idx >= 0 && idx < N) {
          uint32_t c = Adafruit_NeoPixel::ColorHSV((uint16_t)(step * 1400 + idx * (65536 / N)), 255, 255);
          bset(s, idx, (c >> 16) & 255, (c >> 8) & 255, c & 255);
        }
      }
      Adafruit_NeoPixel& strip = *strips[s];
      strip.setBrightness(135);
      for (int i = 0; i < N; i++) {
        int k = (s == 1 && STRIP2_REVERSED) ? (N - 1 - i) : i;
        strip.setPixelColor(i, ledBuf[s][k][0], ledBuf[s][k][1], ledBuf[s][k][2]);
      }
      strip.show();
    }
    delay(24);
  }
  // Bersihkan LED sebelum gerakan jari & masuk ke setelan tersimpan
  bclear(0); bclear(1);
  for (int s = 0; s < 2; s++) { strips[s]->clear(); strips[s]->show(); }
}

// Perintah L dari web. target: 0 = kedua strip (dibuat sama + sinkron), 1 = strip 1, 2 = strip 2
void ledSet(int target, int m, int r, int g, int b, int br, int sp, int rgb) {
  LedCfg c = {constrain(m, 0, LED_MODES - 1), constrain(r, 0, 255), constrain(g, 0, 255), constrain(b, 0, 255),
              constrain(br, 1, (int)LED_MAX_BRIGHTNESS), constrain(sp, 1, 100), rgb ? 1 : 0};
  int s0 = target == 2 ? 1 : 0, s1 = target == 1 ? 0 : 1;
  bool modeChanged = false;
  for (int s = s0; s <= s1; s++) {
    if (led[s].mode != c.mode) {
      modeChanged = true;
      bclear(s); memset(heat[s], 0, sizeof(heat[s])); ledStep[s] = 0;
    }
    led[s] = c;
  }
  if (target == 0) {   // kedua strip: samakan langkah animasi supaya geraknya barengan
    if (modeChanged) { ledStep[0] = 0; bclear(0); }
    ledStep[1] = ledStep[0]; lastLed[1] = lastLed[0];
    memcpy(ledBuf[1], ledBuf[0], sizeof(ledBuf[0]));
  }
  ledSaveDirty = true; ledSaveAt = millis();
}

// ---------------- Servo MG996R (180°) untuk 4 jari ----------------
// Servo posisi: tiap servo punya sudut BUKA dan sudut TUTUP (boleh dibalik, misal buka 170, tutup 20).
// Target 0-100 dari web = posisi di antara buka dan tutup (mode biner: cuma 0 atau 100).
// Gerak dihaluskan dengan batas kecepatan (derajat per detik) supaya halus dan arus tidak melonjak.
//
// Jempol = index 0 = servo kontinu 360°. Pulsa 1500 us (neutral) = berhenti, lebih/kurang = berputar.
// Posisi jempol (0-100) diperkirakan dari lama waktu putar.
ServoCfg cfg[5];                    // index 0 (jempol) tidak dipakai
ThumbCfg thumb;
float thumbPos = 0;                 // perkiraan posisi jempol 0 (buka) - 100 (tutup)
int thumbHoldUs = 1500;             // pulsa manual saat kalibrasi
unsigned long thumbHoldAt = 0;      // kapan terakhir menerima perintah pulsa manual
unsigned long thumbMovedAt = 0;
bool thumbPosUnsaved = false;
float cur[5];                       // sudut sekarang (derajat); index 0 = posisi jempol (%)
float goalA[5];                     // sudut tujuan
float target[5] = {0, 0, 0, 0, 0};  // target 0-100 dari hand tracking
bool hold[5] = {false, false, false, false, false};  // true = tahan sudut preview (kalibrasi) sampai ada target baru
int lastUs[5] = {-1, -1, -1, -1, -1};
float speedDps = 120.0f;            // derajat per detik (4 jari), >= 360 berarti tanpa batas
unsigned long lastMotor = 0, lastPosSent = 0;
bool posDirty = false;

// Kabel USB (Serial): perintah sama dengan WiFi, satu baris per perintah.
// ESP32 hanya kirim JSON balik lewat kabel kalau baru menerima perintah dari kabel (<3 detik).
unsigned long lastSerialRx = 0;
char serialLine[64];
int serialLen = 0;
bool serialActive() { return lastSerialRx != 0 && millis() - lastSerialRx < 3000; }
void emit(String& j) {
  if (ws.isConnected()) ws.sendTXT(j);
  if (serialActive()) Serial.println(j);
}

float angleFor(int i, float pct) { return cfg[i].open + (cfg[i].close - cfg[i].open) * pct / 100.0f; }

void loadConfig() {
  for (int i = 0; i < 5; i++) {
    String n = String(i);
    cfg[i].open  = prefs.getFloat(("a" + n).c_str(), 0.0f);
    cfg[i].close = prefs.getFloat(("b" + n).c_str(), 180.0f);
  }
  speedDps = prefs.getFloat("spd", 120.0f);
  thumb.neutral = prefs.getInt("tn", 1500);
  thumb.power   = prefs.getInt("tp", 250);
  thumb.dir     = prefs.getInt("td", 1) < 0 ? -1 : 1;
  thumb.closeMs = prefs.getInt("tc", 800);
  thumb.openMs  = prefs.getInt("to", 800);
  thumbPos      = constrain(prefs.getFloat("tpos", 0.0f), 0.0f, 100.0f);
}

void saveThumb() {
  prefs.putInt("tn", thumb.neutral);
  prefs.putInt("tp", thumb.power);
  prefs.putInt("td", thumb.dir);
  prefs.putInt("tc", thumb.closeMs);
  prefs.putInt("to", thumb.openMs);
}

void saveConfig(int i) {
  String n = String(i);
  prefs.putFloat(("a" + n).c_str(), cfg[i].open);
  prefs.putFloat(("b" + n).c_str(), cfg[i].close);
}

void sendCfg() {
  String j = "{\"type\":\"cfg\",\"speed\":" + String(speedDps, 0) + ",\"servos\":[";
  for (int i = 0; i < 5; i++) {
    j += "{\"open\":" + String(cfg[i].open, 1) + ",\"close\":" + String(cfg[i].close, 1) + "}";
    if (i < 4) j += ",";
  }
  j += "],\"thumb\":{\"neutral\":" + String(thumb.neutral) + ",\"power\":" + String(thumb.power) +
       ",\"dir\":" + String(thumb.dir) + ",\"closeMs\":" + String(thumb.closeMs) +
       ",\"openMs\":" + String(thumb.openMs) + "},\"led\":[";
  for (int s = 0; s < 2; s++) {
    j += "{\"mode\":" + String(led[s].mode) + ",\"r\":" + String(led[s].r) + ",\"g\":" + String(led[s].g) +
         ",\"b\":" + String(led[s].b) + ",\"bright\":" + String(led[s].bright) + ",\"speed\":" + String(led[s].speed) +
         ",\"rgb\":" + (led[s].rgb ? "true" : "false") + "}";
    if (s == 0) j += ",";
  }
  j += "]}";
  emit(j);
}

void sendPos() {
  String j = "{\"type\":\"pos\",\"p\":[";
  for (int i = 0; i < 5; i++) { j += String(cur[i], 1); if (i < 4) j += ","; }
  j += "]}";
  emit(j);
}

// Perintah:
//  "A,i,buka,tutup" simpan sudut buka dan tutup servo i (1-4) | "W,i,sudut" gerakkan ke sudut (kalibrasi, belum disimpan)
//  "V,speed" kecepatan 4 jari (derajat/detik, 360 = maks) | "G" kirim config | "p,p,p,p,p" target 0-100
//  Jempol (servo kontinu):
//  "C,neutral,power,dir,closeMs,openMs" simpan kalibrasi jempol | "U,us" kirim pulsa manual (kalibrasi, harus diulang
//  tiap <1 detik, kalau tidak jempol berhenti sendiri) | "Z,pos" tetapkan posisi jempol sekarang (0 = terbuka, 100 = tertutup)
//  LED strip: "L,strip,animasi,r,g,b,kecerahan,kecepatan" strip 0 = keduanya (sama + sinkron), 1 = strip 1, 2 = strip 2
//             animasi 0-10 (10 = mati), r/g/b 0-255, kecerahan 1-255, kecepatan 1-100
//             (format lama tanpa "strip" tetap diterima dan berlaku untuk kedua strip)
void handleCommand(const char* s) {
  int i = 0;
  float a = 0, b = 0;
  if (s[0] == 'A' && sscanf(s, "A,%d,%f,%f", &i, &a, &b) == 3 && i >= 1 && i < 5) {
    cfg[i].open  = constrain(a, 0.0f, 180.0f);
    cfg[i].close = constrain(b, 0.0f, 180.0f);
    saveConfig(i);
    if (!hold[i]) goalA[i] = angleFor(i, target[i]);
    sendCfg();
  } else if (s[0] == 'W' && sscanf(s, "W,%d,%f", &i, &a) == 2 && i >= 1 && i < 5) {
    goalA[i] = constrain(a, 0.0f, 180.0f);
    hold[i] = true;
  } else if (s[0] == 'V' && sscanf(s, "V,%f", &a) == 1) {
    speedDps = constrain(a, 10.0f, 360.0f);
    prefs.putFloat("spd", speedDps);
    sendCfg();
  } else if (s[0] == 'C') {
    int n, p, d, cm, om;
    if (sscanf(s, "C,%d,%d,%d,%d,%d", &n, &p, &d, &cm, &om) == 5) {
      thumb.neutral = constrain(n, 1000, 2000);
      thumb.power   = constrain(p, 50, 500);
      thumb.dir     = d < 0 ? -1 : 1;
      thumb.closeMs = constrain(cm, 100, 20000);
      thumb.openMs  = constrain(om, 100, 20000);
      saveThumb();
      sendCfg();
    }
  } else if (s[0] == 'U') {
    int us;
    if (sscanf(s, "U,%d", &us) == 1) {
      thumbHoldUs = constrain(us, 1000, 2000);
      thumbHoldAt = millis();
      hold[0] = true;
    }
  } else if (s[0] == 'L') {
    int v[8];
    int n = sscanf(s, "L,%d,%d,%d,%d,%d,%d,%d,%d", &v[0], &v[1], &v[2], &v[3], &v[4], &v[5], &v[6], &v[7]);
    if (n >= 7 && v[0] >= 0 && v[0] <= 2) ledSet(v[0], v[1], v[2], v[3], v[4], v[5], v[6], n == 8 ? (v[7] ? 1 : 0) : 0);
    else if (n == 6) ledSet(0, v[0], v[1], v[2], v[3], v[4], v[5], 0);                       // format lama: kedua strip
  } else if (s[0] == 'Z') {
    if (sscanf(s, "Z,%f", &a) == 1) {
      thumbPos = constrain(a, 0.0f, 100.0f);
      cur[0] = thumbPos;
      prefs.putFloat("tpos", thumbPos);
      thumbPosUnsaved = false;
      posDirty = true;
    }
  } else if (strcmp(s, "G") == 0) {
    sendCfg(); posDirty = true;
  } else {
    int t[5];
    if (sscanf(s, "%d,%d,%d,%d,%d", &t[0], &t[1], &t[2], &t[3], &t[4]) == 5) {
      for (int k = 0; k < 5; k++) {
        target[k] = constrain(t[k], 0, 100);
        hold[k] = false;
        goalA[k] = angleFor(k, target[k]);
      }
    }
  }
}

// Jempol: hitung posisi dari waktu putar, kembalikan pulsa (us) yang harus dikirim ke servo
int thumbUpdate(float dt, unsigned long now) {
  if (hold[0]) {
    // Pengaman: kalau browser berhenti mengirim pulsa manual, jempol berhenti sendiri
    return (now - thumbHoldAt > 1000) ? thumb.neutral : thumbHoldUs;
  }
  float tp = target[0];
  float d = tp - thumbPos;
  bool atEnd = (tp <= 0.0f || tp >= 100.0f);
  if (!atEnd && fabsf(d) < 3.0f) return thumb.neutral;   // zona mati supaya tidak bergetar saat mode non-biner
  if (fabsf(d) < 0.01f) return thumb.neutral;

  bool closing = d > 0;
  float rate = 100000.0f / (float)(closing ? thumb.closeMs : thumb.openMs);   // persen per detik
  float step = rate * dt;
  if (fabsf(d) <= step) thumbPos = tp;
  else thumbPos += closing ? step : -step;
  thumbPos = constrain(thumbPos, 0.0f, 100.0f);
  cur[0] = thumbPos;
  thumbMovedAt = now;
  thumbPosUnsaved = true;
  return thumb.neutral + (closing ? thumb.dir : -thumb.dir) * thumb.power;
}

void motorUpdate() {
  unsigned long now = millis();
  float dt = (now - lastMotor) / 1000.0f;
  lastMotor = now;
  if (dt > 0.1f) dt = 0.1f;
  float maxStep = speedDps * dt;
  bool instant = speedDps >= 360.0f;

  // Jempol (servo kontinu)
  float posBefore = cur[0];
  int tus = thumbUpdate(dt, now);
  if (tus != lastUs[0]) { servos[0].writeMicroseconds(tus); lastUs[0] = tus; }
  if (fabsf(cur[0] - posBefore) > 0.0001f) posDirty = true;
  // Simpan posisi jempol ke memori setelah berhenti bergerak 1,5 detik (supaya tetap benar setelah ESP32 mati)
  if (thumbPosUnsaved && lastUs[0] == thumb.neutral && now - thumbMovedAt > 1500) {
    prefs.putFloat("tpos", thumbPos);
    thumbPosUnsaved = false;
  }

  // 4 jari (servo 180°)
  for (int i = 1; i < 5; i++) {
    float d = goalA[i] - cur[i];
    if (instant || fabsf(d) <= maxStep) cur[i] = goalA[i];
    else cur[i] += d > 0 ? maxStep : -maxStep;
    int us = 500 + (int)(cur[i] / 180.0f * 2000.0f + 0.5f);
    if (us != lastUs[i]) { servos[i].writeMicroseconds(us); lastUs[i] = us; posDirty = true; }
  }

  if (posDirty && (ws.isConnected() || serialActive()) && now - lastPosSent > 250) {
    sendPos(); posDirty = false; lastPosSent = now;
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLen > 0) {
        serialLine[serialLen] = 0;
        lastSerialRx = millis();
        handleCommand(serialLine);
        serialLen = 0;
      }
    } else if (serialLen < (int)sizeof(serialLine) - 1) {
      serialLine[serialLen++] = c;
    } else {
      serialLen = 0;
    }
  }
}

void onEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("WebSocket tersambung");
      sendCfg(); posDirty = true;
      break;
    case WStype_DISCONNECTED:
      Serial.println("WebSocket putus, mencoba lagi...");
      break;
    case WStype_TEXT:
      handleCommand((char*)payload);
      break;
    default: break;
  }
}

// Gerakan pembuka jari: gelombang pelan, halus, dan smooth (kurva cosine 100 Hz) dari telunjuk ke kelingking,
// lalu berakhir di posisi terbuka penuh. Maks tekukan 60% bergantian agar lembut, ringan arusnya & anti-brownout.
void bootHandWave() {
  const unsigned long waveDurMs = 2200;   // ~1,1 dtk menekuk pelan + ~1,1 dtk membuka pelan
  const unsigned long staggerMs = 420;    // jeda fase antar jari agar mengalir lembut
  const unsigned long totalMs   = waveDurMs + 3 * staggerMs + 260;
  const float maxCurlPct = 60.0f;         // terlihat jelas tapi lembut & aman tidak mentok/stall

  // Pastikan jempol (jika sempat tersimpan dalam posisi tertutup) ikut membuka halus ke 0%
  target[0] = 0.0f;
  hold[0] = false;
  lastMotor = millis();

  unsigned long t0 = millis();
  while (true) {
    unsigned long now = millis();
    unsigned long el = now - t0;
    float dt = (now - lastMotor) / 1000.0f;
    lastMotor = now;
    if (dt > 0.05f) dt = 0.05f;

    // Jempol pelan kembali ke posisi terbuka (0%) bila belum terbuka
    int tus = thumbUpdate(dt, now);
    if (tus != lastUs[0]) { servos[0].writeMicroseconds(tus); lastUs[0] = tus; }

    // 4 jari 180° bergerak bergelombang sangat halus (kurva 0.5*(1 - cos(2*pi*u)), 100 Hz)
    for (int i = 1; i < 5; i++) {
      unsigned long startAt = (unsigned long)(i - 1) * staggerMs;
      float pct = 0.0f;
      if (el > startAt && el < startAt + waveDurMs) {
        float u = (float)(el - startAt) / (float)waveDurMs;
        pct = maxCurlPct * 0.5f * (1.0f - cosf(6.2831853f * u));
      }
      float deg = angleFor(i, pct);
      cur[i] = goalA[i] = deg;
      int us = 500 + (int)(deg / 180.0f * 2000.0f + 0.5f);
      if (us != lastUs[i]) { servos[i].writeMicroseconds(us); lastUs[i] = us; }
    }

    if (el >= totalMs && lastUs[0] == thumb.neutral) break;
    if (el >= totalMs + 3000) break;  // batas pengaman agar boot tidak pernah macet
    delay(10);  // 100 Hz: langkah mikrodetik super halus tanpa tersentak
  }

  // Pastikan semua 5 jari berakhir di posisi terbuka penuh
  servos[0].writeMicroseconds(thumb.neutral);
  lastUs[0] = thumb.neutral;
  for (int i = 0; i < 5; i++) {
    target[i] = 0.0f;
    hold[i] = false;
    if (i >= 1) {
      cur[i] = goalA[i] = cfg[i].open;
      int us = 500 + (int)(cur[i] / 180.0f * 2000.0f + 0.5f);
      servos[i].writeMicroseconds(us);
      lastUs[i] = us;
    }
  }
  lastMotor = millis();
}

// Pastikan tangan kembali ke posisi terbuka penuh DULU (sebelum buzzer berbunyi),
// antisipasi jika sebelumnya ESP32 dimatikan saat jari/jempol masih dalam keadaan menutup.
void bootOpenFirst() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // Pasang jempol (360° kontinu) dan mulai kembalikan ke 0% bila sebelumnya belum terbuka
  servos[0].setPeriodHertz(50);
  servos[0].attach(SERVO_PINS[0], 500, 2500);
  servos[0].writeMicroseconds(thumb.neutral);
  lastUs[0] = thumb.neutral;
  cur[0] = thumbPos;
  target[0] = 0.0f;
  hold[0] = false;

  // Pasang 4 servo jari satu per satu langsung ke sudut buka (cfg[i].open) agar pelan & tanpa lonjakan arus
  for (int i = 1; i < 5; i++) {
    servos[i].setPeriodHertz(50);
    cur[i] = goalA[i] = cfg[i].open;
    target[i] = 0.0f;
    hold[i] = false;
    int openUs = 500 + (int)(cfg[i].open / 180.0f * 2000.0f + 0.5f);
    servos[i].writeMicroseconds(openUs);
    servos[i].attach(SERVO_PINS[i], 500, 2500);
    servos[i].writeMicroseconds(openUs);
    lastUs[i] = openUs;
    delay(80);
  }

  // Tunggu sampai 4 jari benar-benar sempat terbuka (~500 ms) & jempol kembali ke 0% bila sempat tertutup
  unsigned long t0 = millis();
  lastMotor = t0;
  while (true) {
    unsigned long now = millis();
    float dt = (now - lastMotor) / 1000.0f;
    lastMotor = now;
    if (dt > 0.05f) dt = 0.05f;

    int tus = thumbUpdate(dt, now);
    if (tus != lastUs[0]) { servos[0].writeMicroseconds(tus); lastUs[0] = tus; }

    bool fingersSettled = (now - t0) >= 500;
    bool thumbDone = (lastUs[0] == thumb.neutral && thumbPos <= 0.5f);
    if (fingersSettled && thumbDone) break;
    if (now - t0 >= 4000) break;  // batas pengaman
    delay(15);
  }
  servos[0].writeMicroseconds(thumb.neutral);
  lastUs[0] = thumb.neutral;
  if (thumbPosUnsaved) {
    prefs.putFloat("tpos", thumbPos);
    thumbPosUnsaved = false;
  }
  delay(150);
}

void setup() {
  Serial.begin(115200);
  pinMode(RESET_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  prefs.begin("hand", false);
  loadLed();
  ledsBegin();
  loadConfig();
  WiFi.persistent(false);

  cSsid = prefs.getString("ssid", "");
  cPass = prefs.getString("pass", "");
  cServer = prefs.getString("server", DEFAULT_SERVER);
  if (cServer.length() == 0) cServer = DEFAULT_SERVER;

  // Urutan boot:
  // 1) Kembalikan tangan ke posisi terbuka penuh DULU (bila sempat mati dalam keadaan menutup)
  bootOpenFirst();

  // 2) Baru bunyi buzzer -> jeda singkat
  bootJingle();
  delay(280);

  // 3) Animasi LED meteor RGB sekali jalan di kedua strip
  bootLedMeteorRgb();
  delay(150);

  // 4) Gerakan gelombang jari pelan & smooth, berakhir di posisi terbuka penuh
  bootHandWave();

  // 5) LED masuk ke setelan yang tersimpan di ESP32
  bclear(0); bclear(1);
  ledStep[0] = ledStep[1] = 0;
  lastLed[0] = lastLed[1] = 0;
  ledsOn = true;
  ledTick();
  motorUpdate();

  if (cSsid.length() > 0 && connectSta()) {
    Serial.print("IP ESP32: "); Serial.println(WiFi.localIP());
    if (MDNS.begin(HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.println("Setup bisa dibuka di http://handrobot.local");
    }
    startWeb();
    if (cServer.length() > 0) {
      parseServer(cServer);
      ws.begin(wsHost, wsPort, "/esp");
      ws.onEvent(onEvent);
      ws.setReconnectInterval(2000);
      ws.enableHeartbeat(15000, 3000, 2);
    }
  } else {
    startPortal();
  }
}

void loop() {
  web.handleClient();
  readSerial();
  motorUpdate();
  ledTick();
  if (portalMode) dns.processNextRequest();
  else ws.loop();

  if (restartAt && millis() > restartAt) ESP.restart();

  // Tahan BOOT 3 detik = hapus pengaturan WiFi
  if (digitalRead(RESET_PIN) == LOW) {
    if (!resetHeldSince) resetHeldSince = millis();
    else if (millis() - resetHeldSince > 3000) {
      prefs.clear();
      Serial.println("Pengaturan dihapus, restart...");
      delay(300);
      ESP.restart();
    }
  } else {
    resetHeldSince = 0;
  }
}
