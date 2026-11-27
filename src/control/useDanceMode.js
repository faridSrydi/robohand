import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// Mode Tarian Anti-Stall: deteksi beat real-time (Web Audio API FFT) dari Mic atau File MP3
// - Tekukan maksimum dibatasi <= 72% (TIDAK pernah 100% mentok agar servo MG996R tidak stall/panas)
// - Jempol (servo 360° kontinu) tetap terbuka (0%) agar posisi tidak meleset saat beat cepat
// - Cooldown antar gerakan >= 440 ms agar servo tidak bergetar/balik arah mendadak & arus tetap aman
// - Setiap pola hanya menekuk maks 2 jari bersamaan (beban arus XL4015 sangat ringan)
// =============================================================================

const BEAT_COOLDOWN_MS = 440;
const SLOW_GROOVE_MS = 1250;
const LED_PALETTE = [
  { r: 255, g: 170, b: 30 },  // Amber
  { r: 0, g: 229, b: 255 },   // Cyan
  { r: 255, g: 79, b: 163 },  // Pink
  { r: 34, g: 197, b: 94 },   // Emerald
  { r: 168, g: 85, b: 247 },  // Purple
  { r: 43, g: 127, b: 255 },  // Blue
  { r: 255, g: 90, b: 40 },   // Coral
];

// 4 pola tarian variatif (bukan 1-5 berurutan!). Urutan: [Jempol, Telunjuk, Tengah, Manis, Kelingking]
const DANCE_PATTERNS = [
  {
    id: 'eq',
    nameEn: 'Equalizer',
    nameId: 'Equalizer',
    ledMode: 9, // Alternate
    steps: [
      [0, 72, 0, 72, 0], // ganjil turun
      [0, 0, 72, 0, 72], // genap turun
      [0, 72, 0, 72, 0],
      [0, 0, 0, 0, 0],   // pop buka
    ],
  },
  {
    id: 'butterfly',
    nameEn: 'Butterfly',
    nameId: 'Kupu-kupu',
    ledMode: 5, // Scanner
    steps: [
      [0, 0, 72, 72, 0], // dalam turun (gaya teknik)
      [0, 72, 0, 0, 72], // luar turun
      [0, 0, 72, 72, 0],
      [0, 72, 0, 0, 72],
    ],
  },
  {
    id: 'bounce',
    nameEn: 'Side Bounce',
    nameId: 'Kiri-Kanan',
    ledMode: 8, // Wave
    steps: [
      [0, 0, 0, 72, 72], // kiri buka (peace)
      [0, 72, 72, 0, 0], // kanan buka
      [0, 0, 0, 72, 72],
      [0, 52, 52, 52, 52], // setengah tekuk lembut (anti-stall)
    ],
  },
  {
    id: 'groove',
    nameEn: 'Sync Groove',
    nameId: 'Groove Acak',
    ledMode: 6, // Twinkle
    steps: [
      [0, 70, 0, 0, 70],
      [0, 0, 72, 0, 0],
      [0, 0, 0, 72, 0],
      [0, 0, 72, 72, 0],
    ],
  },
];

const SLOW_SWAY_STEPS = [
  [0, 55, 0, 55, 0],
  [0, 0, 55, 0, 55],
  [0, 0, 55, 55, 0],
  [0, 55, 0, 0, 55],
];

