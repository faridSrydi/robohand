import { useCallback, useEffect, useRef, useState } from 'react';
import { DICT, getLang } from '../lib/i18n';

// Pola panggilan "Robohand" / "Jarvis" untuk STT en-US (juga menangkap variasi pengucapan)
const WAKE_RE =
  /\b(robo\w*|robah\w*|rubah\w*|roban\w*|robon\w*|robben|robot(\s*(hand|tangan))?|robu\w*|jarvis|jarfis|lobo\s*hand|(hello|hi|hey|halo|hai)\s*(robo\w*|robot|hand|jarvis))\b/i;
const SLEEP_RE = /\b(standby|stand\s*by|sleep|rest|go\s*to\s*sleep|istirahat|tidur)\b/i;

const WAKE_REPLIES = [
  'Robohand is online and ready.',
  'Hello. How may I assist you?',
  'All systems online. Ready for your command.',
];
const SLEEP_REPLIES = [
  'Standing by.',
  'Entering standby mode.',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Normalisasi hasil transkrip Chrome (tahan aksen Indonesia di STT en-US maupun kata Inggris di STT id-ID)
function normalizeTranscript(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, ' ')
    .replace(/\bl[\s.-]+e[\s.-]+d\b/gi, 'led')
    .replace(/\bel[\s-]+e[\s-]+d\b/gi, 'led')
    .replace(/\b(elidi|el\s*i\s*di|lidi|leed)\b/gi, 'led')
    .replace(/\bwi[\s-]+fi\b/gi, 'wifi')
    .replace(/\bu[\s.-]+s[\s.-]+b\b/gi, 'usb')
    .replace(/\b(spaniel|cocker\s+spaniel|klos\s+panel|klose\s+panel)\b/gi, 'close panel')
    .replace(/\b(clothes|klaus|cross|claws|glows|klos|klose)\s+(panel|camera|cam|led|overlay|light|studio)\b/gi, 'close $2')
    .replace(/\b(close|open|hide|show|tutup|buka|sembunyikan|tampilkan)\s+(fennel|funnel|channel|finale|pano|pannel|penal|penel|fanel)\b/gi, '$1 panel')
    .replace(/\b(control|kontrol)\s+(fennel|funnel|channel|pannel|penal|penel|fanel)\b/gi, 'control panel')
    .replace(/\b(open|close|set|show|hide|buka|tutup|atur|nyalakan|nyalain|matikan|matiin)\s+(lead|lady|let)\b/gi, '$1 led')
    .replace(/\b(duck|dog|doc|dork|dart|dak)\s+(mode|mood|theme|tema)\b/gi, 'dark mode')
    .replace(/\b(dark)\s+(mood|mod|mot)\b/gi, 'dark mode')
    .replace(/\b(like|right|white|ride|lite|lait)\s+(mode|mood|theme|tema)\b/gi, 'light mode')
    .replace(/\b(light)\s+(mood|mod|mot)\b/gi, 'light mode')
    .replace(/\b(camara|camero|kameha|kamra|kamerah)\b/gi, 'camera')
    .replace(/\b(feast|fistt|fis)\b/gi, 'fist')
    .replace(/\b(peas|peac|piss|pis)\b/gi, 'peace')
    .replace(/\b(strip|led|lampu)\s+(?:yang\s+)?(pertama|kesatu|satu|wan|won)\b/gi, 'strip 1')
    .replace(/\b(strip|led|lampu)\s+(?:yang\s+)?(kedua|dua|tu)\b/gi, 'strip 2')
    .replace(/\bstrip\s+(to|too)\b/gi, 'strip 2')
    .replace(/\b(led|lampu)\s+1\b/gi, 'strip 1')
    .replace(/\b(led|lampu)\s+2\b/gi, 'strip 2')
    .replace(/\b(nyalain|idupin|hidupin|hidupkan)\b/gi, 'nyalakan')
    .replace(/\b(matiin|padamin|padamkan)\b/gi, 'matikan')
    .replace(/\b(bukain)\b/gi, 'buka')
    .replace(/\b(tutupin)\b/gi, 'tutup')
    .replace(/\b(terangin)\b/gi, 'terangkan')
    .replace(/\b(redupin|gelapin)\b/gi, 'redupkan')
    .replace(/\b(cepetin|cepatin)\b/gi, 'percepat')
    .replace(/\b(pelanin|lambatin)\b/gi, 'pelankan')
    .replace(/\b(rain\s+bow|renbo)\b/gi, 'rainbow')
    .replace(/\b(metior|meteors)\b/gi, 'meteor')
    .replace(/\b(skener|skaner|scanners)\b/gi, 'scanner')
    .replace(/\b(twinkel|twinkling)\b/gi, 'twinkle')
    .replace(/\b(tekhnik|tehnix|teknic)\b/gi, 'teknik')
    .replace(/\s+/g, ' ')
    .trim();
}

// Jarak edit Levenshtein ringan untuk memulihkan salah ketik/salah dengar 1-2 huruf dari STT
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

// Kosakata kunci perintah: koreksi fuzzy hanya bila jarak edit sangat dekat (presisi tinggi, tidak salah tangkap)
const FUZZY_VOCAB = [
  'robohand', 'jarvis', 'standby',
  'camera', 'kamera', 'panel', 'sidebar', 'overlay', 'studio',
  'calibration', 'kalibrasi', 'tracking', 'manual', 'binary', 'smoothing',
  'rainbow', 'pelangi', 'meteor', 'breath', 'scanner', 'pemindai', 'twinkle', 'sparkle', 'alternate',
  'brightness', 'kecerahan', 'kecepatan', 'brighter', 'dimmer', 'faster', 'slower',
  'yellow', 'orange', 'purple', 'violet', 'kuning', 'merah', 'hijau', 'putih',
  'peace', 'teknik', 'kepalan', 'terbuka', 'indonesian', 'english',
];

function fuzzyRepair(text) {
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((w) => {
      if (w.length < 4 || /^\d+$/.test(w)) return w;
      if (FUZZY_VOCAB.includes(w)) return w;
      const maxDist = w.length >= 6 ? 2 : 1;
      let best = w;
      let bestD = maxDist + 1;
      for (const target of FUZZY_VOCAB) {
        if (Math.abs(target.length - w.length) > maxDist) continue;
        // Huruf pertama harus sama atau mirip fonetik (c/k, f/p, s/z) agar tidak salah koreksi kata lain
        const firstSame =
          w[0] === target[0] ||
          (w[0] === 'k' && target[0] === 'c') ||
          (w[0] === 'c' && target[0] === 'k') ||
          (w[0] === 'f' && target[0] === 'p') ||
          (w[0] === 'p' && target[0] === 'f');
        if (!firstSame) continue;
        const d = editDistance(w, target);
        if (d < bestD) {
          bestD = d;
          best = target;
        }
      }
      return best;
    })
    .join(' ');
}

function cleanTranscript(s) {
  return fuzzyRepair(normalizeTranscript(s));
}

// Cek apakah ucapan masih merupakan awalan kalimat perintah yang belum selesai (jangan eksekusi terburu-buru di interim)
const INCOMPLETE_PREFIX_RE =
  /^(open|close|hide|show|set|change|make|turn|switch|go|put|buka|tutup|atur|ubah|ganti|nyalakan|matikan|strip|strip\s+[12]|led|lampu|brightness|kecerahan|speed|kecepatan|finger\s+speed|camera\s+brightness|dark|light|mode|tema|warna|color|warna\s+led|led\s+strip)(\s+(to|at|ke|the|on|off|up|down|strip|strip\s+[12]|led|mode|color|warna|brightness|speed))?$/i;

