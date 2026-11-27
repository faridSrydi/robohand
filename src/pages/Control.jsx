import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Page } from '../components/Layout';
import LoginModal from '../components/LoginModal';
import { FINGER_NAMES, RATIO_PAIRS } from '../lib/hand';
import { sfx } from '../lib/sound';
import { loadLedCfg, saveLedCfg } from '../lib/led';
import { setAppTheme } from '../lib/theme';
import { setAppLang, useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useRobotSocket } from '../control/useRobotSocket';
import { useHandTracking } from '../control/useHandTracking';
import { useVoiceControl } from '../control/useVoiceControl';
import { useDanceMode } from '../control/useDanceMode';
import CalibrationWizard from '../control/CalibrationWizard';
import LedStripPanel from '../control/LedStripPanel';

const DOCK_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 };

const DEFAULT_CAL = { open: [1.8, 1.9, 1.9, 1.9, 1.8], closed: [0.9, 0.8, 0.8, 0.8, 0.8] };
const DEFAULT_OPEN = 0;
const DEFAULT_CLOSE = 180;
const DEFAULT_THUMB = { neutral: 1500, power: 250, dir: 1, closeMs: 800, openMs: 800 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Preset cepat (0 = terbuka, 100 = menutup). Urutan: Jempol, Telunjuk, Tengah, Manis, Kelingking.
const SHORTCUT_COUNTS = [0, 1, 2, 3, 4, 5];
const SHORTCUT_PRESETS = [
  { id: 'dua', label: '✌️', title: '2 Jari (telunjuk & tengah terbuka)', pose: [100, 0, 0, 100, 100] },
  { id: 'fu', label: '🖕', title: 'Jari tengah terbuka', pose: [100, 100, 0, 100, 100] },
  { id: 'teknik', label: '🤘', title: 'Jari Teknik (jempol, telunjuk & kelingking terbuka)', pose: [0, 0, 100, 100, 0] },
];
const samePose = (a, b) => a.every((v, i) => Math.round(v) === b[i]);

const defaultServoLimits = () => FINGER_NAMES.map(() => ({ open: DEFAULT_OPEN, close: DEFAULT_CLOSE }));

function loadServoLimits() {
  try {
    const saved = JSON.parse(localStorage.getItem('servoLimits'));
    if (Array.isArray(saved) && saved.length === 5 && saved.every((s) => typeof s?.open === 'number' && typeof s?.close === 'number')) {
      return saved;
    }
    const legacy = JSON.parse(localStorage.getItem('servoCal'));
    if (Array.isArray(legacy?.open) && legacy.open.length === 5 && Array.isArray(legacy?.close) && legacy.close.length === 5) {
      return legacy.open.map((o, i) => ({ open: Number(o) || DEFAULT_OPEN, close: Number(legacy.close[i]) || DEFAULT_CLOSE }));
    }
  } catch {
    /* data rusak: pakai default */
  }
  return defaultServoLimits();
}

function loadThumbCfg() {
  try {
    const saved = JSON.parse(localStorage.getItem('thumbCfg'));
    if (saved && typeof saved.neutral === 'number') return { ...DEFAULT_THUMB, ...saved };
    const legacy = JSON.parse(localStorage.getItem('servoCal'));
    if (legacy?.thumb && typeof legacy.thumb.neutral === 'number') return { ...DEFAULT_THUMB, ...legacy.thumb };
  } catch {
    /* data rusak: pakai default */
  }
  return { ...DEFAULT_THUMB };
}

function loadCal() {
  try {
    const saved = JSON.parse(localStorage.getItem('handCal'));
    if (saved && saved.open?.length === 5 && saved.closed?.length === 5) return saved;
  } catch {
    /* data rusak: pakai default */
  }
  return structuredClone(DEFAULT_CAL);
}

// Urutan: [Jempol, Telunjuk, Tengah, Manis, Kelingking] (0 = buka, 100 = tutup)
const COUNT_POSES = [
  [100, 100, 100, 100, 100], // 0: kepal
  [100, 0, 100, 100, 100],   // 1: telunjuk
  [100, 0, 0, 100, 100],     // 2: telunjuk + tengah
  [100, 0, 0, 0, 100],       // 3: telunjuk + tengah + manis
  [100, 0, 0, 0, 0],         // 4: 4 jari tanpa jempol
  [0, 0, 0, 0, 0],           // 5: semua terbuka
];
const countPose = (n) => COUNT_POSES[Math.max(0, Math.min(5, n))];

// Urutan Mode Demo otomatis: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> Peace -> Tengah -> Teknik -> ulang terus
// Tiap langkah juga mengganti animasi/warna LED secara halus & serasi.
const DEMO_STEPS = [
  { pose: COUNT_POSES[0], preset: false, led: { strip: 0, mode: 0, r: 255, g: 170, b: 30, speed: 45, rgb: false } },
  { pose: COUNT_POSES[1], preset: false, led: { strip: 0, mode: 1, r: 0, g: 229, b: 255, speed: 45, rgb: false } },
  { pose: COUNT_POSES[2], preset: false, led: { strip: 0, mode: 8, r: 43, g: 127, b: 255, speed: 45, rgb: false } },
  { pose: COUNT_POSES[3], preset: false, led: { strip: 0, mode: 3, speed: 45, rgb: false } },
  { pose: COUNT_POSES[4], preset: false, led: { strip: 0, mode: 2, r: 34, g: 197, b: 94, speed: 40, rgb: false } },
  { pose: COUNT_POSES[5], preset: false, led: { strip: 0, mode: 6, r: 168, g: 85, b: 247, speed: 45, rgb: false } },
  { pose: [100, 0, 0, 100, 100], preset: true, led: { strip: 0, mode: 5, r: 255, g: 79, b: 163, speed: 45, rgb: false } },
  { pose: [100, 100, 0, 100, 100], preset: true, led: { strip: 0, mode: 7, speed: 45, rgb: false } },
  { pose: [0, 0, 100, 100, 0], preset: true, led: { strip: 0, mode: 9, speed: 45, rgb: true } },
];

function formatUptime(sec) {
  if (typeof sec !== 'number' || sec < 0) return '--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad2 = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

// Rasio jarak landmark. Kecil = menekuk, besar = lurus.
function ratios(lm, W, H) {
  const dist = (p, q) =>
    Math.hypot((lm[p].x - lm[q].x) * W, (lm[p].y - lm[q].y) * H, (lm[p].z - lm[q].z) * W);
  return RATIO_PAIRS.map((f) => dist(f.a, f.b) / dist(f.c, f.d));
}

export default function Control() {
  const navigate = useNavigate();
  const { lang, tr } = useI18n();
  const c = tr.ctl;
  const fingerNames = tr.fingers;
  const auth = useAuth();
  const canControl = !auth.loginEnabled || auth.authenticated;
  const socket = useRobotSocket({ enabled: canControl });
  const { connected, status, ports, cfg, pos, health, pingMs, error, send, sendJson } = socket;

  const [cal, setCal] = useState(loadCal);
  const [servoLimits, setServoLimits] = useState(loadServoLimits);
  const [thumbCfg, setThumbCfg] = useState(loadThumbCfg);
  const [angles, setAngles] = useState([0, 0, 0, 0, 0]);
  const [mode, setMode] = useState('track');
  const [binary, setBinary] = useState(true);
  const [smooth, setSmooth] = useState(45);
  const [speed, setSpeed] = useState(120);
  const [autoBright, setAutoBright] = useState(true);
  const [manualBright, setManualBright] = useState(100);
  const [detected, setDetected] = useState(false);
  const [wizIndex, setWizIndex] = useState(null);
  const [camSettingsOpen, setCamSettingsOpen] = useState(false);
  const [servoOpen, setServoOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [danceOpen, setDanceOpen] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [countingTo, setCountingTo] = useState(0); // 0 = idle, 2..5 = sedang menghitung 1..n
  const [relaxed, setRelaxed] = useState(false);
  const [ledStudioOpen, setLedStudioOpen] = useState(false);
  const ledStudioOpenRef = useRef(false);
  ledStudioOpenRef.current = ledStudioOpen;
  const [ledStripTarget, setLedStripTarget] = useState(0); // 0 = both, 1 = strip 1, 2 = strip 2
  const ledStripTargetRef = useRef(0);
  ledStripTargetRef.current = ledStripTarget;
  const demoTimerRef = useRef(null);
  const demoIdxRef = useRef(0);
  const countTimersRef = useRef([]);
  const savedSpeedRef = useRef(null);
  const speedRef = useRef(120);
  speedRef.current = speed;
  const danceStopRef = useRef(null);
  const danceFileInputRef = useRef(null);
  const [panelClosed, setPanelClosed] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches
  );
  const [note, setNote] = useState('');
  const [portChoice, setPortChoice] = useState('');

  // Nilai yang dibaca di dalam callback tracking (selalu terbaru tanpa re-subscribe).
  const anglesRef = useRef([0, 0, 0, 0, 0]);
  const curlRef = useRef([0, 0, 0, 0, 0]);
  const closedRef = useRef([false, false, false, false, false]);
  const modeRef = useRef('track');
  const binaryRef = useRef(true);
  const smoothRef = useRef(0.45);
  const calRef = useRef(cal);
  const wizRef = useRef(null);
  const lastRawRef = useRef(null);
  const lastMsgRef = useRef('');
  const lastSentRef = useRef(0);
  const speedDraggingRef = useRef(false);
  const detectedRef = useRef(false);

  calRef.current = cal;
  modeRef.current = mode;
  binaryRef.current = binary;
  smoothRef.current = smooth / 100;
  wizRef.current = wizIndex;

  const sendAngles = useCallback(
    (arr, force = false) => {
      if (wizRef.current !== null) return;
      const msg = arr.map((v) => Math.round(v)).join(',');
      if (!force && msg === lastMsgRef.current) return;
      const now = performance.now();
      if (!force && now - lastSentRef.current < 40) return;
      lastMsgRef.current = msg;
      lastSentRef.current = now;
      send(msg);
    },
    [send]
  );

  const setAllAngles = (arr, force = false) => {
    anglesRef.current = arr;
    setAngles(arr);
    sendAngles(arr, force);
  };

  const handleLandmarks = (lm, W, H) => {
    const hasHand = !!lm;
    if (hasHand !== detectedRef.current) {
      detectedRef.current = hasHand;
      setDetected(hasHand);
    }
    if (!lm) return;
    const raw = ratios(lm, W, H);
    lastRawRef.current = raw;
    if (modeRef.current !== 'track' || wizRef.current !== null) return;

    const c = calRef.current;
    const next = [...anglesRef.current];
    raw.forEach((r, i) => {
      const curl = clamp01((c.open[i] - r) / (c.open[i] - c.closed[i]));
      curlRef.current[i] += (curl - curlRef.current[i]) * smoothRef.current;
      if (binaryRef.current) {
        // Hysteresis: jeda 0.4-0.6 agar tidak bolak-balik di tengah.
        if (!closedRef.current[i] && curlRef.current[i] > 0.6) closedRef.current[i] = true;
        else if (closedRef.current[i] && curlRef.current[i] < 0.4) closedRef.current[i] = false;
        next[i] = closedRef.current[i] ? 100 : 0;
      } else {
        next[i] = curlRef.current[i] * 100;
      }
    });
    if (next.some((v, i) => Math.round(v) !== Math.round(anglesRef.current[i]))) {
      setAllAngles(next);
    }
  };

  const tracking = useHandTracking({
    onLandmarks: handleLandmarks,
    brightness: { auto: autoBright, manual: manualBright / 100 },
  });
  const { videoRef, canvasRef, state: camState, message: camMessage, gain, start, stop } = tracking;

  // Sinkronkan slider kecepatan, sudut buka/tutup 4 jari, dan kalibrasi jempol 360° dari ESP32.
  useEffect(() => {
    if (!cfg) return;
    if (!speedDraggingRef.current && typeof cfg.speed === 'number') setSpeed(Math.round(cfg.speed));
    if (Array.isArray(cfg.servos) && cfg.servos.length === 5) {
      const next = cfg.servos.map((s) => ({ open: s.open, close: s.close }));
      setServoLimits(next);
      try {
        localStorage.setItem('servoLimits', JSON.stringify(next));
      } catch {
        /* abaikan */
      }
    }
    if (cfg.thumb && typeof cfg.thumb.neutral === 'number') {
      const nextThumb = { ...DEFAULT_THUMB, ...cfg.thumb };
      setThumbCfg(nextThumb);
      try {
        localStorage.setItem('thumbCfg', JSON.stringify(nextThumb));
      } catch {
        /* abaikan */
      }
    }
  }, [cfg]);

  const saveServoLimit = (index, openVal, closeVal) => {
    if (index < 1 || index > 4) return;
    setServoLimits((prev) => {
      const next = prev.map((item, i) => (i === index ? { open: openVal, close: closeVal } : item));
      try {
        localStorage.setItem('servoLimits', JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
    send(`A,${index},${openVal},${closeVal}`);
  };

  const saveThumbCfg = (next) => {
    const clean = {
      neutral: Math.round(next.neutral),
      power: Math.round(next.power),
      dir: next.dir < 0 ? -1 : 1,
      closeMs: Math.min(20000, Math.max(100, Math.round(next.closeMs))),
      openMs: Math.min(20000, Math.max(100, Math.round(next.openMs))),
    };
    setThumbCfg(clean);
    try {
      localStorage.setItem('thumbCfg', JSON.stringify(clean));
    } catch {
      /* abaikan */
    }
    send(`C,${clean.neutral},${clean.power},${clean.dir},${clean.closeMs},${clean.openMs}`);
    send('Z,0');
  };

  const onToggleBinary = (checked) => {
    setBinary(checked);
    binaryRef.current = checked;
    closedRef.current = anglesRef.current.map((a) => a >= 50);
    const next = checked ? anglesRef.current.map((a) => (a >= 50 ? 100 : 0)) : anglesRef.current;
    curlRef.current = next.map((a) => a / 100);
    setAllAngles(next, true);
  };

  const onSlider = (i, v) => {
    const next = [...anglesRef.current];
    next[i] = v;
    stopDemo();
    stopCount();
    danceStopRef.current?.();
    setRelaxed(false);
    setAllAngles(next, true);
  };

  // Sinkronkan status relax servo dari telemetri health ESP32
  useEffect(() => {
    if (health && typeof health.relaxed === 'boolean') {
      setRelaxed(health.relaxed);
    }
  }, [health]);

  const restoreSmoothSpeed = useCallback(() => {
    if (savedSpeedRef.current != null) {
      const prevSp = savedSpeedRef.current;
      savedSpeedRef.current = null;
      send(`V,${prevSp}`);
    }
  }, [send]);

  const stopCount = useCallback(
    (restoreSp = true) => {
      countTimersRef.current.forEach((id) => clearTimeout(id));
      countTimersRef.current = [];
      setCountingTo(0);
      if (restoreSp) restoreSmoothSpeed();
    },
    [restoreSmoothSpeed]
  );

  const stopDemo = useCallback(
    (restoreSp = true) => {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
      setDemoRunning(false);
      if (restoreSp) restoreSmoothSpeed();
    },
    [restoreSmoothSpeed]
  );

  // Shortcut gerakan servo (bisa dipakai langsung meski kamera mati; jika tracking aktif, otomatis pindah ke manual).
  const applyShortcut = (pose, isPreset = false, { fromAuto = false } = {}) => {
    if (!fromAuto) {
      stopDemo();
      stopCount();
      danceStopRef.current?.();
    }
    setRelaxed(false);
    if (camState === 'on' && modeRef.current === 'track') {
      setMode('manual');
      modeRef.current = 'manual';
    }
    closedRef.current = pose.map((v) => v >= 50);
    curlRef.current = pose.map((v) => v / 100);
    setAllAngles([...pose], true);
    if (isPreset) sfx.pattern();
    else sfx.click();
  };
  const applyShortcutRef = useRef(applyShortcut);
  applyShortcutRef.current = applyShortcut;

  const applyVoiceLed = useCallback(
    (patch, ensureOn = false) => {
      const prev = loadLedCfg();
      const hasExplicitStrip = patch.strip === 0 || patch.strip === 1 || patch.strip === 2;
      const targetStrip = hasExplicitStrip ? patch.strip : ledStripTargetRef.current; // 0 = kedua strip, 1 = strip 1, 2 = strip 2
      if (hasExplicitStrip) setLedStripTarget(targetStrip);
      const { strip: _drop, brightDelta, speedDelta, ...cleanPatch } = patch;

      const updateOne = (base) => {
        const hasColor =
          typeof cleanPatch.r === 'number' || typeof cleanPatch.g === 'number' || typeof cleanPatch.b === 'number';
        const baseIsOwnColor = base.mode === 3 || base.mode === 7 || base.mode === 10;
        let nextMode = cleanPatch.mode ?? base.mode;
        if (cleanPatch.mode == null) {
          if ((hasColor || cleanPatch.rgb) && baseIsOwnColor) nextMode = 1;
          else if (ensureOn && base.mode === 10) nextMode = 0;
        }
        const nextBright =
          typeof cleanPatch.bright === 'number'
            ? Math.max(1, Math.min(255, Math.round(cleanPatch.bright)))
            : typeof brightDelta === 'number'
              ? Math.max(10, Math.min(255, Math.round(base.bright + brightDelta)))
              : base.bright;
        const nextSpeed =
          typeof cleanPatch.speed === 'number'
            ? Math.max(1, Math.min(100, Math.round(cleanPatch.speed)))
            : typeof speedDelta === 'number'
              ? Math.max(1, Math.min(100, Math.round(base.speed + speedDelta)))
              : base.speed;

        return {
          ...base,
          ...cleanPatch,
          mode: nextMode,
          bright: nextBright,
          speed: nextSpeed,
        };
      };

      const next =
        targetStrip === 1
          ? [updateOne(prev[0]), prev[1]]
          : targetStrip === 2
            ? [prev[0], updateOne(prev[1])]
            : (() => {
                const s = updateOne(prev[0]);
                return [s, { ...s }];
              })();

      saveLedCfg(next);
      const sent = targetStrip === 2 ? next[1] : next[0];
      send(`L,${targetStrip},${sent.mode},${sent.r},${sent.g},${sent.b},${sent.bright},${sent.speed},${sent.rgb ? 1 : 0}`);
    },
    [send]
  );

  // Mode Auto Demo: 0-5 -> Peace -> Tengah -> Teknik + ganti animasi LED otomatis (smooth & tidak terlalu cepat)
  const startDemo = useCallback(() => {
    stopCount(false);
    danceStopRef.current?.();
    clearTimeout(demoTimerRef.current);
    setRelaxed(false);
    if (modeRef.current !== 'manual') {
      setMode('manual');
      modeRef.current = 'manual';
    }
    // Batasi kecepatan servo ke 90°/dtk selama demo agar gerakan halus, lembut, dan tidak menghentak
    if (savedSpeedRef.current == null && speedRef.current > 95) {
      savedSpeedRef.current = speedRef.current;
      send('V,90');
    }
    setDemoRunning(true);
    demoIdxRef.current = 0;

    const runStep = () => {
      const step = DEMO_STEPS[demoIdxRef.current % DEMO_STEPS.length];
      demoIdxRef.current = (demoIdxRef.current + 1) % DEMO_STEPS.length;
      applyShortcutRef.current(step.pose, step.preset, { fromAuto: true });
      applyVoiceLed(step.led, true);
      demoTimerRef.current = setTimeout(runStep, 2150);
    };
    runStep();
  }, [applyVoiceLed, send, stopCount]);

  // Hitung berurutan 1 -> n (mis. 1-3 atau 1-5) secara halus lalu bunyikan buzzer ESP32 saat selesai
  const startCount = useCallback(
    (maxN) => {
      const targetN = Math.max(2, Math.min(5, Math.round(maxN)));
      stopDemo(false);
      stopCount(false);
      danceStopRef.current?.();
      setRelaxed(false);
      if (modeRef.current !== 'manual') {
        setMode('manual');
        modeRef.current = 'manual';
      }
      if (savedSpeedRef.current == null && speedRef.current > 105) {
        savedSpeedRef.current = speedRef.current;
        send('V,95');
      }
      setCountingTo(targetN);

      const STEP_MS = 1350;
      const timers = [];
      for (let k = 1; k <= targetN; k += 1) {
        timers.push(
          setTimeout(() => {
            applyShortcutRef.current(countPose(k), false, { fromAuto: true });
          }, (k - 1) * STEP_MS)
        );
      }
      // Selesai menghitung -> bunyikan buzzer ESP32 & pulihkan kecepatan semula
      timers.push(
        setTimeout(() => {
          send('B,2');
          sfx.pattern();
          setCountingTo(0);
          countTimersRef.current = [];
          restoreSmoothSpeed();
        }, (targetN - 1) * STEP_MS + 1150)
      );
      countTimersRef.current = timers;
    },
    [restoreSmoothSpeed, send, stopCount, stopDemo]
  );

  // Relax servo (R,1 = lepas torsi/detach agar dingin & hemat baterai; R,0 = aktifkan lagi)
  const setRelaxState = useCallback(
    (nextRelax) => {
      if (nextRelax) {
        stopDemo();
        stopCount();
        danceStopRef.current?.();
        if (modeRef.current !== 'manual') {
          setMode('manual');
          modeRef.current = 'manual';
        }
      }
      setRelaxed(nextRelax);
      sfx.toggle(!nextRelax);
      send(nextRelax ? 'R,1' : 'R,0');
    },
    [send, stopCount, stopDemo]
  );

  // Mode Tarian mengikuti beat lagu (anti-stall: maks tekukan 72%, jempol aman terbuka, kecepatan dibatasi 140°/dtk)
  const dance = useDanceMode({
    onBeforeStart: () => {
      stopDemo(false);
      stopCount(false);
      setRelaxed(false);
      if (modeRef.current !== 'manual') {
        setMode('manual');
        modeRef.current = 'manual';
      }
      if (savedSpeedRef.current == null && speedRef.current > 145) {
        savedSpeedRef.current = speedRef.current;
        send('V,140');
      } else if (speedRef.current < 110 && savedSpeedRef.current == null) {
        savedSpeedRef.current = speedRef.current;
        send('V,140');
      }
      setDanceOpen(true);
    },
    onPose: (pose) => applyShortcutRef.current(pose, false, { fromAuto: true }),
    onLed: (patch) => applyVoiceLed(patch, true),
    onStopDone: () => {
      restoreSmoothSpeed();
      applyShortcutRef.current(COUNT_POSES[5], false, { fromAuto: true });
    },
  });
  danceStopRef.current = dance.stop;

  useEffect(() => () => {
    clearTimeout(demoTimerRef.current);
    countTimersRef.current.forEach((id) => clearTimeout(id));
  }, []);

  const applyVoiceUi = (ui) => {
    if (!ui || typeof ui !== 'object') return;
    if (ui.camera === 'open' && camState !== 'on' && camState !== 'starting') start();
    else if (ui.camera === 'close' && (camState === 'on' || camState === 'starting')) stop();

    if (ui.panel === 'open' && panelClosed) {
      sfx.toggle(true);
      setPanelClosed(false);
    } else if (ui.panel === 'close') {
      // Jika Studio 3D LED sedang terbuka penuh di layar, "close panel" menutup Studio LED lebih dulu
      if (ledStudioOpenRef.current) {
        sfx.toggle(false);
        setLedStudioOpen(false);
      } else if (!panelClosed) {
        sfx.toggle(false);
        setPanelClosed(true);
      }
    }

    if (ui.ledStrip === 0 || ui.ledStrip === 1 || ui.ledStrip === 2) {
      sfx.toggle(true);
      setLedStripTarget(ui.ledStrip);
    }

    if (ui.ledPanel === 'open') {
      sfx.toggle(true);
      setLedStudioOpen(true);
    } else if (ui.ledPanel === 'close') {
      sfx.toggle(false);
      setLedStudioOpen(false);
    }

    if (ui.mode === 'track' || ui.mode === 'manual') {
      setMode(ui.mode);
      modeRef.current = ui.mode;
    }

    if (ui.connection === 'wifi') {
      sendJson({ type: 'mode', mode: 'wifi' });
    } else if (ui.connection === 'serial') {
      sendJson({ type: 'mode', mode: 'serial' });
      sendJson({ type: 'ports' });
    }

    if (ui.servoCal === 'open') {
      setPanelClosed(false);
      setServoOpen(true);
    } else if (ui.servoCal === 'close') {
      setServoOpen(false);
    }

    if (ui.theme === 'dark' || ui.theme === 'light') {
      sfx.toggle(ui.theme === 'dark');
      setAppTheme(ui.theme);
    }

    if (ui.lang === 'en' || ui.lang === 'id') {
      sfx.toggle(true);
      setAppLang(ui.lang);
    }

    if (typeof ui.fingerSpeed === 'number') {
      const sp = Math.max(30, Math.min(360, Math.round(ui.fingerSpeed)));
      setSpeed(sp);
      send(`V,${sp}`);
    } else if (typeof ui.fingerSpeedDelta === 'number') {
      setSpeed((prev) => {
        const sp = Math.max(30, Math.min(360, Math.round(prev + ui.fingerSpeedDelta)));
        send(`V,${sp}`);
        return sp;
      });
    }

    if (typeof ui.smooth === 'number') {
      const sm = Math.max(5, Math.min(100, Math.round(ui.smooth)));
      setSmooth(sm);
      smoothRef.current = sm / 100;
    }

    if (typeof ui.binary === 'boolean') {
      onToggleBinary(ui.binary);
    }

    if (typeof ui.autoBright === 'boolean') {
      setAutoBright(ui.autoBright);
    }
    if (typeof ui.camBright === 'number') {
      setAutoBright(false);
      setManualBright(Math.max(100, Math.min(500, Math.round(ui.camBright))));
    }

    if (ui.demo === 'start') {
      startDemo();
    } else if (ui.demo === 'stop') {
      stopDemo();
    }

    if (typeof ui.relax === 'boolean') {
      setRelaxState(ui.relax);
    }

    if (typeof ui.countTo === 'number') {
      startCount(ui.countTo);
    }

    if (ui.dance === 'start') {
      dance.start();
    } else if (ui.dance === 'stop') {
      dance.stop();
    }
  };

  const voice = useVoiceControl({
    enabled: canControl,
    onPose: (pose, preset) => applyShortcut(pose, preset),
    onLed: applyVoiceLed,
    onUi: applyVoiceUi,
    onWakeChime: () => sfx.toggle(true),
    getState: () => ({
      pose: anglesRef.current,
      led: loadLedCfg()[0],
      camera: camState,
      panelOpen: !panelClosed,
      ledStudioOpen: ledStudioOpenRef.current,
      theme: document.documentElement.dataset.theme || 'dark',
      mode: modeRef.current,
    }),
  });

  // Tes kalibrasi: kirim nilai tutup (1) atau buka (0) ke jari yang sedang dikalibrasi.
  const testFinger = (value) => {
    const i = wizRef.current;
    if (i === null) return;
    const next = [...anglesRef.current];
    next[i] = value * 100;
    anglesRef.current = next;
    setAngles(next);
    const msg = next.map((v) => Math.round(v)).join(',');
    lastMsgRef.current = msg;
    send(msg);
  };

  const openCal = (i) => {
    setWizIndex(i);
    wizRef.current = i;
  };

  const closeWizard = () => {
    setWizIndex(null);
    wizRef.current = null;
    lastMsgRef.current = '';
    sendAngles(anglesRef.current, true);
  };

  const saveCal = (next) => {
    setCal(next);
    calRef.current = next;
    try {
      localStorage.setItem('handCal', JSON.stringify(next));
    } catch {
      /* penyimpanan diblokir: kalibrasi tetap berlaku di sesi ini */
    }
  };

  const calOpen = () => {
    if (!lastRawRef.current) return setNote(c.noHandCalNote);
    saveCal({ ...calRef.current, open: [...lastRawRef.current] });
    setNote(c.calOpenSaved);
  };
  const calFist = () => {
    if (!lastRawRef.current) return setNote(c.noHandCalNote);
    saveCal({ ...calRef.current, closed: [...lastRawRef.current] });
    setNote(c.calFistSaved);
  };
  const calReset = () => {
    saveCal(structuredClone(DEFAULT_CAL));
    setNote(c.calResetDone);
  };

  const setConnMode = (m) => sendJson({ type: 'mode', mode: m });
  const usb = status.mode === 'serial';
  const espOn = usb ? status.serial : status.esp > 0;

  const openA = servoLimits.map((s) => s.open);
  const closeA = servoLimits.map((s) => s.close);

  const badge =
    camState !== 'on'
      ? c.badgeCamOff
      : mode !== 'track'
        ? c.badgeManual
        : detected
          ? c.badgeTracking
          : c.badgeNoHand;

  const closePanel = () => {
    sfx.toggle(false);
    setPanelClosed(true);
  };
  const openPanel = () => {
    sfx.toggle(true);
    setPanelClosed(false);
  };

  // Tangkap dan lepaskan ports dari server saat mode USB dipilih.
  useEffect(() => {
    if (usb && ports.length && !portChoice) setPortChoice(ports[0].path);
  }, [usb, ports, portChoice]);

  const handleLogout = async () => {
    stopDemo();
    stopCount();
    dance.stop();
    try { stop(); } catch {}
    try { voice.stop(); } catch {}
    setLedStudioOpen(false);
    await auth.logout();
  };

  const rssiVal = health?.rssi;
  const wifiQuality = !espOn
    ? c.healthOffline
    : usb
      ? c.healthUsb
      : !rssiVal
        ? '--'
        : rssiVal >= -60
          ? c.sigStrong
          : rssiVal >= -72
            ? c.sigGood
            : rssiVal >= -82
              ? c.sigFair
              : c.sigWeak;
  const ledMaVal = espOn && typeof health?.ledMa === 'number' ? health.ledMa : null;
  const ledPct = ledMaVal != null ? Math.min(100, Math.round((ledMaVal / 3000) * 100)) : 0;
  const healthSummary = !connected
    ? c.healthOffline
    : `${pingMs != null ? `${pingMs} ms` : '--'}${espOn && !usb && rssiVal ? ` · ${rssiVal} dBm` : ''}`;

  const locked = auth.loginEnabled && !auth.authenticated;

  return (
    <Page className="sim-page">
      <div className={`ctl ${panelClosed ? 'is-panel-closed' : ''} ${locked ? 'is-locked' : ''}`} aria-hidden={locked}>
        <section className="ctl-cam">
          <div className="ctl-cam-inner">
            <div className="ctl-stage">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} />

              {camState === 'on' && (
                <button type="button" className="btn btn-sm ctl-stop" onClick={stop}>{c.stopCam}</button>
              )}

              {camState !== 'on' && (
                <div className="ctl-overlay">
                  <div>
                    <p>{camState === 'starting' ? c.openingCam : camMessage || c.camNotActive}</p>
                    <button type="button" className="btn btn-primary" onClick={start} disabled={camState === 'starting'}>
                      {camState === 'error' ? c.retry : c.startCam}
                    </button>
                  </div>
                </div>
              )}

              <span className="ctl-badge">{badge}</span>
            </div>

            <div
              className={`ctl-dock ${voice.listening ? (voice.awake ? 'is-awake' : 'is-standby') : ''}`}
              role="region"
              aria-label={c.dockAria}
            >
              <div className="ctl-dock-bar">
                <button
                  type="button"
                  className={`btn btn-sm ctl-voice-btn ${voice.listening ? (voice.awake ? 'is-awake' : 'is-standby') : ''}`}
                  onClick={voice.toggle}
                  disabled={!voice.supported}
                  aria-pressed={voice.listening}
                  title={voice.supported ? c.voiceTitle : c.voiceUnsupported}
                >
                  <span className="ctl-voice-dot" aria-hidden="true" />
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
                  </svg>
                  <span>
                    {!voice.listening
                      ? c.voiceOff
                      : !voice.micReady
                        ? c.voiceStarting
                        : voice.thinking
                          ? c.voiceThinking
                          : voice.speaking
                            ? c.voiceSpeaking
                            : voice.awake
                              ? c.voiceActive
                              : c.voiceStandby}
                  </span>
                </button>

                <span className="ctl-dock-sep" aria-hidden="true" />

                <div className="ctl-sc-group" role="group" aria-label={c.countAria}>
                  {SHORTCUT_COUNTS.map((n) => {
                    const p = countPose(n);
                    const active = samePose(angles, p);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`btn btn-sm ctl-sc-num ${active ? 'is-on' : ''}`}
                        aria-pressed={active}
                        title={n === 0 ? c.fistTitle : c.fingersOpenTitle(n)}
                        onClick={() => applyShortcut(p, false)}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>

                <span className="ctl-dock-sep" aria-hidden="true" />

                <div className="ctl-sc-group" role="group" aria-label={c.presetAria}>
                  {c.presets.map((pr) => {
                    const active = samePose(angles, pr.pose);
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        className={`btn btn-sm ctl-sc-preset ${active ? 'is-on' : ''}`}
                        aria-pressed={active}
                        aria-label={pr.title}
                        title={pr.title}
                        onClick={() => applyShortcut(pr.pose, true)}
                      >
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(voice.listening || voice.warning || voice.error) && (
                <div className="ctl-dock-voice" aria-live="polite">
                  {voice.listening && (
                    <div className="ctl-voice-feed">
                      <span className="ctl-voice-meter" title={c.micLevelTitle(voice.micName, voice.micLevel)}>
                        <i style={{ width: `${Math.max(4, voice.micLevel)}%` }} />
                      </span>
                      {voice.lastAction && <span className="ctl-voice-act">✓ {voice.lastAction}</span>}
                      <span className="ctl-voice-txt">
                        {voice.transcript
                          ? `"${voice.transcript}"`
                          : voice.micStage === 'speech' || voice.micStage === 'sound'
                            ? c.recognizing
                            : voice.micStage === 'audio'
                              ? voice.awake
                                ? c.readyHint
                                : c.standbyHint
                              : c.connectingMic}
                      </span>
                    </div>
                  )}
                  {voice.listening && voice.replyText && (
                    <p className="ctl-voice-reply">Robohand: &ldquo;{voice.replyText}&rdquo;</p>
                  )}
                  {voice.warning && <p className="ctl-note" style={{ color: 'var(--accent-text)' }}>{voice.warning}</p>}
                  {voice.error && <p className="ctl-note" style={{ color: '#d9534f' }}>{voice.error}</p>}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="ctl-panel" aria-label={c.panelAria} aria-hidden={panelClosed}>
          <div className="panel-scroll">
            <div className="panel-inner">
            <div className="panel-head">
              <div className="panel-head-top">
                <h2>{c.panelTitle}</h2>
                <div className="panel-head-actions">
                  {auth.loginEnabled && auth.authenticated && (
                    <button
                      type="button"
                      className="icon-btn panel-logout-btn"
                      onClick={handleLogout}
                      aria-label={tr.auth.logout}
                      title={`${tr.auth.logout}${auth.user?.username ? ` (${auth.user.username})` : ''}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn panel-close-btn"
                    onClick={closePanel}
                    aria-label={c.hidePanel}
                    title={c.hidePanel}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="status-pills">
                <span className={`pill ${connected ? 'is-on' : ''}`}><span className="dot" />{c.server}</span>
                <span className={`pill ${espOn ? 'is-on' : ''}`}><span className="dot" />{usb ? 'ESP32 (USB)' : 'ESP32 (WiFi)'}</span>
              </div>
            </div>

            <div className="segmented" role="group" aria-label={c.connAria}>
              <button type="button" aria-pressed={!usb} onClick={() => setConnMode('wifi')}>{c.wifi}</button>
              <button type="button" aria-pressed={usb} onClick={() => { setConnMode('serial'); sendJson({ type: 'ports' }); }}>{c.usb}</button>
            </div>

            {usb && (
              <div className="usb-box">
                <div className="field-row">
                  <select value={portChoice} onChange={(e) => setPortChoice(e.target.value)} disabled={status.serial} aria-label={c.serialPortAria}>
                    {ports.length === 0 && <option value="">{c.noPorts}</option>}
                    {ports.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={() => sendJson({ type: 'ports' })}>{c.refresh}</button>
                </div>
                <button
                  type="button"
                  className={status.serial ? 'btn' : 'btn btn-primary'}
                  onClick={() => status.serial
                    ? sendJson({ type: 'serial', action: 'close' })
                    : sendJson({ type: 'serial', action: 'open', path: portChoice })}
                  disabled={!status.serialAvailable || (!status.serial && !portChoice)}
                >
                  {status.serial ? c.disconnectCable : c.connectCable}
                </button>
                <p className="ctl-note muted">
                  {!status.serialAvailable
                    ? c.noSerialPkg
                    : status.serial
                      ? c.connectedVia(status.serialPath)
                      : c.usbHint}
                </p>
              </div>
            )}

            {error && <p className="ctl-note" style={{ color: '#d9534f' }}>{error}</p>}

            <div className="segmented" role="group" aria-label={c.modeAria}>
              <button
                type="button"
                aria-pressed={mode === 'track'}
                onClick={() => { stopDemo(); stopCount(); dance.stop(); setRelaxed(false); setMode('track'); }}
              >
                {c.handTracking}
              </button>
              <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>{c.manual}</button>
            </div>

            <div className="ctl-quick-tools" role="group" aria-label={c.quickToolsAria}>
              <button
                type="button"
                className={`ctl-tool-btn ${demoRunning ? 'is-active' : ''}`}
                aria-pressed={demoRunning}
                onClick={() => (demoRunning ? stopDemo() : startDemo())}
                title={c.demoTitle}
              >
                <span className="ctl-tool-dot" aria-hidden="true" />
                {demoRunning ? c.demoStop : c.demoStart}
              </button>
              <button
                type="button"
                className={`ctl-tool-btn ${dance.active ? 'is-active' : ''}`}
                aria-pressed={dance.active}
                onClick={() => dance.toggle()}
                title={c.danceTitle}
              >
                <span className={`ctl-tool-dot ${dance.beatFlash ? 'is-beat' : ''}`} aria-hidden="true" />
                {dance.active ? c.danceStop : c.danceStart}
              </button>
              <button
                type="button"
                className={`ctl-tool-btn ${relaxed ? 'is-warn' : ''}`}
                aria-pressed={relaxed}
                onClick={() => setRelaxState(!relaxed)}
                title={c.relaxTitle}
              >
                {relaxed ? c.relaxedBtn : c.relaxBtn}
              </button>
              <button
                type="button"
                className={`ctl-tool-btn ctl-tool-num ctl-tool-half ${countingTo === 3 ? 'is-active' : ''}`}
                aria-pressed={countingTo === 3}
                onClick={() => (countingTo === 3 ? stopCount() : startCount(3))}
                title={c.countTitle(3)}
              >
                {c.countBtn(3)}
              </button>
              <button
                type="button"
                className={`ctl-tool-btn ctl-tool-num ctl-tool-half ${countingTo === 5 ? 'is-active' : ''}`}
                aria-pressed={countingTo === 5}
                onClick={() => (countingTo === 5 ? stopCount() : startCount(5))}
                title={c.countTitle(5)}
              >
                {c.countBtn(5)}
              </button>
            </div>

            <section className={`led-box ${danceOpen ? 'is-open' : ''}`} aria-label={c.danceSection}>
              <button
                type="button"
                className="led-toggle"
                aria-expanded={danceOpen}
                aria-controls="dance-mode-body"
                onClick={() => setDanceOpen((v) => !v)}
              >
                <span className="led-toggle-left">
                  <span className={`health-dot ${dance.active ? (dance.beatFlash ? 'is-beat' : 'is-on') : ''}`} aria-hidden="true" />
                  <span className="led-toggle-title">{c.danceSection}</span>
                </span>
                <span className="health-summary-wrap">
                  <span className="health-summary">
                    {dance.active
                      ? `${lang === 'id' ? dance.pattern.nameId : dance.pattern.nameEn}${dance.bpm ? ` · ${dance.bpm} BPM` : ''}`
                      : dance.source === 'file' ? c.danceSrcFile : c.danceSrcMic}
                  </span>
                  <span className="led-chevron" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </span>
              </button>

              <div id="dance-mode-body" className="led-collapse" aria-hidden={!danceOpen}>
                <div className="led-collapse-inner">
                  <div className="dance-vis-row">
                    <div className={`dance-eq ${dance.beatFlash ? 'is-beat' : ''}`} aria-hidden="true">
                      {dance.bars.map((h, idx) => (
                        <span key={idx} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="dance-meta">
                      <strong>{dance.active ? (lang === 'id' ? dance.pattern.nameId : dance.pattern.nameEn) : c.danceIdle}</strong>
                      <span>{dance.active && dance.bpm ? `${dance.bpm} BPM` : c.danceSafeBadge}</span>
                    </div>
                    <button
                      type="button"
                      className={dance.active ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                      tabIndex={danceOpen ? 0 : -1}
                      onClick={() => dance.toggle()}
                    >
                      {dance.active ? c.danceStop : c.danceStart}
                    </button>
                  </div>

                  <div className="segmented" role="group" aria-label={c.danceSrcAria}>
                    <button
                      type="button"
                      tabIndex={danceOpen ? 0 : -1}
                      aria-pressed={dance.source === 'mic'}
                      onClick={() => dance.switchSource('mic')}
                    >
                      {c.danceSrcMic}
                    </button>
                    <button
                      type="button"
                      tabIndex={danceOpen ? 0 : -1}
                      aria-pressed={dance.source === 'file'}
                      onClick={() => dance.switchSource('file')}
                    >
                      {c.danceSrcFile}
                    </button>
                  </div>

                  {dance.source === 'file' && (
                    <div className="dance-file-row">
                      <input
                        ref={danceFileInputRef}
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) dance.selectFile(f);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        tabIndex={danceOpen ? 0 : -1}
                        onClick={() => danceFileInputRef.current?.click()}
                      >
                        {c.dancePickAudio}
                      </button>
                      <span className="dance-file-name">{dance.fileName || c.danceNoFile}</span>
                    </div>
                  )}

                  <div className="slider-row">
                    <label htmlFor="dance-sens">
                      {c.danceSens} <output>{dance.sensitivity}%</output>
                    </label>
                    <input
                      id="dance-sens"
                      className="slider"
                      type="range"
                      tabIndex={danceOpen ? 0 : -1}
                      min={10}
                      max={100}
                      value={dance.sensitivity}
                      onChange={(e) => dance.setSensitivity(+e.target.value)}
                    />
                  </div>

                  <label className="check">
                    <input
                      type="checkbox"
                      tabIndex={danceOpen ? 0 : -1}
                      checked={dance.syncLed}
                      onChange={(e) => dance.setSyncLed(e.target.checked)}
                    />
                    {c.danceSyncLed}
                  </label>

                  {dance.error && (
                    <p className="ctl-note" style={{ color: '#d9534f' }}>
                      {c.danceErr[dance.error] || c.danceErr.audio_failed}
                    </p>
                  )}
                  <p className="ctl-note muted">{c.danceSafeNote}</p>
                </div>
              </div>
            </section>

            <section className={`led-box ${healthOpen ? 'is-open' : ''}`} aria-label={c.healthSection}>
              <button
                type="button"
                className="led-toggle"
                aria-expanded={healthOpen}
                aria-controls="health-mon-body"
                onClick={() => setHealthOpen((v) => !v)}
              >
                <span className="led-toggle-left">
                  <span className={`health-dot ${espOn ? 'is-on' : ''}`} aria-hidden="true" />
                  <span className="led-toggle-title">{c.healthSection}</span>
                </span>
                <span className="health-summary-wrap">
                  <span className="health-summary">{healthSummary}</span>
                  <span className="led-chevron" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </span>
              </button>

              <div id="health-mon-body" className="led-collapse" aria-hidden={!healthOpen}>
                <div className="led-collapse-inner">
                  <div className="health-grid">
                    <div className="health-card">
                      <span className="health-k">{c.healthPing}</span>
                      <strong className="health-v">{connected && pingMs != null ? `${pingMs} ms` : '--'}</strong>
                    </div>
                    <div className="health-card">
                      <span className="health-k">{c.healthWifi}</span>
                      <strong className="health-v">
                        {espOn && !usb && rssiVal ? `${rssiVal} dBm` : wifiQuality}
                      </strong>
                      {espOn && !usb && rssiVal ? <small className="health-sub">{wifiQuality}</small> : null}
                    </div>
                    <div className="health-card">
                      <span className="health-k">{c.healthLed}</span>
                      <strong className="health-v">{ledMaVal != null ? `${ledMaVal} mA` : '--'}</strong>
                      <span className="health-bar" aria-hidden="true">
                        <i style={{ width: `${ledPct}%` }} />
                      </span>
                    </div>
                    <div className="health-card">
                      <span className="health-k">{c.healthServo}</span>
                      <strong className={`health-v ${relaxed ? 'is-warn' : ''}`}>
                        {!espOn ? c.healthOffline : relaxed ? c.healthRelaxed : c.healthActive}
                      </strong>
                      <small className="health-sub">
                        {espOn && health
                          ? `${formatUptime(health.uptime)} · ${Math.round((health.heap || 0) / 1024)} KB`
                          : '--'}
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`led-box ${camSettingsOpen ? 'is-open' : ''}`} aria-label={c.camSection}>
              <button
                type="button"
                className="led-toggle"
                aria-expanded={camSettingsOpen}
                aria-controls="cam-cal-body"
                onClick={() => setCamSettingsOpen((v) => !v)}
              >
                <span className="led-toggle-left">
                  <span className="led-toggle-title">{c.camSection}</span>
                </span>
                <span className="led-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>

              <div id="cam-cal-body" className="led-collapse" aria-hidden={!camSettingsOpen}>
                <div className="led-collapse-inner">
                  <div className="ctl-cam-cal-btns">
                    <button type="button" className="btn btn-sm" tabIndex={camSettingsOpen ? 0 : -1} onClick={calOpen}>{c.calOpenBtn}</button>
                    <button type="button" className="btn btn-sm" tabIndex={camSettingsOpen ? 0 : -1} onClick={calFist}>{c.calFistBtn}</button>
                    <button type="button" className="btn btn-sm" tabIndex={camSettingsOpen ? 0 : -1} onClick={calReset}>{c.calResetBtn}</button>
                  </div>
                  <label className="check">
                    <input type="checkbox" tabIndex={camSettingsOpen ? 0 : -1} checked={autoBright} onChange={(e) => setAutoBright(e.target.checked)} />
                    {c.autoBright}
                  </label>
                  <div className="slider-row">
                    <label htmlFor="cam-bright">
                      {c.brightness} <output>{(autoBright ? gain : manualBright / 100).toFixed(1)}x</output>
                    </label>
                    <input
                      id="cam-bright"
                      className="slider"
                      type="range"
                      tabIndex={camSettingsOpen ? 0 : -1}
                      min={100}
                      max={500}
                      value={manualBright}
                      disabled={autoBright}
                      onChange={(e) => setManualBright(+e.target.value)}
                    />
                  </div>
                  {note && <p className="ctl-note" role="status" style={{ color: 'var(--accent-text)' }}>{note}</p>}
                </div>
              </div>
            </section>

            <section className={`led-box ${servoOpen ? 'is-open' : ''}`} aria-label={c.servoSection}>
              <button
                type="button"
                className="led-toggle"
                aria-expanded={servoOpen}
                aria-controls="servo-cal-body"
                onClick={() => setServoOpen((v) => !v)}
              >
                <span className="led-toggle-left">
                  <span className="led-toggle-title">{c.servoSection}</span>
                </span>
                <span className="led-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>

              <div id="servo-cal-body" className="led-collapse" aria-hidden={!servoOpen}>
                <div className="led-collapse-inner">
                  <div className="fingers">
                    {fingerNames.map((name, i) => (
                      <div className="finger" key={i}>
                        <span className="finger-name">{name}</span>
                        <input
                          className="slider"
                          type="range"
                          tabIndex={servoOpen ? 0 : -1}
                          min={0}
                          max={100}
                          step={binary ? 100 : 1}
                          value={Math.round(angles[i])}
                          disabled={mode === 'track'}
                          onChange={(e) => onSlider(i, +e.target.value)}
                          aria-label={c.targetAria(name)}
                        />
                        <span className="finger-val">{binary ? (angles[i] >= 50 ? '1' : '0') : `${Math.round(angles[i])}%`}</span>
                        <div className="finger-meta">
                          <span>
                            {i === 0 ? c.thumbMeta(thumbCfg, pos?.[0]) : c.servoMeta(openA[i], closeA[i], pos?.[i])}
                          </span>
                          <span className="finger-actions">
                            {i === 0 && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                tabIndex={servoOpen ? 0 : -1}
                                onClick={() => send('Z,0')}
                                title={c.setOpenTitle}
                              >
                                {c.setOpenBtn}
                              </button>
                            )}
                            <button type="button" className="btn btn-sm" tabIndex={servoOpen ? 0 : -1} onClick={() => openCal(i)}>{c.calibrateBtn}</button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="slider-row">
                    <label htmlFor="smooth">
                      {c.smoothing} <output>{smooth}%</output>
                    </label>
                    <input id="smooth" className="slider" type="range" tabIndex={servoOpen ? 0 : -1} min={5} max={100} value={smooth} onChange={(e) => setSmooth(+e.target.value)} />
                  </div>

                  <div className="slider-row">
                    <label htmlFor="speed">
                      {c.fingerSpeed} <output>{speed >= 360 ? c.speedMax : `${speed}${c.speedUnit}`}</output>
                    </label>
                    <input
                      id="speed"
                      className="slider"
                      type="range"
                      tabIndex={servoOpen ? 0 : -1}
                      min={30}
                      max={360}
                      step={10}
                      value={speed}
                      onChange={(e) => setSpeed(+e.target.value)}
                      onPointerDown={() => { speedDraggingRef.current = true; }}
                      onPointerUp={(e) => { speedDraggingRef.current = false; send(`V,${e.currentTarget.value}`); }}
                      onKeyUp={(e) => send(`V,${e.currentTarget.value}`)}
                    />
                  </div>

                  <label className="check">
                    <input type="checkbox" tabIndex={servoOpen ? 0 : -1} checked={binary} onChange={(e) => onToggleBinary(e.target.checked)} />
                    {c.binaryLabel}
                  </label>
                  <p className="ctl-note muted">{c.servoHelp}</p>
                  <p className="ctl-note muted">{c.servoSavedNote}</p>
                </div>
              </div>
            </section>

            <LedStripPanel
              cfgLed={cfg?.led}
              send={send}
              angles={angles}
              studioOpen={ledStudioOpen}
              onStudioChange={setLedStudioOpen}
              stripTarget={ledStripTarget}
              onStripTargetChange={setLedStripTarget}
            />
            </div>
          </div>
        </aside>
      </div>

      <div className="ctl-handle-rail">
        <AnimatePresence>
          {panelClosed && (
            <motion.button
              key="ctl-handle"
              type="button"
              className="sim-dock-handle ctl-panel-handle"
              onClick={openPanel}
              aria-label={c.showPanel}
              title={c.showPanel}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0, transition: { ...DOCK_SPRING, delay: 0.14 } }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {wizIndex !== null && (
        <CalibrationWizard
          key={wizIndex}
          index={wizIndex}
          name={fingerNames[wizIndex]}
          savedOpen={openA[wizIndex]}
          savedClose={closeA[wizIndex]}
          savedThumb={thumbCfg}
          send={send}
          onSave={(o, c) => {
            saveServoLimit(wizIndex, o, c);
          }}
          onSaveThumb={saveThumbCfg}
          onTest={testFinger}
          onNext={() => setWizIndex(wizIndex + 1)}
          onClose={closeWizard}
        />
      )}

      <AnimatePresence>
        {auth.checked && auth.loginEnabled && !auth.authenticated && (
          <LoginModal
            turnstileEnabled={auth.turnstileEnabled}
            siteKey={auth.turnstileSiteKey}
            mode={auth.turnstileMode}
            onSubmit={auth.login}
            onCancel={() => navigate('/')}
          />
        )}
      </AnimatePresence>
    </Page>
  );
}
