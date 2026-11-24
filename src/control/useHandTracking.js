import { useCallback, useEffect, useRef, useState } from 'react';
import { DICT, getLang } from '../lib/i18n';

const HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
const DRAW_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1620248257';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.dataset.src = src;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(DICT[getLang()].camErr.mediapipe));
    document.head.appendChild(s);
  });
}

function friendlyError(err) {
  const ce = DICT[getLang()].camErr;
  const n = err && err.name;
  if (n === 'NotReadableError' || n === 'TrackStartError') return ce.inUse;
  if (n === 'NotAllowedError') return ce.blocked;
  if (n === 'NotFoundError') return ce.notFound;
  return ce.failed(err && err.message ? err.message : err);
}

/**
 * Hook pelacakan tangan.
 * - onLandmarks(lm, w, h) dipanggil tiap hasil. lm = null jika tangan tidak terdeteksi.
 * - brightness: { auto: boolean, manual: number } untuk penerangan video (dibaca tiap frame).
 */
export function useHandTracking({ onLandmarks, brightness }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const procRef = useRef(null);
  const sampleRef = useRef(null);
  const gainRef = useRef(1);
  const frameRef = useRef(0);
  const onLandmarksRef = useRef(onLandmarks);
  const brightRef = useRef(brightness);
  onLandmarksRef.current = onLandmarks;
  brightRef.current = brightness;

  const [state, setState] = useState('idle'); // idle | starting | on | error
  const [message, setMessage] = useState('');
  const [gain, setGain] = useState(1);

  const applyVideoFilter = (g) => {
    const v = videoRef.current;
    if (v) v.style.filter = g > 1.05 ? `brightness(${g.toFixed(2)})` : 'none';
  };

  // Hitung penerangan dari luminans rata-rata gambar kecil (32x24).
  const updateGain = (v) => {
    const b = brightRef.current || { auto: true, manual: 1 };
    if (!b.auto) {
      gainRef.current = b.manual;
      return;
    }
    if (!sampleRef.current) {
      sampleRef.current = document.createElement('canvas');
      sampleRef.current.width = 32;
      sampleRef.current.height = 24;
    }
    const sctx = sampleRef.current.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(v, 0, 0, 32, 24);
    const d = sctx.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const lum = sum / (d.length / 4);
    const want = Math.min(4, Math.max(1, 115 / Math.max(lum, 8)));
    gainRef.current += (want - gainRef.current) * 0.2;
  };

  // Frame yang dikirim ke MediaPipe: video asli, atau versi yang diterangkan jika gelap.
  const prepareFrame = (v) => {
    if (frameRef.current++ % 6 === 0) {
      updateGain(v);
      const g = gainRef.current;
      applyVideoFilter(g);
      setGain(g);
    }
    const g = gainRef.current;
    if (g <= 1.05) return v;
    if (!procRef.current) procRef.current = document.createElement('canvas');
    const proc = procRef.current;
    const pctx = proc.getContext('2d');
    if (!('filter' in pctx)) return v; // browser tanpa ctx.filter (Safari lama): pakai video asli
    proc.width = v.videoWidth;
    proc.height = v.videoHeight;
    pctx.filter = `brightness(${g.toFixed(2)}) contrast(1.15)`;
    pctx.drawImage(v, 0, 0, proc.width, proc.height);
    pctx.filter = 'none';
    return proc;
  };

  const loop = useCallback(async () => {
    if (!runningRef.current) return;
    const v = videoRef.current;
    const hands = handsRef.current;
    if (v && hands && v.readyState >= 2 && v.videoWidth) {
      try {
        await hands.send({ image: prepareFrame(v) });
      } catch (e) {
        console.error(e);
      }
    }
    if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawOverlay = (lm, w, h) => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!lm || !window.drawConnectors) return;
    window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, { color: '#ffffff', lineWidth: 3 });
    window.drawLandmarks(ctx, lm, { color: '#f5b82e', radius: 4 });
  };

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      v.style.filter = 'none';
    }
    handsRef.current?.close?.();
    handsRef.current = null;
    const c = canvasRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setState('idle');
    setMessage('');
    setGain(1);
  }, []);

  const start = useCallback(async () => {
    if (state === 'starting' || state === 'on') return;
    setState('starting');
    setMessage('');
    try {
      await loadScript(DRAW_CDN + '/drawing_utils.js');
      await loadScript(HANDS_CDN + '/hands.js');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();

      const hands = new window.Hands({ locateFile: (f) => `${HANDS_CDN}/${f}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.4 });
      hands.onResults((res) => {
        const lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
        const vid = videoRef.current;
        drawOverlay(lm || null, vid.videoWidth, vid.videoHeight);
        onLandmarksRef.current?.(lm || null, vid.videoWidth, vid.videoHeight);
      });
      handsRef.current = hands;

      runningRef.current = true;
      setState('on');
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      stop();
      setState('error');
      setMessage(friendlyError(err));
    }
  }, [state, loop, stop]);

  // Matikan kamera saat halaman ditinggalkan.
  useEffect(() => stop, [stop]);

  return { videoRef, canvasRef, state, message, gain, start, stop };
}