const QUESTION_RE =
  /[?]|\b(who|what|why|how|when|where|tell|explain|creator|maker|built|made|build|component|components|parts|battery|batteries|servo|servos|esp32|esp|can you|are you|apa|siapa|kenapa|bagaimana|gimana|kabar|komponen|pembuat|baterai|jelaskan|ceritakan)\b/i;

// Perintah langsung (kata homofon seperti "to"/"for"/"won" TIDAK dimasukkan di sini agar tidak bentrok dengan kalimat lain)
const HAND_COMMANDS = [
  { key: 'peace', label: 'Peace ✌️', re: /\b(peace|piece|damai|two fingers|dua jari|2 jari|v sign|victory)\b/i, pose: [100, 0, 0, 100, 100], preset: true },
  { key: 'fuck', label: 'Middle finger 🖕', re: /\b(fuck|fak|f\*+|middle finger|jari tengah)\b/i, pose: [100, 100, 0, 100, 100], preset: true },
  { key: 'teknik', label: 'Rock / Teknik 🤘', re: /\b(rock|metal|horns|teknik|engineering)\b/i, pose: [100, 0, 100, 100, 0], preset: true },
  { key: '0', label: 'Fist (0)', re: /\b(fist|closed|zero|kepalan|kepal|genggam|nol|0)\b/i, pose: [100, 100, 100, 100, 100] },
  { key: '5', label: '5 fingers open', re: /\b(open hand|open all|five|faif|terbuka|buka semua|lima|5)\b/i, pose: [0, 0, 0, 0, 0] },
  { key: '4', label: '4 fingers open', re: /\b(four|empat|4)\b/i, pose: [0, 0, 0, 0, 100] },
  { key: '3', label: '3 fingers open', re: /\b(three|tree|tri|tiga|3)\b/i, pose: [0, 0, 0, 100, 100] },
  { key: '2', label: '2 fingers open', re: /\b(two|dua|2)\b/i, pose: [0, 0, 100, 100, 100] },
  { key: '1', label: '1 finger open', re: /\b(one|satu|1)\b/i, pose: [0, 100, 100, 100, 100] },
];

// Homofon singkat ("to", "too", "for", "won") hanya diterima bila seluruh ucapan pendek (1-2 kata)
const SHORT_HOMOPHONE_HAND = [
  { key: '4', label: '4 fingers open', re: /^(for|empat)(\s+(finger|fingers|jari))?$/i, pose: [0, 0, 0, 0, 100] },
  { key: '2', label: '2 fingers open', re: /^(to|too|tu)(\s+(finger|fingers|jari))?$/i, pose: [0, 0, 100, 100, 100] },
  { key: '1', label: '1 finger open', re: /^(won|wan)(\s+(finger|fingers|jari))?$/i, pose: [0, 100, 100, 100, 100] },
];

// Urutan mode LED persis sama dengan LedStripPanel.jsx & firmware/esp32_hand.ino
const LED_MODES = [
  { key: 'm0', label: 'Meteor', mode: 0, re: /\b(meteor)\b/i },
  { key: 'm1', label: 'Solid', mode: 1, re: /\b(solid|static|warna tetap|tetap)\b/i },
  { key: 'm2', label: 'Breath', mode: 2, re: /\b(breath|breathe|breathing|napas|nafas)\b/i },
  { key: 'm3', label: 'Rainbow', mode: 3, re: /\b(rainbow|pelangi)\b/i },
  { key: 'm4', label: 'Chase', mode: 4, re: /\b(chase|running|kejar)\b/i },
  { key: 'm5', label: 'Scanner', mode: 5, re: /\b(scanner|scan|pemindai)\b/i },
  { key: 'm6', label: 'Twinkle', mode: 6, re: /\b(twinkle|sparkle|glitter|berkelip|kelip|kilau)\b/i },
  { key: 'm7', label: 'Fire', mode: 7, re: /\b(fire|flame|api)\b/i },
  { key: 'm8', label: 'Wave', mode: 8, re: /\b(wave|gelombang)\b/i },
  { key: 'm9', label: 'Blink', mode: 9, re: /\b(alternate|blink|strobe|flash|kedip)\b/i },
];

const LED_COLORS = [
  { key: 'red', label: 'Red', patch: { r: 255, g: 45, b: 45, rgb: false }, re: /\b(red|merah)\b/i },
  { key: 'orange', label: 'Orange', patch: { r: 255, g: 120, b: 20, rgb: false }, re: /\b(orange|oranye|jingga)\b/i },
  { key: 'yellow', label: 'Yellow', patch: { r: 255, g: 170, b: 30, rgb: false }, re: /\b(yellow|gold|amber|kuning|emas)\b/i },
  { key: 'green', label: 'Green', patch: { r: 34, g: 197, b: 94, rgb: false }, re: /\b(green|hijau|ijo)\b/i },
  { key: 'cyan', label: 'Cyan', patch: { r: 0, g: 229, b: 255, rgb: false }, re: /\b(cyan|aqua|teal|toska|biru muda)\b/i },
  { key: 'blue', label: 'Blue', patch: { r: 43, g: 127, b: 255, rgb: false }, re: /\b(blue|biru)\b/i },
  { key: 'purple', label: 'Purple', patch: { r: 168, g: 85, b: 247, rgb: false }, re: /\b(purple|violet|ungu)\b/i },
  { key: 'pink', label: 'Pink', patch: { r: 255, g: 79, b: 163, rgb: false }, re: /\b(pink|magenta|merah muda)\b/i },
  { key: 'white', label: 'White', patch: { r: 255, g: 255, b: 255, rgb: false }, re: /\b(white|putih)\b/i },
  { key: 'rgb', label: 'RGB', patch: { rgb: true }, re: /\b(rgb|colorful|warna warni)\b/i },
];

const LED_TRIGGER_RE =
  /\b(light|lights|lamp|led|strip|lampu|color|colour|warna|mode|set|change|make|brightness|bright|dim|dimmer|kecerahan|terang|redup|speed|faster|slower|fast|slow|kecepatan|cepat|pelan)\b/i;

const WORD_NUMS = {
  zero: 0, ten: 10, twenty: 20, twentyfive: 25, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, seventyfive: 75, eighty: 80, ninety: 90, hundred: 100,
  half: 50, full: 100, max: 100, maximum: 100, min: 10, minimum: 10,
};

function extractPercent(text, nearRe) {
  // Cari angka tepat setelah kata kunci (mis. "brightness 60", "speed to 80%", "kecerahan 40")
  const m = text.match(new RegExp(`(?:${nearRe.source})\\s*(?:to|at|ke|=)?\\s*(\\d{1,3}|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half|full|max|maximum|min|minimum)\\s*%?`, 'i'));
  if (m) {
    const raw = m[1].toLowerCase();
    const val = raw in WORD_NUMS ? WORD_NUMS[raw] : parseInt(raw, 10);
    if (!Number.isNaN(val)) return Math.max(0, Math.min(100, val));
  }
  // Atau angka tepat sebelum kata kunci (mis. "50% brightness", "80 percent speed")
  const m2 = text.match(new RegExp(`(\\d{1,3})\\s*(?:%|percent|persen)?\\s*(?:${nearRe.source})`, 'i'));
  if (m2) {
    const val = parseInt(m2[1], 10);
    if (!Number.isNaN(val)) return Math.max(0, Math.min(100, val));
  }
  return null;
}

