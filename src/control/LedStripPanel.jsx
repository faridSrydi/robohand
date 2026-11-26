import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useThree } from '@react-three/fiber';
import { Center } from '@react-three/drei';
import * as THREE from 'three';
import ModelCanvas from '../components/ModelCanvas';
import { RobotHand } from '../components/Model';
import { loadLedCfg, normalizeLeds, saveLedCfg, useSavedLeds } from '../lib/led';
import { useI18n } from '../lib/i18n';

const PREVIEW_CONTROLS = {
  enablePan: false,
  enableZoom: true,
  zoomSpeed: 0.9,
  enableDamping: true,
  dampingFactor: 0.08,
  rotateSpeed: 0.85,
  minDistance: 12,
  maxDistance: 84,
  touches: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE },
};

// Pusatkan kamera tepat di tengah model tangan (sumbu X = 0 tepat di pergelangan & base)
// dengan jarak otomatis menyesuaikan ukuran layar desktop maupun mobile.
function PreviewRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const dragged = useRef(false);

  useEffect(() => {
    if (!controls) return undefined;
    const onStart = () => { dragged.current = true; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  useEffect(() => {
    if (!controls || dragged.current || size.width < 10 || size.height < 10) return undefined;
    const fit = () => {
      const hand = scene.getObjectByName('robot-hand');
      if (!hand) return;
      scene.updateMatrixWorld(true);
      hand.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(hand);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
      const dH = (sz.y / 2) / Math.tan(fov / 2);
      const dW = (Math.max(sz.x, sz.z) / 2) / (Math.tan(fov / 2) * aspect);
      const dist = Math.max(dH, dW) * 1.28;
      // Target X = 0 (tengah base & kedua strip LED), Y sedikit turun agar tidak mepet pill hint di bawah
      controls.target.set(0, c.y - sz.y * 0.02, c.z);
      camera.position.set(0, c.y + 0.8, c.z + dist);
      camera.updateProjectionMatrix();
      controls.update();
    };
    fit();
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [camera, controls, scene, size.width, size.height]);

  return null;
}

// Sinkron dengan firmware/esp32_hand.ino:
//   Strip 1 = GPIO 22, Strip 2 = GPIO 23 (masing-masing 34 LED WS2812B)
//   Perintah: "L,strip,animasi,r,g,b,kecerahan,kecepatan,rgb"
//             strip: 0 = keduanya (sama + sinkron), 1 = strip 1, 2 = strip 2
//             animasi: 0-10 (10 = mati), r/g/b: 0-255, kecerahan: 1-255, kecepatan: 1-100, rgb: 0/1
const LED_NAMES = [
  'Meteor',
  'Warna tetap',
  'Napas',
  'Pelangi',
  'Kejar',
  'Pemindai',
  'Berkelip',
  'Api',
  'Gelombang',
  'Kedip bergantian',
  'Mati',
];
const LED_OWN_COLOR = new Set([3, 7, 10]); // Pelangi, Api, Mati tidak memakai warna pilihan
const LED_SWATCHES = ['#ffaa1e', '#ff2d2d', '#22c55e', '#2b7fff', '#00e5ff', '#a855f7', '#ff4fa3', '#ffffff'];
const LED_TABS = ['Kedua strip', 'Strip 1', 'Strip 2'];

const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const rgbToHex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16) || 0,
  g: parseInt(hex.slice(3, 5), 16) || 0,
  b: parseInt(hex.slice(5, 7), 16) || 0,
});

function dotBg(c) {
  if (c.mode === 10) return 'transparent';
  if (c.mode === 7) return 'linear-gradient(#ffd23f, #ff5a1f)';
  if (c.mode === 3 || c.rgb) return 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
  return rgbToHex(c);
}

const STUDIO_EASE = [0.22, 1, 0.36, 1];

