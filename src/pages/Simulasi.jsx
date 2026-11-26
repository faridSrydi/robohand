import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFrame, useThree } from '@react-three/fiber';
import { Center } from '@react-three/drei';
import * as THREE from 'three';
import { Page } from '../components/Layout';
import ModelCanvas from '../components/ModelCanvas';
import { RobotHand } from '../components/Model';
import { useSavedLeds } from '../lib/led';
import { useI18n } from '../lib/i18n';
import { sfx } from '../lib/sound';

// Pola tetap. 0 = jari terbuka, 1 = jari menekuk. Urutan: Jempol, Telunjuk, Tengah, Manis, Kelingking.
const PATTERNS = [
  { id: 'dua', label: 'P1', title: 'Pola 1: telunjuk dan tengah terbuka', pose: [1, 0, 0, 1, 1] },
  { id: 'rock', label: 'P2', title: 'Pola 2: jempol, telunjuk dan kelingking terbuka', pose: [0, 0, 1, 1, 0] },
];

const SIM_HOME = { az: 0.22, el: 0.08 };
const SIM_HOME_MOBILE = { az: 0.06, el: 0.06 };
const SIM_INTRO_DURATION = 1.35;
const SIM_CONTROLS = {
  enablePan: false,
  enableDamping: true,
  dampingFactor: 0.08,
  rotateSpeed: 0.85,
  minDistance: 8,
  maxDistance: 110,
  touches: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE },
};

const V3 = THREE.Vector3;
const tmpBox = new THREE.Box3();
const tmpOff = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpSph = new THREE.Spherical();

function setOrbit(camera, controls, target, dist, az, el) {
  controls.target.copy(target);
  camera.position.set(
    target.x + dist * Math.sin(az) * Math.cos(el),
    target.y + dist * Math.sin(el),
    target.z + dist * Math.cos(az) * Math.cos(el)
  );
  controls.update();
}