function parseLedCommand(text) {
  // Jangan salah kira "dark mode" / "light mode" / "camera brightness" / "finger speed" sebagai perintah LED
  const isThemePhrase = /\b(dark\s*(mode|theme)|light\s*(mode|theme)|night\s*mode|day\s*mode|mode\s*(gelap|terang)|tema\s*(gelap|terang))\b/i.test(text);
  if (isThemePhrase && !/\b(led|strip|lampu)\b/i.test(text)) return null;
  const isFingerSpeed = /\b(finger|fingers|servo|servos|hand|jari)\s*(speed|kecepatan)\b|\b(faster|slower)\s*(finger|fingers|servo|hand|jari)\b/i.test(text);
  const isCamBright = /\b(camera|webcam|kamera)\s*(brightness|bright|kecerahan)\b/i.test(text);

  const patch = {};
  const parts = [];
  const keys = [];

  // Target strip: strip 1 (kiri), strip 2 (kanan), atau both/kedua strip (0)
  if (/\b(strip\s*1|strip\s*one|first\s*strip|left\s*strip|strip\s*kiri)\b/i.test(text)) {
    patch.strip = 1;
    parts.push('S1');
    keys.push('s1');
  } else if (/\b(strip\s*2|strip\s*two|second\s*strip|right\s*strip|strip\s*kanan)\b/i.test(text)) {
    patch.strip = 2;
    parts.push('S2');
    keys.push('s2');
  } else if (/\b(both\s*strips?|all\s*strips?|kedua\s*strip)\b/i.test(text)) {
    patch.strip = 0;
  }

  // Matikan LED (hanya bila menyebut light/led/lamp/lampu agar tidak bentrok dengan "turn off camera")
  if (/\b(light|lights|lamp|led|strip|lampu)\b/i.test(text) && /\b(turn off|switch off|off|mati|matikan|padam)\b/i.test(text)) {
    return { key: 'led-off', label: 'LED Off', patch: { ...(patch.strip != null ? { strip: patch.strip } : {}), mode: 10 }, ensureOn: false };
  }

  // Matikan mode RGB saja
  if (/\b(disable|stop|off|turn off|matikan)\s+rgb\b/i.test(text)) {
    patch.rgb = false;
    parts.push('RGB Off');
    keys.push('rgb-off');
  }

  for (const m of LED_MODES) {
    if (m.re.test(text)) {
      patch.mode = m.mode;
      parts.push(m.label);
      keys.push(m.key);
      break;
    }
  }
  for (const c of LED_COLORS) {
    if (c.key === 'rgb' && patch.rgb === false) continue;
    if (c.re.test(text)) {
      Object.assign(patch, c.patch);
      parts.push(c.label);
      keys.push(c.key);
      break;
    }
  }

  // Kecerahan LED (persentase pasti, preset, atau naik/turun bertahap)
  if (!isCamBright) {
    const brightPct = extractPercent(text, /brightness|bright|kecerahan|terang|dim/);
    if (brightPct !== null) {
      patch.bright = Math.max(1, Math.round((brightPct / 100) * 255));
      parts.push(`${brightPct}% bright`);
      keys.push(`br${brightPct}`);
    } else if (/\b(max|full|highest|maksimal)\s*(brightness|bright|kecerahan)\b|\bbrightness\s*(max|full|maksimal)\b/i.test(text)) {
      patch.bright = 255;
      parts.push('Bright 100%');
      keys.push('br-max');
    } else if (/\b(min|minimum|lowest|minimal)\s*(brightness|bright|kecerahan)\b|\bbrightness\s*(min|minimum|low|minimal)\b/i.test(text)) {
      patch.bright = 28;
      parts.push('Bright 11%');
      keys.push('br-min');
    } else if (/\b(medium|half|normal|sedang)\s*(brightness|bright|kecerahan)\b|\bbrightness\s*(medium|half|normal|sedang)\b/i.test(text)) {
      patch.bright = 128;
      parts.push('Bright 50%');
      keys.push('br-mid');
    } else if (/\b(brightness\s*up|increase\s*brightness|more\s*bright|brighter|terangkan|lebih\s*terang|naikkan\s*kecerahan)\b/i.test(text)) {
      patch.brightDelta = 45;
      parts.push('Bright +');
      keys.push('br-up');
    } else if (/\b(brightness\s*down|decrease\s*brightness|less\s*bright|dimmer|dim|darker|redupkan|lebih\s*redup|turunkan\s*kecerahan)\b/i.test(text)) {
      patch.brightDelta = -45;
      parts.push('Bright -');
      keys.push('br-dn');
    }
  }

  // Kecepatan animasi LED (persentase pasti, preset, atau naik/turun bertahap)
  if (!isFingerSpeed) {
    const speedPct = extractPercent(text, /led\s*speed|animation\s*speed|speed|kecepatan\s*led|kecepatan/);
    if (speedPct !== null) {
      patch.speed = Math.max(1, Math.min(100, speedPct));
      parts.push(`Speed ${patch.speed}%`);
      keys.push(`sp${patch.speed}`);
    } else if (/\b(max|full|fastest|maksimal)\s*(led\s*)?(speed|kecepatan)\b|\b(speed|kecepatan)\s*(max|full|maksimal)\b|\bfastest\b/i.test(text)) {
      patch.speed = 100;
      parts.push('Speed 100%');
      keys.push('sp-max');
    } else if (/\b(min|minimum|slowest|minimal)\s*(led\s*)?(speed|kecepatan)\b|\b(speed|kecepatan)\s*(min|minimum|minimal)\b|\bslowest\b/i.test(text)) {
      patch.speed = 10;
      parts.push('Speed 10%');
      keys.push('sp-min');
    } else if (/\b(medium|normal|half|sedang)\s*(led\s*)?(speed|kecepatan)\b|\b(speed|kecepatan)\s*(medium|normal|sedang)\b/i.test(text)) {
      patch.speed = 50;
      parts.push('Speed 50%');
      keys.push('sp-mid');
    } else if (/\b(speed\s*up|increase\s*speed|faster|fast|percepat|lebih\s*cepat|naikkan\s*kecepatan)\b/i.test(text)) {
      patch.speedDelta = 20;
      parts.push('Speed +');
      keys.push('sp-up');
    } else if (/\b(slow\s*down|decrease\s*speed|slower|slow|pelankan|lebih\s*pelan|lebih\s*lambat|turunkan\s*kecepatan)\b/i.test(text)) {
      patch.speedDelta = -20;
      parts.push('Speed -');
      keys.push('sp-dn');
    }
  }

  // Jangan eksekusi kalau cuma menyebut "strip 1" tanpa ada perubahan warna/mode/kecerahan/kecepatan
  const realChangeKeys = keys.filter((k) => k !== 's1' && k !== 's2');
  if (!realChangeKeys.length) return null;

  return {
    key: 'led-' + keys.join('-'),
    label: 'LED ' + parts.join(' '),
    patch,
    ensureOn: true,
  };
}