export function useDanceMode({ onPose, onLed, onBeforeStart, onStopDone }) {
  const [active, setActive] = useState(false);
  const [source, setSource] = useState('mic'); // 'mic' | 'file'
  const [sensitivity, setSensitivity] = useState(55); // 10..100 (makin tinggi makin peka)
  const [syncLed, setSyncLed] = useState(true);
  const [fileName, setFileName] = useState('');
  const [beatFlash, setBeatFlash] = useState(false);
  const [patternIdx, setPatternIdx] = useState(0);
  const [bars, setBars] = useState([6, 6, 6, 6, 6]);
  const [bpm, setBpm] = useState(0);
  const [error, setError] = useState('');

  const activeRef = useRef(false);
  const sensRef = useRef(55);
  const syncLedRef = useRef(true);
  const onPoseRef = useRef(onPose);
  const onLedRef = useRef(onLed);
  const onBeforeStartRef = useRef(onBeforeStart);
  const onStopDoneRef = useRef(onStopDone);
  sensRef.current = sensitivity;
  syncLedRef.current = syncLed;
  onPoseRef.current = onPose;
  onLedRef.current = onLed;
  onBeforeStartRef.current = onBeforeStart;
  onStopDoneRef.current = onStopDone;

  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const audioElRef = useRef(null);
  const audioUrlRef = useRef('');
  const fileRef = useRef(null);
  const rafRef = useRef(0);
  const flashTimerRef = useRef(null);

  // State deteksi beat & koreografi
  const bassHistRef = useRef([]);
  const beatTimesRef = useRef([]);
  const lastMoveAtRef = useRef(0);
  const lastBeatAtRef = useRef(0);
  const beatCountRef = useRef(0);
  const patternRef = useRef(0);
  const stepRef = useRef(0);
  const swayStepRef = useRef(0);
  const colorIdxRef = useRef(0);
  const lastUiPaintRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    clearTimeout(flashTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
        audioElRef.current.onended = null;
      } catch {}
      audioElRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    cleanupAudio();
    setActive(false);
    setBeatFlash(false);
    setBars([6, 6, 6, 6, 6]);
    setBpm(0);
    if (wasActive) {
      onStopDoneRef.current?.();
    }
  }, [cleanupAudio]);

  const triggerStep = useCallback((isDrop, bassLevel) => {
    const now = performance.now();
    lastMoveAtRef.current = now;
    beatCountRef.current += 1;

    // Ganti gaya tarian setiap 8 ketukan agar gerakan terus variatif dan tidak monoton
    if (beatCountRef.current % 8 === 0) {
      patternRef.current = (patternRef.current + 1) % DANCE_PATTERNS.length;
      stepRef.current = 0;
      setPatternIdx(patternRef.current);
    }

    const pat = DANCE_PATTERNS[patternRef.current];
    let pose;
    if (isDrop) {
      // Bass drop keras -> pop buka 5 jari!
      pose = [0, 0, 0, 0, 0];
    } else {
      pose = pat.steps[stepRef.current % pat.steps.length];
      stepRef.current += 1;
    }

    onPoseRef.current?.(pose);

    if (syncLedRef.current) {
      colorIdxRef.current = (colorIdxRef.current + 1) % LED_PALETTE.length;
      const col = LED_PALETTE[colorIdxRef.current];
      const bright = Math.min(220, Math.max(85, Math.round(95 + bassLevel * 125)));
      onLedRef.current?.({
        strip: 0,
        mode: isDrop ? 3 : pat.ledMode, // Drop keras -> Rainbow, selain itu ikut pola
        r: col.r,
        g: col.g,
        b: col.b,
        bright,
        speed: isDrop ? 72 : 55,
        rgb: isDrop,
      });
    }

    setBeatFlash(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setBeatFlash(false), 160);
  }, []);

  const runLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !activeRef.current) return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = ctxRef.current?.sampleRate || 48000;
    const binHz = sampleRate / (analyser.fftSize || 512);
    const binOf = (hz) => Math.max(0, Math.min(freqData.length - 1, Math.round(hz / binHz)));

    const bassLo = binOf(40);
    const bassHi = Math.max(bassLo + 1, binOf(160));
    const midLo = binOf(250);
    const midHi = Math.max(midLo + 1, binOf(1800));
    const hiLo = binOf(2500);
    const hiHi = Math.max(hiLo + 1, binOf(9000));

    const avgBand = (a, b) => {
      let s = 0;
      for (let i = a; i <= b; i += 1) s += freqData[i];
      return s / Math.max(1, b - a + 1) / 255;
    };

    const tick = () => {
      if (!activeRef.current || !analyserRef.current) return;
      rafRef.current = requestAnimationFrame(tick);

      analyserRef.current.getByteFrequencyData(freqData);
      const bass = avgBand(bassLo, bassHi);
      const mid = avgBand(midLo, midHi);
      const high = avgBand(hiLo, hiHi);
      const energy = bass * 0.65 + mid * 0.35;

      // Update 5 bar visualizer mini (~18 fps agar UI tetap ringan)
      const now = performance.now();
      if (now - lastUiPaintRef.current > 55) {
        lastUiPaintRef.current = now;
        const b1 = avgBand(binOf(40), binOf(110));
        const b2 = avgBand(binOf(110), binOf(260));
        const b3 = avgBand(binOf(260), binOf(800));
        const b4 = avgBand(binOf(800), binOf(2600));
        const b5 = avgBand(binOf(2600), binOf(8000));
        setBars([b1, b2, b3, b4, b5].map((v) => Math.max(8, Math.min(100, Math.round(v * 130)))));
      }

      // Simpan histori energi bass ~0,7 detik terakhir untuk deteksi puncak adaptif
      const hist = bassHistRef.current;
      hist.push(bass);
      if (hist.length > 42) hist.shift();
      const avgBass = hist.reduce((acc, v) => acc + v, 0) / hist.length;

      // Ambang batas sensitivitas: sensitivity 100 -> lebih peka (mult 1.16, floor 0.10); sensitivity 10 -> ketat (mult 1.62, floor 0.28)
      const sNorm = Math.max(0, Math.min(1, (sensRef.current - 10) / 90));
      const mult = 1.62 - sNorm * 0.46;
      const minFloor = 0.28 - sNorm * 0.18;

      const elapsedMove = now - lastMoveAtRef.current;
      const isBeat = bass > minFloor && bass > avgBass * mult && elapsedMove >= BEAT_COOLDOWN_MS;
      const isDrop = isBeat && bass > Math.max(0.45, avgBass * (mult + 0.32));

      if (isBeat) {
        lastBeatAtRef.current = now;
        // Estimasi BPM dari 6 beat terakhir
        const bt = beatTimesRef.current;
        if (bt.length && now - bt[bt.length - 1] > 2200) bt.length = 0;
        bt.push(now);
        if (bt.length > 7) bt.shift();
        if (bt.length >= 3) {
          const span = bt[bt.length - 1] - bt[0];
          const est = Math.round(((bt.length - 1) * 60000) / Math.max(1, span));
          if (est >= 55 && est <= 210) setBpm(est);
        }
        triggerStep(isDrop, bass);
      } else if (energy > minFloor * 0.6 && now - lastBeatAtRef.current > SLOW_GROOVE_MS && elapsedMove >= SLOW_GROOVE_MS) {
        // Bagian lagu pelan / melodi tanpa kick kuat -> alunan halus bolak-balik
        lastMoveAtRef.current = now;
        const pose = SLOW_SWAY_STEPS[swayStepRef.current % SLOW_SWAY_STEPS.length];
        swayStepRef.current += 1;
        onPoseRef.current?.(pose);
        if (syncLedRef.current && high > 0.12) {
          const col = LED_PALETTE[colorIdxRef.current % LED_PALETTE.length];
          onLedRef.current?.({ strip: 0, mode: 2, r: col.r, g: col.g, b: col.b, speed: 38, rgb: false });
        }
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [triggerStep]);

  const start = useCallback(
    async (modeOverride) => {
      const targetSource = modeOverride || source;
      setError('');

      if (targetSource === 'file' && !fileRef.current) {
        setError('file_missing');
        return false;
      }

      cleanupAudio();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        setError('unsupported');
        return false;
      }

      onBeforeStartRef.current?.(targetSource);

      try {
        const ctx = new AC();
        if (ctx.state === 'suspended') await ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;

        if (targetSource === 'mic') {
          if (!navigator.mediaDevices?.getUserMedia) {
            ctx.close().catch(() => {});
            setError('mic_blocked');
            return false;
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
          });
          streamRef.current = stream;
          const srcNode = ctx.createMediaStreamSource(stream);
          srcNode.connect(analyser);
        } else {
          if (audioUrlRef.current) {
            try { URL.revokeObjectURL(audioUrlRef.current); } catch {}
          }
          const url = URL.createObjectURL(fileRef.current);
          audioUrlRef.current = url;
          const el = new Audio(url);
          el.crossOrigin = 'anonymous';
          el.loop = true;
          audioElRef.current = el;
          const srcNode = ctx.createMediaElementSource(el);
          srcNode.connect(analyser);
          analyser.connect(ctx.destination);
          await el.play();
        }

        ctxRef.current = ctx;
        analyserRef.current = analyser;
        bassHistRef.current = [];
        beatTimesRef.current = [];
        beatCountRef.current = 0;
        patternRef.current = 0;
        stepRef.current = 0;
        swayStepRef.current = 0;
        lastMoveAtRef.current = 0;
        lastBeatAtRef.current = performance.now();
        activeRef.current = true;
        setSource(targetSource);
        setPatternIdx(0);
        setActive(true);
        runLoop();
        return true;
      } catch (err) {
        cleanupAudio();
        const name = err?.name || '';
        setError(name === 'NotAllowedError' ? 'mic_blocked' : 'audio_failed');
        return false;
      }
    },
    [cleanupAudio, runLoop, source]
  );

  const selectFile = useCallback(
    (file) => {
      if (!file) return;
      fileRef.current = file;
      setFileName(file.name);
      setSource('file');
      setError('');
      if (activeRef.current) {
        start('file');
      }
    },
    [start]
  );

  const switchSource = useCallback(
    (next) => {
      setSource(next);
      setError('');
      if (activeRef.current) {
        if (next === 'file' && !fileRef.current) stop();
        else start(next);
      }
    },
    [start, stop]
  );

  useEffect(() => () => {
    activeRef.current = false;
    cleanupAudio();
    if (audioUrlRef.current) {
      try { URL.revokeObjectURL(audioUrlRef.current); } catch {}
    }
  }, [cleanupAudio]);

  return {
    active,
    source,
    sensitivity,
    setSensitivity,
    syncLed,
    setSyncLed,
    fileName,
    beatFlash,
    pattern: DANCE_PATTERNS[patternIdx] || DANCE_PATTERNS[0],
    bars,
    bpm,
    error,
    start,
    stop,
    toggle: () => (activeRef.current ? stop() : start()),
    selectFile,
    switchSource,
  };
}
