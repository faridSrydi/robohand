const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const auth = require('./lib/auth');

// Muat file .env sederhana tanpa perlu paket tambahan (untuk GEMINI_API_KEY, dll.)
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
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
  } catch { }
}
loadEnvFile();

// Mode kabel butuh paket "serialport". Kalau belum terpasang, mode WiFi tetap jalan.
let SerialPort = null;
try { ({ SerialPort } = require('serialport')); }
catch { console.log('[!] Paket serialport belum terpasang -> mode kabel nonaktif. Jalankan: npm install'); }

// Suara pria Indonesia natural (id-ID-ArdiNeural) via msedge-tts (opsional, otomatis fallback ke browser jika tidak ada)
let MsEdgeTTS = null, EDGE_FMT = null;
try { ({ MsEdgeTTS, OUTPUT_FORMAT: EDGE_FMT } = require('msedge-tts')); }
catch { console.log('[!] Paket msedge-tts belum terpasang -> TTS pakai suara browser.'); }

const PORT = process.env.PORT || 3000;
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
].filter((v, i, a) => v && a.indexOf(v) === i);

const JARVIS_SYSTEM_PROMPT = `You are Robohand, a calm, intelligent, formal British-style AI assistant inspired by J.A.R.V.I.S. dedicated STRICTLY to Farid Suryadi's ESP32 5-finger robotic hand project.
NEVER call the user "Sir", "Ma'am", or "Boss". Always reply in natural, concise, polite English (1 short sentence for actions, maximum 2 crisp sentences for questions, under 26 words) so TTS playback is fast and smooth. Never use emojis, markdown, asterisks, or bullet lists in "reply". You may understand English or Indonesian, but always reply in English.

STRICT SCOPE RULE:
- ONLY answer topics directly related to this Robohand robotic hand project: greetings, hand/finger movements, gestures, LED strip controls, control page UI actions (camera, control panel, LED overlay, dark/light theme, tracking/manual mode, WiFi/USB mode, servo calibration panel), hardware components, GPIO pins, power/battery protection, calibration, WiFi/USB connection, MediaPipe hand tracking, 3D simulation, and its creator Farid Suryadi.
- INTENT ACCURACY: Answer exactly what the user asked in their latest message. Use "STT alternates" when the primary transcript is nonsense or off-topic but an alternate is a clear Robohand command. Never answer a different question than the one asked. If the transcript is too garbled to understand, reply "Sorry, could you repeat that?" with all actions null.
- LED STUDIO CONTEXT: When state shows ledOverlay:open, prioritize LED controls (mode 0 Meteor, 1 Solid, 2 Breath, 3 Rainbow, 4 Chase, 5 Scanner, 6 Twinkle, 7 Fire, 8 Wave, 9 Alternate, 10 Off; color; brightness; speed; strip 1/2/both; closing LED overlay). Treat phonetic mishearings like "metal"/"meter"/"media" as LED mode 0 (Meteor) while ledOverlay:open, and do NOT set "pose" unless the user explicitly asks to move fingers/hand.
- STT PHONETIC TOLERANCE: Input comes from noisy speech-to-text by an Indonesian speaker (English or Indonesian). Always infer obvious phonetic STT mishearings of Robohand commands BEFORE refusing (e.g. "spaniel"/"close funnel"/"clothes panel" = "close panel", "duck mode" = "dark mode", "like mode" = "light mode", "open lead/lady" = "open LED", "clothes camera" = "close camera").
- If the user clearly asks about something UNRELATED to this robotic hand project (weather, news, recipes, movies, politics, homework, general trivia), politely refuse in one concise sentence and state that you only handle the Robohand project. Set "pose": null, "led": null, and "ui": null when refusing.
- Never invent hardware specs outside the project facts below.

ROBOHAND PROJECT KNOWLEDGE:
- Creator / maker: Farid Suryadi.
- Hardware: ESP32 DevKit V1 (WiFi WebSocket, USB Serial 115200 bps, captive portal HandRobot-Setup / handrobot.local); 4 MG996R 180-degree servos for index GPIO 14, middle GPIO 26, ring GPIO 27, pinky GPIO 25; 1 continuous 360-degree servo for the thumb on GPIO 13; 1 extra 180-degree servo for the engine bay backdoor/trunk hatch on GPIO 32 (independent angle and speed settings); 2 WS2812B LED strips with 34 LEDs each (68 total) on GPIO 22 and 23 (11 animations, RGB mode, 3A automatic current limit); buzzer on GPIO 18; dual 18650 batteries in 2S 7.4V with a 2S 20A BMS; USB-C 5V 2A charger; XL4015 6V buck converter for servos and LEDs; Mini360 5V buck converter dedicated to the ESP32; 10A fuse, capacitor, and power switch; wooden frame with tendon-driven three-segment fingers.
- Software: real-time browser webcam hand tracking via MediaPipe Hands (21 landmarks), Node.js WebSocket bridge server, interactive 3D web simulation, calibration stored on ESP32 flash, and AI voice control.

DEVICE & UI CONTROLS (CRITICAL: NEVER set any action the user did NOT explicitly ask for in their latest message):
- "pose": array of 5 integers 0..100 [thumb,index,middle,ring,pinky] (0=open, 100=closed), or null if the user did not ask to move fingers/hand. Reference: fist/0=[100,100,100,100,100], 1=[100,0,100,100,100], 2=[100,0,0,100,100], 3=[100,0,0,0,100], 4=[100,0,0,0,0], 5/open=[0,0,0,0,0], peace=[100,0,0,100,100], middle finger/fuck=[100,100,0,100,100], rock/metal/teknik/technique/engineering salute=[0,0,100,100,0].
- "led": {strip(0=both,1=strip1,2=strip2),mode(0-10,10=off),r,g,b,bright(1-255),speed(1-100),rgb} or null. Exact modes: 0 Meteor, 1 Solid, 2 Breath, 3 Rainbow, 4 Chase, 5 Scanner, 6 Twinkle/Sparkle, 7 Fire, 8 Wave, 9 Alternate/Blink, 10 Off.
- "ui": optional UI action object (null if not explicitly requested):
  * "camera": "open" or "close" (ONLY when user explicitly says camera/webcam)
  * "panel": "open" or "close" (ONLY when user explicitly says control panel/sidebar)
  * "ledPanel": "open" or "close" (ONLY when user asks to open/close LED control/panel/overlay/studio)
  * "ledStrip": 0 (both strips), 1 (strip 1), or 2 (strip 2) (ONLY when user asks to select/switch LED strip 1, strip 2, or both strips)
  * "mode": "track" or "manual" (ONLY when user asks to switch tracking/manual mode)
  * "connection": "wifi" or "serial" (ONLY when user asks to switch WiFi/USB)
  * "servoCal": "open" or "close" (ONLY when user asks to open/close servo calibration)
  * "theme": "dark" or "light" (ONLY when user asks for dark mode, light mode, dark/light theme, mode gelap/terang)
  * "fingerSpeed": integer 30..360 (ONLY when user asks to adjust finger/servo speed)
  * "smooth": integer 5..100 (ONLY when user asks to adjust smoothing)
  * "binary": boolean (ONLY when user asks to toggle binary/analog mode)
  * "demo": "start" or "stop" (ONLY when user asks to start/stop auto demo mode)
  * "relax": boolean (true to relax/release/detach servos, false to wake/enable servos)
  * "countTo": integer 2..5 (ONLY when user asks to count sequentially e.g. "count 1 to 3", "count to 5", "hitung 1 sampai 5")
  * "backdoor": "open" or "close" (ONLY when user asks to open or close the backdoor, bagasi, hatch, trunk, or rear cover)
- "sleep": true ONLY if the user tells you to standby, sleep, or rest.
- "label": 2-3 short English words for the status badge (use "Out of scope" when refusing off-topic questions).
Return ONLY valid JSON.`;

const JARVIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    label: { type: 'STRING' },
    sleep: { type: 'BOOLEAN' },
    pose: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'INTEGER' },
    },
    led: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        strip: { type: 'INTEGER', nullable: true },
        mode: { type: 'INTEGER', nullable: true },
        r: { type: 'INTEGER', nullable: true },
        g: { type: 'INTEGER', nullable: true },
        b: { type: 'INTEGER', nullable: true },
        bright: { type: 'INTEGER', nullable: true },
        speed: { type: 'INTEGER', nullable: true },
        rgb: { type: 'BOOLEAN', nullable: true },
      },
    },
    ui: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        camera: { type: 'STRING', nullable: true },
        panel: { type: 'STRING', nullable: true },
        ledPanel: { type: 'STRING', nullable: true },
        ledStrip: { type: 'INTEGER', nullable: true },
        mode: { type: 'STRING', nullable: true },
        connection: { type: 'STRING', nullable: true },
        servoCal: { type: 'STRING', nullable: true },
        theme: { type: 'STRING', nullable: true },
        fingerSpeed: { type: 'INTEGER', nullable: true },
        smooth: { type: 'INTEGER', nullable: true },
        binary: { type: 'BOOLEAN', nullable: true },
        demo: { type: 'STRING', nullable: true },
        relax: { type: 'BOOLEAN', nullable: true },
        countTo: { type: 'INTEGER', nullable: true },
        backdoor: { type: 'STRING', nullable: true },
      },
    },
  },
  required: ['reply'],
};