export default function LedStripPanel({
  cfgLed,
  send,
  angles,
  studioOpen,
  onStudioChange,
  stripTarget,
  onStripTargetChange,
}) {
  const { tr } = useI18n();
  const lt = tr.led;
  const [open, setOpen] = useState(false);
  const [internalPreview, setInternalPreview] = useState(false);
  const isControlled = typeof studioOpen === 'boolean';
  const previewOpen = isControlled ? studioOpen : internalPreview;
  const setPreviewOpen = useCallback(
    (next) => {
      if (isControlled) onStudioChange?.(next);
      else setInternalPreview(next);
    },
    [isControlled, onStudioChange]
  );
  const [mount3d, setMount3d] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [leds, setLeds] = useState(loadLedCfg);
  const externalLeds = useSavedLeds();
  const [internalTarget, setInternalTarget] = useState(0); // 0 = kedua strip, 1 = strip 1, 2 = strip 2
  const isTargetControlled = typeof stripTarget === 'number';
  const target = isTargetControlled ? stripTarget : internalTarget;
  const setTarget = useCallback(
    (next) => {
      const v = next === 1 || next === 2 ? next : 0;
      if (isTargetControlled) onStripTargetChange?.(v);
      else setInternalTarget(v);
    },
    [isTargetControlled, onStripTargetChange]
  );
  const pose = useMemo(() => [0, 0, 0, 0, 0], []);

  // Sinkronkan status tombol dropdown saat overlay dibuka/ditutup dari perintah suara
  useEffect(() => {
    if (isControlled) setOpen(studioOpen);
  }, [isControlled, studioOpen]);

  // Ikuti perubahan LED dari luar (misal dari perintah suara) agar UI panel tetap sinkron.
  useEffect(() => {
    if (JSON.stringify(externalLeds) !== JSON.stringify(ledsRef.current)) {
      ledsRef.current = externalLeds;
      setLeds(externalLeds);
    }
  }, [externalLeds]);

  useEffect(() => {
    if (!Array.isArray(angles) || angles.length < 5) return;
    for (let i = 0; i < 5; i++) pose[i] = Math.min(1, Math.max(0, (angles[i] || 0) / 100));
  }, [angles, pose]);

  // Tunda pembuatan konteks WebGL ~260 ms sampai animasi geser panel & fade blur selesai mulus (60fps),
  // lalu tampilkan model 3D dengan fade halus tanpa memblokir animasi masuk.
  useEffect(() => {
    if (!previewOpen) {
      setMount3d(false);
      setCanvasReady(false);
      return undefined;
    }
    const tMount = setTimeout(() => setMount3d(true), 260);
    const tReady = setTimeout(() => setCanvasReady(true), 340);
    return () => {
      clearTimeout(tMount);
      clearTimeout(tReady);
    };
  }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setPreviewOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [previewOpen, setPreviewOpen]);

  const togglePanel = () => {
    const next = !previewOpen;
    setOpen(next);
    setPreviewOpen(next);
  };

  const ledsRef = useRef(leds);
  ledsRef.current = leds;
  const targetRef = useRef(target);
  targetRef.current = target;
  const sendRef = useRef(send);
  sendRef.current = send;

  const localAtRef = useRef(0);
  const timerRef = useRef(null);
  const lastSentRef = useRef(0);
  const pendingRef = useRef('');

  const fire = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pendingRef.current) return;
    lastSentRef.current = performance.now();
    sendRef.current(pendingRef.current);
    pendingRef.current = '';
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Sinkronkan dari ESP32; abaikan sebentar setelah pengguna mengubah agar slider tidak melompat.
  useEffect(() => {
    if (!cfgLed) return;
    if (performance.now() - localAtRef.current < 1500) return;
    const next = normalizeLeds(cfgLed);
    setLeds(next);
    saveLedCfg(next);
  }, [cfgLed]);

  const pushLed = (nextLeds, tgt, immediate = false) => {
    const c = nextLeds[tgt === 2 ? 1 : 0];
    pendingRef.current = `L,${tgt},${c.mode},${c.r},${c.g},${c.b},${c.bright},${c.speed},${c.rgb ? 1 : 0}`;
    localAtRef.current = performance.now();
    const wait = 60 - (performance.now() - lastSentRef.current);
    if (immediate || wait <= 0) {
      fire();
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(fire, wait);
    }
  };

  const patchCurrent = (patch, immediate = false) => {
    const tgt = targetRef.current;
    const prev = ledsRef.current;
    const idx = tgt === 2 ? 1 : 0;
    const updated = { ...prev[idx], ...patch };
    const next =
      tgt === 0
        ? [updated, { ...updated }]
        : tgt === 1
          ? [updated, prev[1]]
          : [prev[0], updated];
    ledsRef.current = next;
    setLeds(next);
    saveLedCfg(next);
    pushLed(next, tgt, immediate);
  };

  const selectTab = (i) => {
    if (timerRef.current) fire();
    targetRef.current = i;
    setTarget(i);
  };

  const cur = leds[target === 2 ? 1 : 0];
  const ownColor = LED_OWN_COLOR.has(cur.mode);
  const brightPct = Math.max(5, Math.min(100, Math.round(cur.bright / 2.55)));
  const same = JSON.stringify(leds[0]) === JSON.stringify(leds[1]);

  const modeNote =
    cur.mode === 10
      ? lt.modeOffNote
      : ownColor
        ? lt.ownColorNote
        : cur.mode === 9 && target !== 0
          ? lt.altNote
          : '';

  const renderControls = (idPrefix, tabbable) => (
    <>
      <div className="segmented led-tabs" role="group" aria-label={lt.tabsAria}>
        {lt.tabs.map((label, i) => (
          <button
            key={i}
            type="button"
            tabIndex={tabbable ? 0 : -1}
            aria-pressed={target === i}
            onClick={() => selectTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="led-summary" aria-live="polite">
        <div className="led-summary-row">
          {leds.map((c, i) => (
            <span className="led-chip" key={i}>
              <i style={{ background: dotBg(c) }} />
              {lt.stripLabel(i)}: {lt.modes[c.mode]}
              {c.rgb && !LED_OWN_COLOR.has(c.mode) ? ' (RGB)' : ''}, {Math.round(c.bright / 2.55)}%
            </span>
          ))}
        </div>
        {!same && <p className="ctl-note muted">{lt.diffNote}</p>}
      </div>

      <div className="led-color-row">
        <label htmlFor={`${idPrefix}-color`}>{lt.color}</label>
        <input
          id={`${idPrefix}-color`}
          className="led-color-input"
          type="color"
          tabIndex={tabbable ? 0 : -1}
          value={rgbToHex(cur)}
          disabled={ownColor}
          onChange={(e) => patchCurrent({ ...hexToRgb(e.target.value), rgb: false }, false)}
          onBlur={() => fire()}
        />
        <button
          type="button"
          className="led-rgb-btn"
          tabIndex={tabbable ? 0 : -1}
          disabled={ownColor}
          aria-pressed={!ownColor && cur.rgb}
          title={lt.rgbTitle}
          onClick={() => patchCurrent({ rgb: !cur.rgb }, true)}
        >
          <i aria-hidden="true" />
          RGB
        </button>
        <div className="led-swatches">
          {LED_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className="led-swatch"
              tabIndex={tabbable ? 0 : -1}
              style={{ background: hex }}
              disabled={ownColor}
              aria-label={lt.pickColor(hex)}
              onClick={() => patchCurrent({ ...hexToRgb(hex), rgb: false }, true)}
            />
          ))}
        </div>
      </div>

      {modeNote && <p className="ctl-note muted">{modeNote}</p>}

      <div className="led-modes" role="group" aria-label={lt.modesAria}>
        {lt.modes.map((name, i) => (
          <button
            key={i}
            type="button"
            className="led-mode-btn"
            tabIndex={tabbable ? 0 : -1}
            aria-pressed={cur.mode === i}
            onClick={() => patchCurrent({ mode: i }, true)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="slider-row">
        <label htmlFor={`${idPrefix}-bright`}>
          {lt.brightness} <output>{brightPct}%</output>
        </label>
        <input
          id={`${idPrefix}-bright`}
          className="slider"
          type="range"
          tabIndex={tabbable ? 0 : -1}
          min={5}
          max={100}
          value={brightPct}
          onChange={(e) => patchCurrent({ bright: Math.max(1, Math.round(+e.target.value * 2.55)) }, false)}
          onPointerUp={() => fire()}
          onKeyUp={() => fire()}
        />
      </div>

      <div className="slider-row">
        <label htmlFor={`${idPrefix}-speed`}>
          {lt.speed} <output>{cur.speed}</output>
        </label>
        <input
          id={`${idPrefix}-speed`}
          className="slider"
          type="range"
          tabIndex={tabbable ? 0 : -1}
          min={1}
          max={100}
          value={cur.speed}
          onChange={(e) => patchCurrent({ speed: +e.target.value }, false)}
          onPointerUp={() => fire()}
          onKeyUp={() => fire()}
        />
      </div>

      <p className="ctl-note muted">{lt.budgetNote}</p>
    </>
  );

  return (
    <section className={`led-box ${open ? 'is-open' : ''}`} aria-label={lt.panelAria}>
      <button
        type="button"
        className="led-toggle"
        aria-expanded={open}
        aria-controls="led-strip-body"
        onClick={togglePanel}
      >
        <span className="led-toggle-left">
          <span className="led-toggle-title">{lt.title}</span>
          <span className="led-toggle-dots" aria-hidden="true">
            {leds.map((c, i) => (
              <i key={i} style={{ background: dotBg(c) }} />
            ))}
          </span>
        </span>
        <span className="led-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      <div id="led-strip-body" className="led-collapse" aria-hidden={!open}>
        <div className="led-collapse-inner">
          {!previewOpen && open && (
            <button
              type="button"
              className="btn btn-primary btn-sm led-reopen-btn"
              onClick={() => setPreviewOpen(true)}
            >
              {lt.reopenBtn}
            </button>
          )}

          <p className="ctl-note muted">{lt.intro}</p>

          {renderControls('led-side', open && !previewOpen)}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && previewOpen && (
              <div className="led-studio" role="dialog" aria-modal="true" aria-label={lt.studioAria}>
                <motion.div
                  key="led-studio-bg"
                  className="led-studio-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.36, ease: STUDIO_EASE }}
                  onClick={() => setPreviewOpen(false)}
                  aria-hidden="true"
                />

                <motion.button
                  key="led-studio-close"
                  type="button"
                  className="led-studio-close"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.28, delay: 0.08, ease: STUDIO_EASE }}
                  onClick={() => setPreviewOpen(false)}
                  aria-label={lt.closePreview}
                  title={lt.closeTitle}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </motion.button>

                {/* Panel kontrol warna & animasi bergeser mulus dari kanan ke kiri (pure GPU translate3d) */}
                <div className="led-studio-panel-slot">
                  <motion.aside
                    key="led-studio-panel"
                    className="led-studio-panel"
                    aria-label={lt.panelAria}
                    initial={{ opacity: 0, x: '38vw' }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: '26vw', transition: { duration: 0.28, ease: STUDIO_EASE } }}
                    transition={{ duration: 0.44, ease: STUDIO_EASE }}
                  >
                    <div className="led-studio-panel-head">
                      <h3>{lt.title}</h3>
                      <span className="led-toggle-dots" aria-hidden="true">
                        {leds.map((c, i) => (
                          <i key={i} style={{ background: dotBg(c) }} />
                        ))}
                      </span>
                    </div>
                    <div className="led-studio-panel-body">
                      {renderControls('led-float', true)}
                    </div>
                  </motion.aside>
                </div>

                {/* Model 3D tangan besar di tengah layar (fade halus setelah WebGL siap) */}
                <motion.div
                  key="led-studio-stage"
                  className="led-studio-stage"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2, ease: STUDIO_EASE } }}
                  transition={{ duration: 0.3, ease: STUDIO_EASE }}
                >
                  <div className={`led-studio-canvas ${canvasReady ? 'is-ready' : ''}`}>
                    {mount3d && (
                      <ModelCanvas
                        camera={[0, 1, 50]}
                        fov={31}
                        fit={false}
                        shadows={false}
                        shadowY={null}
                        touchAction="none"
                        controls={PREVIEW_CONTROLS}
                      >
                        <Center disableX>
                          <RobotHand pose={pose} leds={leds} />
                        </Center>
                        <PreviewRig />
                      </ModelCanvas>
                    )}
                  </div>
                  <span className="led-preview-hint">{lt.hint}</span>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  );
}