function parseUiCommand(text) {
  const ui = {};
  const labels = [];

  if (/\b(dark\s*(mode|theme)|night\s*mode|mode\s*gelap|tema\s*gelap|switch\s+to\s+dark|go\s+dark)\b/i.test(text)) {
    ui.theme = 'dark';
    labels.push('Dark mode');
  } else if (/\b(light\s*(mode|theme)|day\s*mode|mode\s*terang|tema\s*terang|switch\s+to\s+light)\b/i.test(text)) {
    ui.theme = 'light';
    labels.push('Light mode');
  }

  if (/\b(indonesian|bahasa indonesia|switch to indonesian|bahasa indo)\b/i.test(text)) {
    ui.lang = 'id';
    labels.push('Language ID');
  } else if (/\b(english|bahasa inggris|switch to english)\b/i.test(text)) {
    ui.lang = 'en';
    labels.push('Language EN');
  }

  if (/\b(camera|webcam|kamera)\b/i.test(text)) {
    if (/\b(close|stop|off|turn off|shut|matikan|tutup)\b/i.test(text)) {
      ui.camera = 'close';
      labels.push('Camera off');
    } else if (/\b(open|start|on|turn on|show|buka|nyalakan)\b/i.test(text)) {
      ui.camera = 'open';
      labels.push('Camera on');
    }
  }

  // "open LED control / set LED / LED settings / open overlay" vs "close LED control / close overlay"
  const hasLedWord = ui.theme ? /\b(led|strip|lampu)\b/i.test(text) : /\b(led|light|lights|lamp|lampu)\b/i.test(text);
  const hasLedSetting = Boolean(parseLedCommand(text));
  if (hasLedWord && /\b(control|panel|studio|overlay|menu|settings|setting|pengaturan|kontrol)\b/i.test(text)) {
    if (/\b(close|hide|exit|tutup|sembunyikan)\b/i.test(text)) {
      ui.ledPanel = 'close';
      labels.push('LED overlay closed');
    } else if (/\b(open|show|set|buka|tampilkan|atur)\b/i.test(text)) {
      ui.ledPanel = 'open';
      labels.push('LED overlay open');
    }
  } else if (!hasLedSetting && hasLedWord && /\b(open|show|set|buka|tampilkan|atur)\b/i.test(text)) {
    // Jika user bilang "open LED" atau "set LED" (tanpa menyebut warna/mode), langsung buka overlay LED Studio
    ui.ledPanel = 'open';
    labels.push('LED overlay open');
  } else if (/\b(close|hide|exit|tutup)\b/i.test(text) && /\b(overlay|led studio|led|lampu)\b/i.test(text) && !/\bturn off\b/i.test(text)) {
    ui.ledPanel = 'close';
    labels.push('LED overlay closed');
  }

  if (/\b(control panel|panel|sidebar)\b/i.test(text) && !hasLedWord) {
    if (/\b(close|hide|tutup|sembunyikan)\b/i.test(text)) {
      ui.panel = 'close';
      labels.push('Panel closed');
    } else if (/\b(open|show|buka|tampilkan)\b/i.test(text)) {
      ui.panel = 'open';
      labels.push('Panel open');
    }
  }

  if (/\b(calibration|kalibrasi)\b/i.test(text)) {
    if (/\b(close|hide|tutup)\b/i.test(text)) {
      ui.servoCal = 'close';
      labels.push('Calibration closed');
    } else if (/\b(open|show|buka)\b/i.test(text)) {
      ui.servoCal = 'open';
      labels.push('Calibration open');
    }
  }

  if (/\b(manual mode|switch to manual|manual)\b/i.test(text)) {
    ui.mode = 'manual';
    labels.push('Manual mode');
  } else if (/\b(hand tracking|tracking mode|switch to tracking|enable tracking)\b/i.test(text)) {
    ui.mode = 'track';
    labels.push('Hand tracking');
  }

  if (/\b(usb|serial|cable|kabel)\b/i.test(text)) {
    ui.connection = 'serial';
    labels.push('USB mode');
  } else if (/\b(wifi|wi-fi|wireless)\b/i.test(text)) {
    ui.connection = 'wifi';
    labels.push('WiFi mode');
  }

  // Kecepatan jari / servo (30-360°/s)
  if (/\b(finger|fingers|servo|servos|hand|jari)\s*(speed|kecepatan)\b|\b(faster|slower)\s*(finger|fingers|servo|hand|jari)\b/i.test(text)) {
    const mNum = text.match(/(\d{2,3})/);
    if (mNum) {
      ui.fingerSpeed = Math.max(30, Math.min(360, parseInt(mNum[1], 10)));
      labels.push(`Finger ${ui.fingerSpeed}°/s`);
    } else if (/\b(max|full|fastest|maksimal)\b/i.test(text)) {
      ui.fingerSpeed = 360;
      labels.push('Finger speed max');
    } else if (/\b(slow|slower|pelan|lambat)\b/i.test(text)) {
      ui.fingerSpeedDelta = -60;
      labels.push('Finger slower');
    } else if (/\b(fast|faster|cepat)\b/i.test(text)) {
      ui.fingerSpeedDelta = 60;
      labels.push('Finger faster');
    }
  }

  // Smoothing & mode biner
  if (/\b(smoothing|smooth)\b/i.test(text)) {
    const sm = extractPercent(text, /smoothing|smooth/);
    if (sm !== null) {
      ui.smooth = Math.max(5, Math.min(100, sm));
      labels.push(`Smooth ${ui.smooth}%`);
    }
  }
  if (/\b(binary|biner)\b/i.test(text)) {
    if (/\b(off|disable|disable|matikan|nonaktif)\b/i.test(text)) {
      ui.binary = false;
      labels.push('Binary off');
    } else if (/\b(on|enable|aktifkan|nyalakan)\b/i.test(text)) {
      ui.binary = true;
      labels.push('Binary on');
    }
  } else if (/\b(analog mode|proportional mode)\b/i.test(text)) {
    ui.binary = false;
    labels.push('Analog mode');
  }

  // Kecerahan kamera
  if (/\b(camera|webcam|kamera)\s*(brightness|bright|kecerahan)\b/i.test(text)) {
    if (/\b(auto|automatic|otomatis)\b/i.test(text)) {
      ui.autoBright = true;
      labels.push('Auto cam bright');
    } else {
      const m = text.match(/(\d{3})/);
      if (m) {
        ui.camBright = Math.max(100, Math.min(500, parseInt(m[1], 10)));
        labels.push(`Cam bright ${(ui.camBright / 100).toFixed(1)}x`);
      }
    }
  }

  if (!labels.length) return null;
  return {
    key: 'ui-' + Object.entries(ui).map(([k, v]) => `${k}:${v}`).join(','),
    label: labels.join(' · '),
    ui,
  };
}

function findLatestHandCommand(text) {
  // Jangan salah kira angka milik strip LED / persentase / kecepatan sebagai jumlah jari
  if (/\b(strip\s*[12]|brightness|kecerahan|speed|kecepatan|smooth|smoothing|percent|persen)\b/i.test(text)) {
    return null;
  }
  const trimmed = String(text || '').trim();
  for (const h of SHORT_HOMOPHONE_HAND) {
    if (h.re.test(trimmed)) return { type: 'hand', ...h };
  }
  let best = null;
  let bestPos = -1;
  for (const c of HAND_COMMANDS) {
    const gRe = new RegExp(c.re.source, 'gi');
    let m;
    while ((m = gRe.exec(trimmed)) !== null) {
      const endPos = m.index + m[0].length;
      if (endPos > bestPos) {
        bestPos = endPos;
        best = { type: 'hand', ...c };
      }
    }
  }
  return best;
}