// Hedged request: kirim ke model utama dulu; kalau belum menjawab dalam HEDGE_MS atau gagal (429/503),
// langsung kirim ke model cadangan. Latensi tetap rendah tanpa menggandakan pemakaian kuota tiap request.
const HEDGE_MS = 1100;
const AI_TIMEOUT_MS = 4500;

function runHedged(models, callModel, controllers, externalSignal) {
  return new Promise((resolve, reject) => {
    let next = 0;
    let inFlight = 0;
    let done = false;
    const errors = [];
    let hedgeTimer = null;
    let globalTimer = null;

    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      clearTimeout(globalTimer);
      fn(val);
    };
    const abortAll = (except = -1) => controllers.forEach((c, j) => { if (j !== except) { try { c.abort(); } catch { } } });

    const launch = () => {
      if (done || next >= models.length) return false;
      const i = next++;
      inFlight += 1;
      callModel(models[i], i)
        .then((r) => {
          if (done) return;
          abortAll(i);
          finish(resolve, r);
        })
        .catch((e) => {
          inFlight -= 1;
          errors.push(`${models[i]}: ${e?.message || e}`);
          if (done) return;
          if (!launch() && inFlight === 0) finish(reject, new Error(errors.join(' | ')));
        });
      return true;
    };

    if (externalSignal) {
      if (externalSignal.aborted) return finish(reject, new Error('client_aborted'));
      externalSignal.addEventListener('abort', () => { abortAll(); finish(reject, new Error('client_aborted')); }, { once: true });
    }
    globalTimer = setTimeout(() => { abortAll(); finish(reject, new Error('timeout')); }, AI_TIMEOUT_MS);
    launch();
    hedgeTimer = setTimeout(() => launch(), HEDGE_MS);
  });
}