// Mengatur kamera simulasi: animasi masuk halus setelah WebGL hangat, reset mulus,
// dan geser halus ke kiri saat dock tombol dibuka di mode mobile agar model tidak tertutup.
function SimRig({ apiRef, onReady, dockOpen }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const intro = useRef(null);
  const goal = useRef(null);
  const placed = useRef(false);
  const warmup = useRef(0);
  const readySent = useRef(false);
  const userInteracted = useRef(false);
  const lastSize = useRef({ w: 0, h: 0 });
  const viewOffsetRef = useRef(0);
  const hasOffsetRef = useRef(false);

  useEffect(() => () => {
    camera.clearViewOffset();
  }, [camera]);

  const measure = useCallback(() => {
    const hand = scene.getObjectByName('robot-hand');
    if (!hand || size.width < 10 || size.height < 10) return null;
    scene.updateMatrixWorld(true);
    hand.updateWorldMatrix(true, true);
    tmpBox.setFromObject(hand);
    if (tmpBox.isEmpty()) return null;
    const center = tmpBox.getCenter(new V3());
    const sz = tmpBox.getSize(new V3());
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    const isMobilePortrait = size.width <= 860 && aspect < 0.85;
    if (isMobilePortrait) {
      // Geser sedikit ke bawah agar tangan benar-benar di tengah ruang kosong di bawah judul HUD mobile.
      center.y += sz.y * 0.04;
    }
    const dH = (sz.y / 2) / Math.tan(fov / 2);
    const dW = (Math.max(sz.x, sz.z) / 2) / (Math.tan(fov / 2) * aspect);
    const all = Math.max(dH, dW) * (isMobilePortrait ? 1.42 : 1.28);
    const home = isMobilePortrait ? SIM_HOME_MOBILE : SIM_HOME;
    return { center, all, home };
  }, [camera, scene, size.width, size.height]);

  const reset = useCallback(() => {
    const m = measure();
    if (!m) return;
    userInteracted.current = false;
    intro.current = null;
    goal.current = {
      az: m.home.az,
      el: m.home.el,
      dist: m.all,
      target: m.center,
    };
  }, [measure]);

  useEffect(() => {
    apiRef.current = { reset };
  }, [apiRef, reset]);

  useEffect(() => {
    if (!controls) return undefined;
    const cancel = () => {
      userInteracted.current = true;
      intro.current = null;
      goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  // Jika ukuran kanvas berubah setelah mount (misal address bar / layout mobile selesai)
  // dan pengguna belum memutar manual, pusatkan ulang kamera secara otomatis.
  useEffect(() => {
    if (!placed.current || !controls || userInteracted.current) return;
    if (Math.abs(size.width - lastSize.current.w) < 2 && Math.abs(size.height - lastSize.current.h) < 2) return;
    const m = measure();
    if (!m) return;
    lastSize.current = { w: size.width, h: size.height };
    controls.maxDistance = Math.max(80, m.all * 2);
    if (intro.current) {
      intro.current.to = { az: m.home.az, el: m.home.el, dist: m.all, target: m.center.clone() };
    } else {
      setOrbit(camera, controls, m.center, m.all, m.home.az, m.home.el);
    }
  }, [size.width, size.height, controls, camera, measure]);

  useFrame((_, rawDt) => {
    if (!controls) return;
    const dt = Math.min(rawDt, 0.05);

    // Di mode mobile (<= 860px), geser proyeksi 3D ke kiri secara halus saat dock tombol kanan dibuka.
    if (size.width > 10 && size.height > 10) {
      const mobileShift = size.width <= 860 && dockOpen ? Math.min(44, Math.round(size.width * 0.095)) : 0;
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const nextOffset = reducedMotion
        ? mobileShift
        : viewOffsetRef.current + (mobileShift - viewOffsetRef.current) * (1 - Math.exp(-dt * 9.5));

      const sizeChanged = camera.view && (camera.view.fullWidth !== size.width || camera.view.fullHeight !== size.height);
      if (Math.abs(nextOffset - viewOffsetRef.current) > 0.05 || (mobileShift > 0 && !hasOffsetRef.current) || sizeChanged) {
        viewOffsetRef.current = Math.abs(mobileShift - nextOffset) < 0.08 ? mobileShift : nextOffset;
        if (viewOffsetRef.current > 0.05) {
          camera.setViewOffset(size.width, size.height, viewOffsetRef.current, 0, size.width, size.height);
          hasOffsetRef.current = true;
        } else if (hasOffsetRef.current) {
          viewOffsetRef.current = 0;
          camera.clearViewOffset();
          hasOffsetRef.current = false;
        }
      }
    }

    if (!placed.current) {
      const m = measure();
      if (!m) return;
      placed.current = true;
      lastSize.current = { w: size.width, h: size.height };
      controls.minDistance = 8;
      controls.maxDistance = Math.max(80, m.all * 2);

      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setOrbit(camera, controls, m.center, m.all, m.home.az, m.home.el);
        intro.current = null;
      } else {
        const from = {
          az: m.home.az + 0.34,
          el: m.home.el - 0.1,
          dist: m.all * 1.14,
          target: m.center.clone().add(new V3(0, 1.0, 0)),
        };
        const to = {
          az: m.home.az,
          el: m.home.el,
          dist: m.all,
          target: m.center.clone(),
        };
        intro.current = { elapsed: 0, active: false, from, to };
        setOrbit(camera, controls, from.target, from.dist, from.az, from.el);
      }
      warmup.current = 1;
      return;
    }

    if (!readySent.current) {
      warmup.current += 1;
      if (warmup.current >= 2) {
        // Ukur ulang sekali lagi setelah <Center> & layout mobile benar-benar stabil.
        const m = measure();
        if (m) {
          lastSize.current = { w: size.width, h: size.height };
          if (intro.current) {
            intro.current.to = { az: m.home.az, el: m.home.el, dist: m.all, target: m.center.clone() };
          } else {
            setOrbit(camera, controls, m.center, m.all, m.home.az, m.home.el);
          }
        }
        readySent.current = true;
        if (intro.current) intro.current.active = true;
        onReady?.();
      }
      return;
    }

    const iv = intro.current;
    if (iv && iv.active) {
      iv.elapsed += dt;
      const u = Math.min(1, iv.elapsed / SIM_INTRO_DURATION);
      const e = 1 - Math.pow(1 - u, 4);
      const az = iv.from.az + (iv.to.az - iv.from.az) * e;
      const el = iv.from.el + (iv.to.el - iv.from.el) * e;
      const dist = iv.from.dist + (iv.to.dist - iv.from.dist) * e;
      tmpTarget.lerpVectors(iv.from.target, iv.to.target, e);
      setOrbit(camera, controls, tmpTarget, dist, az, el);
      if (u >= 1) intro.current = null;
      return;
    }

    const g = goal.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 6);
    tmpOff.copy(camera.position).sub(controls.target);
    tmpSph.setFromVector3(tmpOff);
    const curAz = tmpSph.theta;
    const dAz = ((g.az - curAz + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const az = curAz + dAz * k;
    const curEl = Math.PI / 2 - tmpSph.phi;
    const el = curEl + (g.el - curEl) * k;
    const dist = tmpSph.radius + (g.dist - tmpSph.radius) * k;
    controls.target.lerp(g.target, k);
    camera.position.set(
      controls.target.x + dist * Math.sin(az) * Math.cos(el),
      controls.target.y + dist * Math.sin(el),
      controls.target.z + dist * Math.cos(az) * Math.cos(el)
    );
    controls.update();
    if (Math.abs(dAz) < 0.004 && Math.abs(g.el - curEl) < 0.004 && Math.abs(g.dist - tmpSph.radius) < 0.05 && controls.target.distanceTo(g.target) < 0.02) {
      goal.current = null;
    }
  });

  return null;
}

const DOCK_BTN_ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  reset: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  chevron: <path d="M15 6l-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  soundOn: <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  soundOff: <path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6" />,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {DOCK_BTN_ICONS[name]}
    </svg>
  );
}

// Gerakan buka-tutup panel tombol: geser + pudar dengan pegas, tanpa lompatan.
const DOCK_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 };