// Cek apakah kalimat bisa dieksekusi LANGSUNG (~150ms lokal, nol jeda API)
// mencakup perintah jari, warna/mode LED, dan kontrol UI (kamera, panel kontrol, LED overlay)
function canHandleInstantly(text) {
  const cleaned = text
    .replace(WAKE_RE, ' ')
    .replace(/\b(hello|hi|hey|please|halo|hai|tolong|coba|dong|ya|nih|finger|fingers|jari|the|it|to|jadi|warna)\b/gi, ' ')
    .trim();
  if (!cleaned) return 'wake';
  if (QUESTION_RE.test(cleaned)) return null;
  if (SLEEP_RE.test(cleaned) && cleaned.split(/\s+/).length <= 4) return 'sleep';

  const uiCmd = parseUiCommand(text);
  const ledCmd = parseLedCommand(text);
  const handCmd = findLatestHandCommand(cleaned);
  if (uiCmd || ledCmd) return 'cmd';
  if (handCmd) {
    const leftover = HAND_COMMANDS.reduce((s, c) => s.replace(new RegExp(c.re.source, 'gi'), ' '), cleaned)
      .replace(/^(for|to|too|tu|won|wan)$/gi, '')
      .trim();
    if (!leftover || cleaned.split(/\s+/).length <= 4) return 'cmd';
  }
  return null;
}

// Pilih bahasa STT Chrome sesuai bahasa aktif web (ID -> id-ID, EN -> en-US)
// Supaya aksen Indonesia & perintah bahasa Indonesia dikenali jauh lebih presisi saat mode ID
function getSttLang() {
  return getLang() === 'id' ? 'id-ID' : 'en-US';
}

function isSelfEcho(heard, spoken) {
  if (!heard || !spoken) return false;
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\btuhan\b/g, 'tuan')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const hw = norm(heard);
  const sw = new Set(norm(spoken));
  if (!hw.length || !sw.size) return false;
  let match = 0;
  for (const w of hw) if (sw.has(w)) match += 1;
  return match / hw.length >= 0.5;
}

function getSR() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Kontrol suara berkelanjutan (sekali tekan ON, terus menyimak dengan auto-restart).
 * Mendukung mode AI Gemini (persona formal Jarvis via /api/voice-ai) + fallback lokal instan.
 */