async function askGeminiJarvis({ text, alts = [], history = [], state = null, lang = 'en', signal = null }) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const contents = [];
  for (const h of Array.isArray(history) ? history.slice(-4) : []) {
    if (!h || !h.text) continue;
    contents.push({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(h.text).slice(0, 220) }],
    });
  }
  const stateNote = state
    ? `[pose:${JSON.stringify(state.pose || [])} led:${JSON.stringify(state.led || {})} cam:${state.camera || 'off'} panel:${state.panelOpen ? 'open' : 'closed'} ledOverlay:${state.ledStudioOpen ? 'open' : 'closed'} backdoor:${state.backdoorOpen ? 'open' : 'closed'} theme:${state.theme || 'dark'} mode:${state.mode || 'track'}]\n`
    : '';
  const extraAlts = Array.isArray(alts) && alts.length > 1 ? ` (STT alternates: ${alts.slice(1, 4).join(' | ')})` : '';
  const langNote = lang === 'id' ? '[speaker language: Indonesian (STT id-ID)] ' : '[speaker language: English with Indonesian accent (STT en-US)] ';
  contents.push({
    role: 'user',
    parts: [{ text: `${stateNote}${langNote}User said: "${String(text).slice(0, 320)}"${extraAlts}` }],
  });

  const raceModels = GEMINI_MODELS.slice();
  const controllers = raceModels.map(() => new AbortController());

  const callModel = async (model, idx) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controllers[idx].signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: JARVIS_SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 320,
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          responseMimeType: 'application/json',
          responseSchema: JARVIS_SCHEMA,
        },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${body.slice(0, 120)}`);
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('empty_response');

    const parsed = JSON.parse(raw);
    const cleanPose =
      Array.isArray(parsed.pose) && parsed.pose.length === 5
        ? parsed.pose.map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))))
        : null;

    let cleanLed = null;
    if (parsed.led && typeof parsed.led === 'object') {
      const l = {};
      if (parsed.led.strip === 0 || parsed.led.strip === 1 || parsed.led.strip === 2) l.strip = parsed.led.strip;
      if (typeof parsed.led.mode === 'number') l.mode = Math.max(0, Math.min(10, Math.round(parsed.led.mode)));
      if (typeof parsed.led.r === 'number') l.r = Math.max(0, Math.min(255, Math.round(parsed.led.r)));
      if (typeof parsed.led.g === 'number') l.g = Math.max(0, Math.min(255, Math.round(parsed.led.g)));
      if (typeof parsed.led.b === 'number') l.b = Math.max(0, Math.min(255, Math.round(parsed.led.b)));
      if (typeof parsed.led.bright === 'number') l.bright = Math.max(1, Math.min(255, Math.round(parsed.led.bright)));
      if (typeof parsed.led.speed === 'number') l.speed = Math.max(1, Math.min(100, Math.round(parsed.led.speed)));
      if (typeof parsed.led.rgb === 'boolean') l.rgb = parsed.led.rgb;
      if (Object.keys(l).length > 0) cleanLed = l;
    }

    let cleanUi = null;
    if (parsed.ui && typeof parsed.ui === 'object') {
      const u = {};
      const q = [text, ...(Array.isArray(alts) ? alts : [])].join(' ').toLowerCase();
      // Pengaman keras: hanya izinkan aksi UI yang benar-benar disebut (termasuk variasi fonetik STT)
      if ((parsed.ui.camera === 'open' || parsed.ui.camera === 'close') && /\b(cam|camera|camara|webcam|video|kamera)\b/i.test(q)) {
        u.camera = parsed.ui.camera;
      }
      if ((parsed.ui.ledPanel === 'open' || parsed.ui.ledPanel === 'close') && /\b(led|l\s*\.?\s*e\s*\.?\s*d|lead|lady|light|lights|lamp|lampu|overlay|studio|preview|3d|close|tutup|exit|back)\b/i.test(q)) {
        u.ledPanel = parsed.ui.ledPanel;
      }
      if ((parsed.ui.ledStrip === 0 || parsed.ui.ledStrip === 1 || parsed.ui.ledStrip === 2) && /\b(strip|street|script|led|lampu|both|all|kedua|pertama|satu|dua|1|2)\b/i.test(q)) {
        u.ledStrip = parsed.ui.ledStrip;
      }
      if ((parsed.ui.panel === 'open' || parsed.ui.panel === 'close') && /\b(panel|pannel|sidebar|spaniel|funnel|fennel|channel)\b/i.test(q) && !u.ledPanel) {
        u.panel = parsed.ui.panel;
      }
      if ((parsed.ui.mode === 'track' || parsed.ui.mode === 'manual') && /\b(track|tracking|manual)\b/i.test(q)) {
        u.mode = parsed.ui.mode;
      }
      if ((parsed.ui.connection === 'wifi' || parsed.ui.connection === 'serial') && /\b(wifi|wi-fi|wireless|usb|serial|cable|kabel)\b/i.test(q)) {
        u.connection = parsed.ui.connection;
      }
      if ((parsed.ui.servoCal === 'open' || parsed.ui.servoCal === 'close') && /\b(calibrat|kalibrasi)\b/i.test(q)) {
        u.servoCal = parsed.ui.servoCal;
      }
      if ((parsed.ui.theme === 'dark' || parsed.ui.theme === 'light') && /\b(dark|duck|dog|light\s*(mode|mood|theme)|like\s*mode|theme|tema|gelap|terang|night\s*mode|day\s*mode)\b/i.test(q)) {
        u.theme = parsed.ui.theme;
      }
      if (typeof parsed.ui.fingerSpeed === 'number' && /\b(finger|servo|hand|jari)\b/i.test(q) && /\b(speed|fast|slow|kecepatan|cepat|pelan)\b/i.test(q)) {
        u.fingerSpeed = Math.max(30, Math.min(360, Math.round(parsed.ui.fingerSpeed)));
      }
      if (typeof parsed.ui.smooth === 'number' && /\b(smooth|smoothing)\b/i.test(q)) {
        u.smooth = Math.max(5, Math.min(100, Math.round(parsed.ui.smooth)));
      }
      if (typeof parsed.ui.binary === 'boolean' && /\b(binary|biner|analog|proportional)\b/i.test(q)) {
        u.binary = parsed.ui.binary;
      }
      if ((parsed.ui.demo === 'start' || parsed.ui.demo === 'stop') && /\b(demo|showcase|otomatis|auto)\b/i.test(q)) {
        u.demo = parsed.ui.demo;
      }
      if (typeof parsed.ui.relax === 'boolean' && /\b(relax|release|detach|lepas|kendur|istirahat|wake|aktifkan)\b/i.test(q)) {
        u.relax = parsed.ui.relax;
      }
      if (typeof parsed.ui.countTo === 'number' && /\b(count|hitung|berhitung)\b/i.test(q)) {
        u.countTo = Math.max(2, Math.min(5, Math.round(parsed.ui.countTo)));
      }
      if ((parsed.ui.backdoor === 'open' || parsed.ui.backdoor === 'close') && /\b(back\s*door|bag\s*door|black\s*door|bak\s*door|bek\s*dor|backdoor|bagasi|hatch|trunk|bay|pintu\s*belakang|penutup\s*belakang)\b/i.test(q)) {
        u.backdoor = parsed.ui.backdoor;
      }
      if (Object.keys(u).length > 0) cleanUi = u;
    }

    return {
      ok: true,
      model,
      reply: String(parsed.reply || 'Done.').trim(),
      label: String(parsed.label || '').trim(),
      sleep: Boolean(parsed.sleep),
      pose: cleanPose,
      led: cleanLed,
      ui: cleanUi,
    };
  };

  try {
    return await runHedged(raceModels, callModel, controllers, signal);
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
  }
}

const ttsCache = new Map(); // text -> { buf: Buffer, mime: string }
const TTS_CACHE_MAX = 80;

// en-US-BrianMultilingualNeural: suara pria neural paling natural & halus, fasih menyebut nama Indonesia (Farid Suryadi)
// Tidak mengubah pitch secara buatan agar prosodi neural tetap alami (tidak kaku/robotik)
const TTS_VOICE = 'en-US-BrianMultilingualNeural';
const TTS_OPTS = { rate: '+8%' };

async function createEdgeClient() {
  const client = new MsEdgeTTS();
  await client.setMetadata(TTS_VOICE, EDGE_FMT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  return client;
}

function cacheTts(key, item) {
  if (!key || !item) return;
  if (ttsCache.size >= TTS_CACHE_MAX) {
    ttsCache.delete(ttsCache.keys().next().value);
  }
  ttsCache.set(key, item);
}

function pcm16ToWav(pcmBuf, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuf.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([header, pcmBuf]);
}

async function synthesizeGeminiMaleFallback(key) {
  if (!(process.env.GEMINI_API_KEY || '').trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const apiKey = process.env.GEMINI_API_KEY.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Speak in a calm, formal British male voice like Jarvis: ${key}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        },
      }),
    });
    clearTimeout(timer);
    if (r.ok) {
      const d = await r.json();
      const b64 = d?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) {
        const out = { buf: pcm16ToWav(Buffer.from(b64, 'base64'), 24000), mime: 'audio/wav' };
        cacheTts(key, out);
        return out;
      }
    }
  } catch {
    clearTimeout(timer);
  }
  return null;
}

// Job TTS bersama: sintesis bisa dimulai di server SEBELUM browser memintanya (prefetch setelah AI menjawab),
// lalu request /api/tts berikutnya langsung ikut stream chunk yang sudah ada tanpa menunggu dari nol.
const ttsInflight = new Map(); // text -> { chunks, done, failed, listeners:Set }

function startTtsJob(key) {
  if (!MsEdgeTTS || !EDGE_FMT || !key) return null;
  if (ttsInflight.has(key)) return ttsInflight.get(key);
  const job = { chunks: [], done: false, failed: false, listeners: new Set() };
  ttsInflight.set(key, job);
  const notify = (type, chunk) => job.listeners.forEach((fn) => { try { fn(type, chunk); } catch { } });

  (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let client = null;
      try {
        client = await createEdgeClient();
        const { audioStream } = client.toStream(key, TTS_OPTS);
        for await (const chunk of audioStream) {
          job.chunks.push(chunk);
          notify('data', chunk);
        }
        const full = Buffer.concat(job.chunks);
        if (full.length > 100) cacheTts(key, { buf: full, mime: 'audio/mpeg' });
        job.done = true;
        notify('end');
        return;
      } catch (err) {
        if (job.chunks.length) {
          job.done = true;
          notify('end');
          return;
        }
        if (attempt === 1) console.log('[TTS] Edge gagal, pindah ke fallback:', err?.message || err);
      } finally {
        try { client?.close(); } catch { }
      }
    }
    job.failed = true;
    notify('fail');
  })().finally(() => {
    setTimeout(() => { if (ttsInflight.get(key) === job) ttsInflight.delete(key); }, 50);
  });

  return job;
}

// Streaming langsung MP3 chunk-per-chunk ke browser agar audio mulai berbunyi jauh lebih cepat
async function streamMaleVoice(text, res) {
  const key = text.trim();
  if (!key) return res.status(400).end();

  if (ttsCache.has(key)) {
    const cached = ttsCache.get(key);
    res.setHeader('Content-Type', cached.mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(cached.buf);
  }

  const job = startTtsJob(key);
  if (job) {
    const ok = await new Promise((resolve) => {
      let started = false;
      const begin = () => {
        if (started) return;
        started = true;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
      };
      const listener = (type, chunk) => {
        if (type === 'data') {
          begin();
          if (!res.writableEnded) res.write(chunk);
        } else if (type === 'end') {
          job.listeners.delete(listener);
          begin();
          if (!res.writableEnded) res.end();
          resolve(true);
        } else if (type === 'fail') {
          job.listeners.delete(listener);
          resolve(started);
          if (started && !res.writableEnded) res.end();
        }
      };
      res.on('close', () => { job.listeners.delete(listener); resolve(true); });

      // Kirim chunk yang sudah tersedia lebih dulu, lalu ikuti chunk baru secara live
      if (job.chunks.length) {
        begin();
        for (const c of job.chunks) if (!res.writableEnded) res.write(c);
      }
      if (job.done) {
        begin();
        if (!res.writableEnded) res.end();
        return resolve(true);
      }
      if (job.failed) return resolve(job.chunks.length > 0);
      job.listeners.add(listener);
    });
    if (ok) return;
  }

  const fb = await synthesizeGeminiMaleFallback(key);
  if (fb) {
    res.setHeader('Content-Type', fb.mime);
    return res.send(fb.buf);
  }
  if (!res.headersSent) res.status(503).end();
}

// Pre-cache semua sapaan secara PARALEL saat server menyala (~1.5 detik total, bukan 7.5 detik antre)
// + pre-connect TLS ke Gemini API agar pertanyaan AI pertama juga langsung sat-set!
async function prewarmCommonTts() {
  if ((process.env.GEMINI_API_KEY || '').trim()) {
    fetch('https://generativelanguage.googleapis.com', { method: 'HEAD' }).catch(() => {});
  }
  if (!MsEdgeTTS || !EDGE_FMT) return;
  const phrases = [
    'Hello, I am Robohand. Ready for your command.',
    'Robohand is online and ready.',
    'Hello. How may I assist you?',
    'All systems online. Ready for your command.',
    'Standing by.',
    'Entering standby mode.',
  ];
  await Promise.allSettled(
    phrases.map(async (p) => {
      if (ttsCache.has(p)) return;
      let c = null;
      try {
        c = await createEdgeClient();
        const { audioStream } = c.toStream(p, TTS_OPTS);
        const chunks = [];
        for await (const ch of audioStream) chunks.push(ch);
        const buf = Buffer.concat(chunks);
        if (buf.length > 100) cacheTts(p, { buf, mime: 'audio/mpeg' });
      } catch { }
      finally { try { c?.close(); } catch { } }
    })
  );
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

// ---------- Autentikasi Login Control (MySQL + Cloudflare Turnstile) ----------
app.get('/api/auth/me', (req, res) => {
  const loginEnabled = auth.isLoginEnabled();
  const session = loginEnabled ? auth.getSession(req) : null;
  const ts = auth.getTurnstileConfig();
  const db = auth.getDbStatus();
  res.json({
    loginEnabled,
    authenticated: loginEnabled ? Boolean(session) : true,
    user: session ? { username: session.username, role: session.role } : null,
    turnstileEnabled: loginEnabled && ts.enabled,
    turnstileSiteKey: loginEnabled ? ts.siteKey : '',
    turnstileMode: loginEnabled ? ts.mode : 'disabled',
    dbReady: db.ready,
  });
});

app.post('/api/auth/login', async (req, res) => {
  if (!auth.isLoginEnabled()) {
    return res.json({ ok: true, user: null });
  }
  const ip = auth.getClientIp(req);
  const rate = auth.checkRateLimit(ip);
  if (!rate.allowed) {
    return res.status(429).json({ ok: false, reason: 'rate_limited', retrySec: rate.retrySec });
  }

  const { username, password, turnstileToken } = req.body || {};

  // 1. Verifikasi checkbox Cloudflare Turnstile terlebih dahulu
  const tsCheck = await auth.verifyTurnstile(turnstileToken, ip);
  if (!tsCheck.ok) {
    return res.status(400).json({ ok: false, reason: tsCheck.reason });
  }

  // 2. Verifikasi username & password terhadap MySQL (bcrypt)
  const result = await auth.authenticateUser(username, password);
  if (!result.ok) {
    const code = result.reason === 'db_unavailable' ? 503 : 401;
    return res.status(code).json({ ok: false, reason: result.reason });
  }

  auth.resetRateLimit(ip);
  auth.setSessionCookie(res, req, result.user);
  return res.json({
    ok: true,
    user: { username: result.user.username, role: result.user.role },
  });
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/voice-ai/status', auth.requireAuth, (req, res) => {
  const configured = Boolean((process.env.GEMINI_API_KEY || '').trim());
  res.json({ configured, model: GEMINI_MODELS[0], maleTts: Boolean(MsEdgeTTS) || configured });
});

app.get('/api/tts', auth.requireAuth, async (req, res) => {
  const text = String(req.query?.text || '').trim().slice(0, 480);
  await streamMaleVoice(text, res);
});

app.post('/api/tts', auth.requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 480);
  await streamMaleVoice(text, res);
});

app.post('/api/voice-ai', auth.requireAuth, async (req, res) => {
  const { text, alts, history, state, lang } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ ok: false, reason: 'empty_text' });
  }
  // Batalkan panggilan Gemini bila browser membatalkan request spekulatif (user masih melanjutkan kalimat)
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });

  const t0 = Date.now();
  const result = await askGeminiJarvis({
    text: String(text).trim(),
    alts,
    history,
    state,
    lang: lang === 'id' ? 'id' : 'en',
    signal: ac.signal,
  });
  if (ac.signal.aborted || res.writableEnded) return;

  // Mulai sintesis suara di server SEKARANG agar audio siap begitu browser memanggil /api/tts
  if (result.ok && result.reply) startTtsJob(result.reply);
  if (result.ok) result.ms = Date.now() - t0;
  res.json(result);
});

app.use(express.static(path.join(__dirname, 'public')));
// Rute SPA (/simulasi, /robot-hand) dilayani oleh index.html
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const browsers = new WebSocketServer({ noServer: true }); // halaman web
const boards = new WebSocketServer({ noServer: true });   // ESP32 lewat WiFi

// Browser -> ESP32 (protokol sama untuk WiFi dan kabel)
//  "p,p,p,p,p"       target 5 jari 0-100 (0 = buka, 100 = tutup)
//  "A,i,buka,tutup"   simpan sudut buka dan tutup servo i (1-4, derajat)
//  "W,i,sudut"        gerakkan servo i (1-4) ke sudut (untuk kalibrasi, belum disimpan)
//  "V,speed"          kecepatan gerak 4 servo jari (derajat per detik, 360 = maks)
//  "G"                minta config
//  Jempol (servo kontinu 360°):
//  "C,neutral,power,dir,closeMs,openMs"  simpan kalibrasi jempol (dir = 1 atau -1)
//  "U,us"             pulsa manual jempol untuk kalibrasi (diulang tiap 250 ms oleh halaman web)
//  "Z,pos"            tetapkan posisi jempol sekarang (0 = terbuka, 100 = tertutup)
//  "L,strip,animasi,r,g,b,kecerahan,kecepatan[,rgb]"  pengaturan LED strip
//                     (strip 0 = keduanya, 1 = strip 1 / GPIO 22, 2 = strip 2 / GPIO 23; animasi 0-10, 10 = mati; rgb 0/1)
const TARGET_FORMAT = /^\d{1,3}(,\d{1,3}){4}$/;
const NUM = '\\d+(\\.\\d+)?';
const CMD_FORMAT = new RegExp(
  `^(A,[1-4],${NUM},${NUM}|W,[1-4],${NUM}|V,\\d{2,3}|G|R,[01]|B(,[12])?` +
  `|D,[01]|DA,${NUM},${NUM},${NUM}|DW,${NUM}` +
  `|C,\\d{3,4},\\d{2,3},-?1,\\d{3,5},\\d{3,5}|U,\\d{3,4}|Z,\\d{1,3}(\\.\\d+)?` +
  `|L(,\\d{1,3}){6,8})$`
);

let mode = 'wifi';          // 'wifi' | 'serial'
let lastTarget = '0,0,0,0,0';
let lastCfg = null;
let lastHealth = null;
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
    if (m.type === 'health') lastHealth = msg;
    if (m.type === 'cfg' || m.type === 'pos' || m.type === 'health') toBrowsers(msg);
  } catch { }
}

async function listPorts() {
  if (!SerialPort) return [];
  try {
    return (await SerialPort.list()).map((p) => ({ path: p.path, label: p.path + (p.manufacturer ? ' - ' + p.manufacturer : '') }));
  } catch { return []; }
}

function closePort() {
  clearInterval(keepAlive); keepAlive = null;
  if (port) { const p = port; port = null; if (p.isOpen) p.close(() => { }); }
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
    p.set({ dtr: false, rts: false }, () => { });
    // Keepalive: ESP32 hanya kirim data balik ke kabel kalau dia terima perintah dalam 3 detik terakhir
    keepAlive = setInterval(() => { if (port && port.isOpen) port.write(gotCfg ? 'K\n' : 'G\n'); }, 1000);
    console.log('Kabel USB tersambung:', p0);
    broadcastStatus();
  });
}

async function handleControl(ws, m) {
  if (m.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: m.t }));
  else if (m.type === 'ports') ws.send(JSON.stringify({ type: 'ports', ports: await listPorts() }));
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
  if (pathname === '/browser') {
    if (auth.isLoginEnabled() && !auth.getSession(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    return browsers.handleUpgrade(req, socket, head, (ws) => browsers.emit('connection', ws, req));
  }
  if (pathname === '/esp') {
    return boards.handleUpgrade(req, socket, head, (ws) => boards.emit('connection', ws, req));
  }
  return socket.destroy();
});

browsers.on('connection', (ws) => {
  ws.send(status());
  if (lastCfg) ws.send(lastCfg);
  if (lastHealth) ws.send(lastHealth);
  ws.on('message', (data) => {
    const msg = data.toString();
    if (msg[0] === '{') { try { handleControl(ws, JSON.parse(msg)); } catch { } }
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

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nBuka di laptop : http://localhost:${PORT}`);
  console.log(
    (process.env.GEMINI_API_KEY || '').trim()
      ? `Gemini Jarvis  : AKTIF (${GEMINI_MODELS[0]})`
      : 'Gemini Jarvis  : Nonaktif (isi GEMINI_API_KEY di file .env lalu restart server)'
  );
  if (!auth.isLoginEnabled()) {
    console.log('Login Control  : NONAKTIF (LOGIN_ENABLED=false)');
  } else {
    const dbRes = await auth.initDatabase();
    const tsCfg = auth.getTurnstileConfig();
    console.log(
      dbRes.ok
        ? `MySQL Auth     : AKTIF (${process.env.MYSQL_DATABASE || 'robotic_hand'} @ ${process.env.MYSQL_HOST || '127.0.0.1'})`
        : `MySQL Auth     : BELUM TERHUBUNG (${dbRes.error})`
    );
    console.log(
      `Turnstile      : ${
        !tsCfg.enabled
          ? 'NONAKTIF (TURNSTILE_ENABLED=false)'
          : tsCfg.mode === 'live'
            ? 'LIVE'
            : tsCfg.mode === 'test'
              ? 'TEST KEY (lokal)'
              : 'BELUM DIKONFIGURASI'
      }`
    );
  }
  console.log('IP untuk mode WiFi (isi di halaman setup ESP32, tambah :' + PORT + '):');
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  ${i.address}`));
  // Pre-warm koneksi Edge TTS & cache sapaan Jarvis di belakang layar
  prewarmCommonTts().catch(() => { });
});