export default function Simulasi() {
  const { tr } = useI18n();
  const s = tr.sim;
  const pose = useMemo(() => [0, 0, 0, 0, 0], []);
  const leds = useSavedLeds();
  const [open, setOpen] = useState(5);
  const [pattern, setPattern] = useState(null);
  const [dockOpen, setDockOpen] = useState(() =>
    typeof window === 'undefined' ? true : !window.matchMedia('(max-width: 860px)').matches
  );
  const [muted, setMuted] = useState(() => sfx.isMuted());
  const [ready, setReady] = useState(false);
  const rigApi = useRef(null);
  const openRef = useRef(5);

  const handleReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const id = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(id);
  }, []);

  const applyCount = useCallback((n, { silent = false } = {}) => {
    const v = Math.max(0, Math.min(5, n));
    const prev = openRef.current;
    // 1: telunjuk | 2: telunjuk+tengah | 3: telunjuk+tengah+manis | 4: 4 jari tanpa jempol | 5: semua terbuka
    const table = [
      [1, 1, 1, 1, 1],
      [1, 0, 1, 1, 1],
      [1, 0, 0, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    for (let i = 0; i < 5; i++) pose[i] = table[v][i];
    openRef.current = v;
    setOpen(v);
    setPattern(null);
    if (!silent) sfx.count(v, v >= prev);
  }, [pose]);

  const applyPattern = (p) => {
    p.pose.forEach((v, i) => (pose[i] = v));
    const n = p.pose.filter((v) => v === 0).length;
    openRef.current = n;
    setOpen(n);
    setPattern(p.id);
    sfx.pattern();
  };

  // Keyboard: angka 1-5 = jumlah jari terbuka, 0 = semua menekuk.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (/^[0-5]$/.test(e.key)) {
        e.preventDefault();
        applyCount(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyCount]);

  const toggleMute = () => {
    const next = !muted;
    sfx.setMuted(next);
    setMuted(next);
    if (!next) sfx.toggle(true);
  };

  const openNames = tr.fingers.filter((_, i) => pose[i] === 0);
  const status = pattern
    ? s.patterns.find((p) => p.id === pattern)?.title
    : open === 0
      ? s.allCurled
      : `${s.openPrefix}${openNames.join(', ')}`;

  return (
    <Page className="sim-page">
      <div className={`sim-canvas ${ready ? 'is-ready' : ''}`}>
        <ModelCanvas
          camera={[0, 4, 54]}
          fit={false}
          shadowY={null}
          touchAction="none"
          controls={SIM_CONTROLS}
        >
          <Center>
            <RobotHand pose={pose} leds={leds} />
          </Center>
          <SimRig apiRef={rigApi} onReady={handleReady} dockOpen={dockOpen} />
        </ModelCanvas>
      </div>

      <div className="sim-hud">
        <span className="eyebrow">{s.eyebrow}</span>
        <h1 className="sim-title">{s.title}</h1>
        <p>{s.desc}</p>
      </div>

      <div className="sim-status" role="status" aria-live="polite">{status}</div>

      <div className="sim-dock-rail">
        <AnimatePresence initial={false}>
          {dockOpen ? (
            <motion.div
              key="dock"
              className="sim-dock"
              initial={{ opacity: 0, x: 56, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 56, scale: 0.94, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
              transition={DOCK_SPRING}
              style={{ transformOrigin: 'right center' }}
            >
              <button type="button" className="icon-btn" onClick={() => applyCount(open + 1)} disabled={open === 5} aria-label={s.addFinger} title={s.addFinger}>
                <Icon name="plus" />
              </button>
              <span className="sim-count" aria-label={s.countAria(open)}>{open}</span>
              <button type="button" className="icon-btn" onClick={() => applyCount(open - 1)} disabled={open === 0} aria-label={s.subFinger} title={s.subFinger}>
                <Icon name="minus" />
              </button>
              <i className="sim-dock-sep" aria-hidden="true" />
              {s.patterns.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`icon-btn sim-pattern ${pattern === p.id ? 'is-on' : ''}`}
                  onClick={() => applyPattern(p)}
                  aria-label={p.title}
                  aria-pressed={pattern === p.id}
                  title={p.title}
                >
                  {p.label}
                </button>
              ))}
              <i className="sim-dock-sep" aria-hidden="true" />
              <button type="button" className="icon-btn" onClick={() => { sfx.click(); rigApi.current?.reset(); }} aria-label={s.resetView} title={s.resetView}>
                <Icon name="reset" />
              </button>
              <button type="button" className={`icon-btn ${muted ? '' : 'is-soft-on'}`} onClick={toggleMute} aria-label={muted ? s.soundOn : s.soundOff} aria-pressed={!muted} title={muted ? s.soundOn : s.soundOff}>
                <Icon name={muted ? 'soundOff' : 'soundOn'} />
              </button>
              <button type="button" className="icon-btn" onClick={() => { sfx.click(); setDockOpen(false); }} aria-label={s.hideControls} title={s.hideControls}>
                <Icon name="close" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="handle"
              type="button"
              className="sim-dock-handle"
              onClick={() => { sfx.click(); setDockOpen(true); }}
              aria-label={s.showControls}
              title={s.showControls}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0, transition: { ...DOCK_SPRING, delay: 0.12 } }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
            >
              <Icon name="chevron" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </Page>
  );
}