export function useVoiceControl({ onPose, onLed, onUi, onWakeChime, getState, enabled = true }) {
  const supported = Boolean(getSR());
  const [listening, setListening] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [micStage, setMicStage] = useState('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [micName, setMicName] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [awake, setAwake] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  const activeRef = useRef(false);
  const aiActiveRef = useRef(false);
  const awakeRef = useRef(true);
  const thinkingRef = useRef(false);
  const pausedForTtsRef = useRef(false);
  const recRef = useRef(null);
  const startRecRef = useRef(null);
  const utteranceRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const ttsAbortRef = useRef(null);
  const speakSeqRef = useRef(0);
  const restartTimerRef = useRef(null);
  const interimCmdTimerRef = useRef(null);
  const interimAiTimerRef = useRef(null);
  const speakTimerRef = useRef(null);
  const speakFallbackRef = useRef(null);
  const ttsSafetyRef = useRef(null);
  const ignoreUntilRef = useRef(0);
  const lastSpokenRef = useRef({ text: '', time: 0 });
  const netErrCountRef = useRef(0);
  const langRef = useRef(getSttLang());
  const continuousRef = useRef(true);
  const fallbackTriedRef = useRef(false);
  const heardResultRef = useRef(false);
  const peakLevelRef = useRef(0);
  const loudSinceRef = useRef(0);
  const startedAtRef = useRef(0);
  const meterStreamRef = useRef(null);
  const meterCtxRef = useRef(null);
  const meterTimerRef = useRef(null);
  const historyRef = useRef([]);
  const lastAiSegRef = useRef({ segIdx: -1, text: '', time: 0 });
  const lastExecRef = useRef({ key: '', time: 0, segIdx: -1, wordCount: 0 });

  const onPoseRef = useRef(onPose);
  const onLedRef = useRef(onLed);
  const onUiRef = useRef(onUi);
  const onWakeChimeRef = useRef(onWakeChime);
  const getStateRef = useRef(getState);
  onPoseRef.current = onPose;
  onLedRef.current = onLed;
  onUiRef.current = onUi;
  onWakeChimeRef.current = onWakeChime;
  getStateRef.current = getState;
  aiActiveRef.current = aiConfigured;

  // Cek status konfigurasi GEMINI_API_KEY di server (hanya setelah login)
  useEffect(() => {
    if (!enabled) {
      setAiConfigured(false);
      return undefined;
    }
    let alive = true;
    fetch('/api/voice-ai/status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setAiConfigured(Boolean(d.configured));
      })
      .catch(() => { });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const stopMeter = useCallback(() => {
    clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    if (meterStreamRef.current) {
      meterStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { }
      });
      meterStreamRef.current = null;
    }
    if (meterCtxRef.current) {
      try { meterCtxRef.current.close(); } catch { }
      meterCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  // Sekali aktif / dipanggil "Robohand", tetap aktif terus (tanpa timeout tidur otomatis) sampai Tuan minta standby
  const armAwake = useCallback(() => {
    awakeRef.current = true;
    setAwake(true);
  }, []);

  const sleepNow = useCallback(() => {
    awakeRef.current = false;
    setAwake(false);
  }, []);

  const pauseRecForTts = useCallback(() => {
    pausedForTtsRef.current = true;
    clearTimeout(restartTimerRef.current);
    clearTimeout(interimCmdTimerRef.current);
    clearTimeout(interimAiTimerRef.current);
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onstart = null;
      r.onaudiostart = null;
      r.onsoundstart = null;
      r.onsoundend = null;
      r.onspeechstart = null;
      r.onspeechend = null;
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      // abort() membuang seluruh buffer audio STT sehingga suara speaker sendiri tidak pernah ditranskrip
      try { r.abort(); } catch { try { r.stop(); } catch { } }
    }
  }, []);

  const resumeRecAfterTts = useCallback((delayMs = 220) => {
    clearTimeout(ttsSafetyRef.current);
    clearTimeout(restartTimerRef.current);
    setSpeaking(false);
    ignoreUntilRef.current = performance.now() + delayMs + 140;
    if (!activeRef.current) {
      pausedForTtsRef.current = false;
      return;
    }
    restartTimerRef.current = setTimeout(() => {
      pausedForTtsRef.current = false;
      if (activeRef.current && !recRef.current) {
        startRecRef.current?.();
      }
    }, delayMs);
  }, []);

  const stopAudioPlayback = useCallback(() => {
    try { ttsAbortRef.current?.abort(); } catch { }
    ttsAbortRef.current = null;
    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch { }
    }
    if (audioUrlRef.current) {
      try { URL.revokeObjectURL(audioUrlRef.current); } catch { }
      audioUrlRef.current = '';
    }
  }, []);

  const speakBrowserFallback = useCallback(
    (text) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resumeRecAfterTts(200);
        return;
      }
      try {
        const synth = window.speechSynthesis;
        const emit = (useLocalFallback = false) => {
          const u = new SpeechSynthesisUtterance(text);
          utteranceRef.current = u;

          const voices = synth.getVoices();
          if (!useLocalFallback) {
            const maleEn =
              voices.find((v) => /^en-GB/i.test(v.lang) && /(ryan|george|daniel|male)/i.test(v.name)) ||
              voices.find((v) => /^en/i.test(v.lang) && /(david|ryan|george|daniel|guy|mark|male)/i.test(v.name)) ||
              voices.find((v) => /^en/i.test(v.lang) && v.localService) ||
              voices.find((v) => /^en/i.test(v.lang));
            if (maleEn) {
              u.voice = maleEn;
              u.lang = maleEn.lang;
            } else {
              u.lang = 'en-GB';
            }
          } else {
            const localMale = voices.find((v) => v.localService && /(david|ryan|george|daniel|male)/i.test(v.name)) || voices.find((v) => v.localService);
            if (localMale) u.voice = localMale;
            u.lang = localMale ? localMale.lang : 'en-US';
          }

          u.rate = 0.99;
          u.pitch = 0.88;

          let started = false;
          u.onstart = () => {
            started = true;
            clearTimeout(speakFallbackRef.current);
            setSpeaking(true);
            lastSpokenRef.current = { text, time: performance.now() };
          };
          u.onend = () => {
            clearTimeout(speakFallbackRef.current);
            utteranceRef.current = null;
            lastSpokenRef.current = { text, time: performance.now() };
            resumeRecAfterTts(420);
          };
          u.onerror = () => {
            clearTimeout(speakFallbackRef.current);
            utteranceRef.current = null;
            if (!useLocalFallback) {
              try { synth.cancel(); } catch { }
              speakTimerRef.current = setTimeout(() => emit(true), 80);
            } else {
              resumeRecAfterTts(250);
            }
          };

          try { synth.resume(); } catch { }
          synth.speak(u);

          if (!useLocalFallback) {
            speakFallbackRef.current = setTimeout(() => {
              if (!started && activeRef.current) {
                try { synth.cancel(); } catch { }
                emit(true);
              }
            }, 900);
          }
        };

        if (synth.speaking || synth.pending) {
          synth.cancel();
          speakTimerRef.current = setTimeout(() => emit(false), 60);
        } else {
          emit(false);
        }
      } catch {
        resumeRecAfterTts(200);
      }
    },
    [resumeRecAfterTts]
  );

  const speak = useCallback(
    (text) => {
      if (!text) return;
      const mySeq = ++speakSeqRef.current;
      setReplyText(text);
      lastSpokenRef.current = { text, time: performance.now() };

      clearTimeout(speakTimerRef.current);
      clearTimeout(speakFallbackRef.current);
      clearTimeout(ttsSafetyRef.current);
      stopAudioPlayback();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch { }
      }

      // Matikan sementara STT selama Robohand berbicara agar 100% tidak mendengar suaranya sendiri
      pauseRecForTts();
      setSpeaking(true);

      const estMs = Math.min(9000, Math.max(2800, text.length * 85));
      ttsSafetyRef.current = setTimeout(() => {
        if (speakSeqRef.current !== mySeq) return;
        stopAudioPlayback();
        utteranceRef.current = null;
        resumeRecAfterTts(300);
      }, estMs + 4000);

      // Streaming langsung via <audio src="/api/tts?text=..."> agar mulai berbunyi begitu chunk pertama datang (hemat ~1-2 detik!)
      const streamUrl = `/api/tts?text=${encodeURIComponent(text)}`;
      const el = audioRef.current || new Audio();
      audioRef.current = el;
      el.src = streamUrl;
      el.volume = 1;
      el.onended = () => {
        if (speakSeqRef.current !== mySeq) return;
        stopAudioPlayback();
        lastSpokenRef.current = { text, time: performance.now() };
        resumeRecAfterTts(220);
      };
      el.onerror = () => {
        if (speakSeqRef.current !== mySeq || !activeRef.current) return;
        stopAudioPlayback();
        speakBrowserFallback(text);
      };
      lastSpokenRef.current = { text, time: performance.now() };
      el.play().catch((err) => {
        if (err?.name === 'AbortError' || speakSeqRef.current !== mySeq || !activeRef.current) return;
        stopAudioPlayback();
        speakBrowserFallback(text);
      });
    },
    [pauseRecForTts, resumeRecAfterTts, speakBrowserFallback, stopAudioPlayback]
  );

  // Eksekusi lokal (instan ~150ms untuk perintah jari, warna/mode LED, dan UI kamera/panel/overlay)
  // PENTING: hanya baca activeText (kata-kata BARU), JANGAN pernah baca ulang fullText yang berisi perintah lama!
  const executeLocal = useCallback(
    (activeText, segIdx, wordCount, now, isWakeTriggered) => {
      const prev = lastExecRef.current;
      const text = cleanTranscript(activeText);
      if (!text) return;

      // Sapaan ("hello", "hi", "hey", "robohand", "jarvis") atau wake word
      const isPureGreeting = canHandleInstantly(text) === 'wake';
      if (isWakeTriggered || isPureGreeting) {
        const afterWake = text.replace(WAKE_RE, ' ').replace(/\b(hello|hi|hey|halo|hai)\b/gi, ' ').trim();
        const uiCmd = afterWake ? parseUiCommand(afterWake) : null;
        const ledCmd = afterWake ? parseLedCommand(afterWake) : null;
        const handCmd = afterWake && !uiCmd ? findLatestHandCommand(afterWake) : null;

        if (!uiCmd && !ledCmd && !handCmd) {
          if (prev.key === '__wake' && prev.segIdx === segIdx && now - prev.time < 1800) return;
          armAwake();
          lastExecRef.current = { key: '__wake', time: now, segIdx, wordCount };
          setLastAction('Ready');
          onWakeChimeRef.current?.();
          speak(pick(WAKE_REPLIES));
          return;
        }
        armAwake();
      }

      if (!awakeRef.current) return;

      if (SLEEP_RE.test(text)) {
        if (prev.key !== '__sleep' || now - prev.time > 1400) {
          lastExecRef.current = { key: '__sleep', time: now, segIdx, wordCount };
          sleepNow();
          setLastAction('Standby');
          speak(pick(SLEEP_REPLIES));
        }
        return;
      }

      const cleanForCmd = text.replace(WAKE_RE, ' ').trim();
      const uiCmd = parseUiCommand(cleanForCmd);
      const ledCmd = parseLedCommand(cleanForCmd);
      const handCmd = !uiCmd && !ledCmd ? findLatestHandCommand(cleanForCmd) : null;

      if (!uiCmd && !ledCmd && !handCmd) return;

      const execKey = [uiCmd?.key, ledCmd?.key, handCmd?.key].filter(Boolean).join('+');
      // Untuk perintah relatif (+ / - kecerahan/kecepatan), izinkan dipanggil berulang asal ada jeda 450ms
      const isStepCmd = /-(up|dn)\b/.test(execKey);
      if (!isStepCmd && prev.key === execKey && prev.segIdx === segIdx && wordCount <= prev.wordCount) return;
      if (prev.key === execKey && now - prev.time < 480) return;

      lastExecRef.current = { key: execKey, time: now, segIdx, wordCount };
      armAwake();

      const labels = [];
      if (uiCmd) {
        onUiRef.current?.(uiCmd.ui);
        labels.push(uiCmd.label);
      }
      if (ledCmd) {
        onLedRef.current?.(ledCmd.patch, ledCmd.ensureOn);
        labels.push(ledCmd.label);
      }
      if (handCmd) {
        onPoseRef.current?.(handCmd.pose, handCmd.preset);
        labels.push(handCmd.label);
      }
      setLastAction(labels.join(' · '));
    },
    [armAwake, sleepNow, speak]
  );

  // Kirim pertanyaan/perintah bebas ke Gemini AI di server (otomatis, sertakan alternatif STT agar tahan salah dengar)
  const askJarvisAi = useCallback(
    async (text, altTexts, segIdx, wordCount, hasWake) => {
      if (thinkingRef.current) return;
      thinkingRef.current = true;
      setThinking(true);
      // Tandai kata-kata segmen ini sudah dikonsumsi agar tidak pernah dieksekusi ulang oleh kalimat berikutnya
      lastExecRef.current = { key: '__ai', time: performance.now(), segIdx, wordCount };
      onWakeChimeRef.current?.();

      try {
        const resp = await fetch('/api/voice-ai', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            alts: altTexts,
            history: historyRef.current,
            state: getStateRef.current?.() || null,
          }),
        });
        const data = await resp.json().catch(() => null);
        if (!activeRef.current) return;

        if (!data || !data.ok) {
          executeLocal(text, segIdx, wordCount, performance.now(), hasWake);
          return;
        }

        historyRef.current = [
          ...historyRef.current.slice(-4),
          { role: 'user', text },
          { role: 'model', text: data.reply || 'Done.' },
        ];

        if (data.pose) onPoseRef.current?.(data.pose, true);
        if (data.led) onLedRef.current?.(data.led, data.led.mode !== 10);
        if (data.ui) onUiRef.current?.(data.ui);

        if (data.sleep) {
          sleepNow();
          setLastAction(data.label || 'Standby');
        } else {
          armAwake();
          setLastAction(data.label || 'Jarvis');
        }

        speak(data.reply || 'Done.');
      } catch {
        if (activeRef.current) {
          executeLocal(text, segIdx, wordCount, performance.now(), hasWake);
        }
      } finally {
        thinkingRef.current = false;
        setThinking(false);
      }
    },
    [armAwake, executeLocal, sleepNow, speak]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.getVoices(); } catch { }
    }
    // Sinkronkan bahasa STT Chrome secara otomatis saat user mengganti bahasa web (EN <-> ID)
    const onLangChange = () => {
      const nextStt = getSttLang();
      if (langRef.current === nextStt) return;
      langRef.current = nextStt;
      if (activeRef.current && !pausedForTtsRef.current && recRef.current) {
        try { recRef.current.stop(); } catch { }
      }
    };
    window.addEventListener('robohand-lang', onLangChange);
    return () => window.removeEventListener('robohand-lang', onLangChange);
  }, []);

  const stop = useCallback(
    (keepError = false) => {
      activeRef.current = false;
      thinkingRef.current = false;
      pausedForTtsRef.current = false;
      clearTimeout(restartTimerRef.current);
      clearTimeout(interimCmdTimerRef.current);
      clearTimeout(interimAiTimerRef.current);
      clearTimeout(speakTimerRef.current);
      clearTimeout(speakFallbackRef.current);
      clearTimeout(ttsSafetyRef.current);
      speakSeqRef.current += 1;
      stopAudioPlayback();
      stopMeter();
      awakeRef.current = true;
      utteranceRef.current = null;
      setListening(false);
      setMicReady(false);
      setMicStage('idle');
      setAwake(true);
      setThinking(false);
      setSpeaking(false);
      setWarning('');
      if (!keepError) setError('');
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch { }
      }
      const r = recRef.current;
      recRef.current = null;
      if (r) {
        r.onstart = null;
        r.onaudiostart = null;
        r.onsoundstart = null;
        r.onsoundend = null;
        r.onspeechstart = null;
        r.onspeechend = null;
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        try { r.stop(); } catch { }
      }
    },
    [stopAudioPlayback, stopMeter]
  );

  const startRec = useCallback(() => {
    const SR = getSR();
    if (!SR || !activeRef.current) return;

    const r = new SR();
    r.lang = langRef.current;
    r.continuous = continuousRef.current;
    r.interimResults = true;
    r.maxAlternatives = 5;
    recRef.current = r;

    r.onstart = () => {
      if (!activeRef.current) return;
      setMicReady(true);
      setMicStage('starting');
      if (netErrCountRef.current === 0) setError('');
    };
    r.onaudiostart = () => { if (activeRef.current) setMicStage('audio'); };
    r.onsoundstart = () => { if (activeRef.current) setMicStage('sound'); };
    r.onspeechstart = () => { if (activeRef.current) setMicStage('speech'); };
    r.onspeechend = () => { if (activeRef.current) setMicStage('audio'); };
    r.onsoundend = () => { if (activeRef.current) setMicStage('audio'); };

    r.onresult = (e) => {
      if (!activeRef.current) return;
      heardResultRef.current = true;
      netErrCountRef.current = 0;
      setError('');
      setWarning('');
      if (pausedForTtsRef.current || performance.now() < ignoreUntilRef.current || thinkingRef.current) return;

      const segIdx = e.results.length - 1;
      const res = e.results[segIdx];
      if (!res || !res[0]) return;

      const primary = (res[0].transcript || '').trim();
      const primaryConf = typeof res[0].confidence === 'number' ? res[0].confidence : 0;
      const lastSpoken = lastSpokenRef.current;
      if (primary && lastSpoken.text && performance.now() - lastSpoken.time < 4500 && isSelfEcho(primary, lastSpoken.text)) {
        return;
      }

      const rawWords = primary.split(/\s+/).filter(Boolean);
      const rawWordCount = rawWords.length;
      if (!rawWordCount) return;

      const now = performance.now();
      const prev = lastExecRef.current;

      // Hitung offset berdasarkan jumlah kata MENTAH agar perubahan jumlah kata oleh normalisasi tidak menelan perintah baru
      const offset = prev.segIdx === segIdx && prev.wordCount > 0 ? prev.wordCount : 0;
      if (offset > 0 && rawWordCount <= offset) {
        if (primary) setTranscript(primary);
        return;
      }

      // Kumpulkan hingga 5 alternatif transkrip dari Chrome + skor akurasinya (confidence + kecocokan perintah)
      const candidates = [];
      const seen = new Set();
      for (let a = 0; a < Math.min(5, res.length); a += 1) {
        const rawAlt = (res[a]?.transcript || '').trim();
        if (!rawAlt) continue;
        const altWords = rawAlt.split(/\s+/).filter(Boolean);
        const rawSlice = offset > 0 ? (altWords.length > offset ? altWords.slice(offset).join(' ') : '') : rawAlt;
        const cleaned = cleanTranscript(rawSlice);
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);

        const conf = typeof res[a]?.confidence === 'number' ? res[a].confidence : (a === 0 ? 0.6 : 0.4);
        const kind = canHandleInstantly(cleaned);
        const incomplete = INCOMPLETE_PREFIX_RE.test(cleaned);
        // Prioritaskan alternatif yang cocok perintah utuh + confidence tinggi
        let score = conf * 10 - a * 0.5;
        if (kind === 'cmd' && !incomplete) score += 100;
        else if (kind === 'wake' || kind === 'sleep') score += 50;
        if (WAKE_RE.test(cleaned)) score += 15;
        candidates.push({ text: cleaned, raw: rawSlice, conf, kind, incomplete, score });
      }

      if (!candidates.length) return;
      candidates.sort((x, y) => y.score - x.score);

      const best = candidates[0];
      const altTails = candidates.map((c) => c.text);
      const activeText = best.text;
      const matchedCmdAlt = candidates.find((c) => c.kind === 'cmd' && !c.incomplete)?.text || null;
      const displayText = matchedCmdAlt || activeText;
      setTranscript(displayText);

      const hasWake = altTails.some((t) => WAKE_RE.test(t));

      // 1) Jalur instan lokal (jari, warna/mode LED, kontrol UI):
      //    - Jika isFinal -> langsung eksekusi seketika (0ms).
      //    - Jika interim -> tunggu stabilisasi singkat 150ms agar ucapan 2-3 kata ("strip 2 red", "open led control") tidak terpotong di tengah!
      clearTimeout(interimCmdTimerRef.current);
      if (awakeRef.current && matchedCmdAlt) {
        clearTimeout(interimAiTimerRef.current);
        if (res.isFinal) {
          executeLocal(matchedCmdAlt, segIdx, rawWordCount, now, hasWake);
        } else {
          const capturedCmd = matchedCmdAlt;
          const capturedWords = rawWordCount;
          const capturedWake = hasWake;
          interimCmdTimerRef.current = setTimeout(() => {
            if (!activeRef.current || thinkingRef.current || pausedForTtsRef.current) return;
            executeLocal(capturedCmd, segIdx, capturedWords, performance.now(), capturedWake);
          }, 150);
        }
        return;
      }

      // 2) Sapaan ("Robohand"), standby, atau pertanyaan bebas ke Gemini AI
      const dispatchFinalOrDebounced = () => {
        if (!activeRef.current || thinkingRef.current || pausedForTtsRef.current) return;
        if (!awakeRef.current && !hasWake) return;

        const prevAi = lastAiSegRef.current;
        if (prevAi.segIdx === segIdx && (prevAi.text === displayText || performance.now() - prevAi.time < 1800)) return;
        lastAiSegRef.current = { segIdx, text: displayText, time: performance.now() };

        const matchedInstant = candidates.find((c) => c.kind)?.text || null;
        if (matchedInstant) {
          executeLocal(matchedInstant, segIdx, rawWordCount, performance.now(), hasWake);
          return;
        }

        // Tolak noise ber-confidence sangat rendah atau 1 kata acak tak jelas agar AI tidak salah tangkap suara latar
        const activeWords = activeText.split(/\s+/).filter(Boolean);
        if (res.isFinal && primaryConf > 0 && primaryConf < 0.35 && !hasWake) {
          return;
        }
        if (activeWords.length === 1 && !/^(hello|hi|hey|halo|hai|thanks|thank|jarvis|robohand)$/i.test(activeText)) {
          return;
        }

        if (aiActiveRef.current) {
          askJarvisAi(activeText, altTails.slice(0, 4), segIdx, rawWordCount, hasWake);
        } else {
          executeLocal(activeText, segIdx, rawWordCount, performance.now(), hasWake);
        }
      };

      clearTimeout(interimAiTimerRef.current);
      if (res.isFinal) {
        dispatchFinalOrDebounced();
      } else if (awakeRef.current || hasWake) {
        // Beri jeda yang pas agar user selesai bicara 1 kalimat utuh sebelum dikirim ke Gemini AI
        const instantProbe = candidates.find((c) => c.kind);
        const waitMs = instantProbe ? 380 : QUESTION_RE.test(displayText) ? 750 : 880;
        interimAiTimerRef.current = setTimeout(dispatchFinalOrDebounced, waitMs);
      }
    };

    r.onerror = (e) => {
      const code = e?.error;
      const ve = DICT[getLang()].voiceErr;
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError(ve.blocked);
        stop(true);
      } else if (code === 'audio-capture') {
        setError(ve.noMic);
        stop(true);
      } else if (code === 'language-not-supported') {
        if (langRef.current !== 'en-US') {
          langRef.current = 'en-US';
        } else {
          setError(ve.langUnsupported);
          stop(true);
        }
      } else if (code === 'network') {
        netErrCountRef.current += 1;
        setError(ve.network);
        if (netErrCountRef.current >= 2) stop(true);
      } else if (code) {
        setError(ve.startFail(code));
        stop(true);
      }
    };

    r.onend = () => {
      if (pausedForTtsRef.current) return;
      setMicReady(false);
      if (!activeRef.current) return;
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (activeRef.current && !pausedForTtsRef.current) startRec();
      }, 240);
    };

    try {
      r.start();
    } catch (err) {
      setError('Gagal menyalakan mikrofon: ' + (err?.message || err));
      stop(true);
    }
  }, [askJarvisAi, executeLocal, stop]);
  startRecRef.current = startRec;

  const startMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      meterStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      const label = track?.label || 'Mikrofon default';
      setMicName(label);

      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        meterCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        meterTimerRef.current = setInterval(() => {
          if (!activeRef.current) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          const pct = Math.min(100, Math.round(rms * 360));
          setMicLevel(pct);
          if (pct > peakLevelRef.current) peakLevelRef.current = pct;

          const now = performance.now();
          const elapsed = now - startedAtRef.current;

          if (!heardResultRef.current) {
            const ve = DICT[getLang()].voiceErr;
            if (track?.muted || (elapsed > 3500 && peakLevelRef.current < 2)) {
              setWarning(ve.micSilent(label));
            } else if (pct >= 10) {
              if (!loudSinceRef.current) loudSinceRef.current = now;
              const loudFor = now - loudSinceRef.current;
              if (loudFor > 3500 && !fallbackTriedRef.current) {
                fallbackTriedRef.current = true;
                continuousRef.current = false;
                try { recRef.current?.stop(); } catch { }
              } else if (loudFor > 7500) {
                setWarning(ve.speechStall(label));
              }
            }
          }
        }, 90);
      }
      return true;
    } catch (err) {
      const ve = DICT[getLang()].voiceErr;
      const name = err?.name || '';
      if (name === 'NotAllowedError') {
        setError(ve.blocked);
        stop(true);
        return false;
      }
      if (name === 'NotFoundError') {
        setError(ve.noMic);
        stop(true);
        return false;
      }
      return true;
    }
  }, [stop]);

  const start = useCallback(async () => {
    const ve = DICT[getLang()].voiceErr;
    if (!supported) {
      setError(ve.unsupported);
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError(ve.insecure);
      return;
    }
    setError('');
    setWarning('');
    setTranscript('');
    setReplyText('');
    setLastAction('');
    setMicName('');
    historyRef.current = [];
    lastAiSegRef.current = { segIdx: -1, text: '', time: 0 };
    pausedForTtsRef.current = false;
    lastSpokenRef.current = { text: '', time: 0 };
    netErrCountRef.current = 0;
    langRef.current = getSttLang();
    continuousRef.current = true;
    fallbackTriedRef.current = false;
    heardResultRef.current = false;
    peakLevelRef.current = 0;
    loudSinceRef.current = 0;
    startedAtRef.current = performance.now();
    activeRef.current = true;
    lastExecRef.current = { key: '', time: 0, segIdx: -1, wordCount: 0 };
    setListening(true);
    setMicReady(false);
    setMicStage('starting');

    onWakeChimeRef.current?.();
    // Siapkan elemen Audio di dalam klik pengguna agar Chrome mengizinkan pemutaran suara pria /api/tts
    if (typeof window !== 'undefined' && !audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.getVoices();
      } catch { }
    }

    // Langsung siap menerima perintah maupun pertanyaan begitu dinyalakan (cukup panggil "Robohand" jika sedang standby)
    awakeRef.current = true;
    setAwake(true);

    // Nyalakan SpeechRecognition SEGERA (tanpa menunggu getUserMedia!) agar mulai mendengar dalam <100ms
    startRec();
    // Jalankan monitor level mik secara paralel di belakang layar (non-blocking)
    startMeter();
  }, [supported, startMeter, startRec]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop(false);
    else start();
  }, [start, stop]);

  useEffect(() => () => stop(false), [stop]);

  return {
    supported,
    listening,
    micReady,
    micStage,
    micLevel,
    micName,
    awake,
    thinking,
    speaking,
    aiConfigured,
    transcript,
    replyText,
    lastAction,
    warning,
    error,
    toggle,
  };
}
