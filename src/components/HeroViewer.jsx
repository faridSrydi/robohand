import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Center } from '@react-three/drei';
import * as THREE from 'three';
import ModelCanvas from './ModelCanvas';
import { RobotHand } from './Model';
import { useSavedLeds } from '../lib/led';
import { useI18n } from '../lib/i18n';

// Posisi kamera untuk tiap tombol pintas. az = sudut keliling (0 = depan, PI = belakang),
// el = sudut naik dari horizontal, focus = target fokus kamera.
const VIEWS = {
  depan: { az: 0, el: 0.1, focus: 'all' },
  belakang: { az: Math.PI, el: 0.1, focus: 'all' },
  mesin: { az: Math.PI - 0.45, el: 0.85, focus: 'machine' },
};

const HOME_POSE = { az: 0.5, el: 0.13 };
const INTRO_DURATION = 1.45;
const HERO_CONTROLS = {
  enablePan: false,
  enableZoom: true,
  zoomSpeed: 0.9,
  enableDamping: true,
  dampingFactor: 0.08,
  rotateSpeed: 0.8,
  autoRotate: false,
  touches: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE },
};

// Koordinat lokal komponen di dalam ruang mesin robotRig.js.
// anchor = titik ujung panah di mesh komponen, tip = ujung garis tempat label mengambang.
const MACHINE_CALLOUTS = [
  { id: 'bms', name: 'BMS 2S 20A', sub: 'Proteksi', anchor: [3.0, -1.35, -1.0], tip: [5.1, 0.7, -0.3], side: 'left' },
  { id: 'bat', name: 'Baterai 2×18650', sub: '7,4 V', anchor: [2.4, -0.85, -2.3], tip: [5.3, -0.45, -2.5], side: 'left' },
  { id: 'xl', name: 'Buck XL4015', sub: '6 V Servo', anchor: [0.7, -1.12, -0.95], tip: [1.5, 1.85, 0.3], side: 'top' },
  { id: 'fuse', name: 'Fuse 10A', sub: 'Pengaman', anchor: [0.3, -0.8, -3.35], tip: [1.3, -1.9, -4.6], side: 'bottom' },
  { id: 'esp', name: 'ESP32 DevKit V1', sub: 'WiFi · PWM', anchor: [-2.2, -1.3, -1.0], tip: [-4.8, 1.35, -0.1], side: 'right' },
  { id: 'm360', name: 'Buck Mini360', sub: '5 V ESP32', anchor: [-3.1, -1.28, -1.85], tip: [-5.3, 0.05, -1.6], side: 'right' },
  { id: 'chg', name: 'Charger USB-C', sub: '5 V 2 A', anchor: [-1.4, -1.2, -2.7], tip: [-2.1, -2.0, -4.5], side: 'bottom' },
  { id: 'sw', name: 'Saklar On/Off', sub: 'Daya', anchor: [-3.2, -0.8, -3.25], tip: [-5.2, -1.25, -3.7], side: 'right' },
];

const V3 = THREE.Vector3;
const tmpBox = new THREE.Box3();
const tmpOff = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpSph = new THREE.Spherical();
const tmpA = new THREE.Vector3();
const tmpT = new THREE.Vector3();

function setOrbit(camera, controls, target, dist, az, el) {
  controls.target.copy(target);
  camera.position.set(
    target.x + dist * Math.sin(az) * Math.cos(el),
    target.y + dist * Math.sin(el),
    target.z + dist * Math.cos(az) * Math.cos(el)
  );
  controls.update();
}

// Memproyeksikan posisi 3D komponen ke koordinat layar 2D tiap frame (60fps tanpa re-render React).
function MachineCalloutProjector({ active, domRefs }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);

  useFrame(() => {
    if (!active) return;
    const hand = scene.getObjectByName('robot-hand');
    if (!hand || size.width < 10 || size.height < 10) return;

    const w = size.width;
    const h = size.height;
    const compact = w <= 460;
    const shelf = compact ? 8 : 14;
    const padX = compact ? 10 : 16;
    const padY = compact ? 14 : 20;

    for (let i = 0; i < MACHINE_CALLOUTS.length; i++) {
      const item = MACHINE_CALLOUTS[i];
      const refs = domRefs.current[i];
      if (!refs) continue;

      tmpA.set(item.anchor[0], item.anchor[1], item.anchor[2]);
      hand.localToWorld(tmpA);
      tmpA.project(camera);

      tmpT.set(item.tip[0], item.tip[1], item.tip[2]);
      hand.localToWorld(tmpT);
      tmpT.project(camera);

      const visible = tmpA.z < 1 && tmpT.z < 1;
      const ax = (tmpA.x * 0.5 + 0.5) * w;
      const ay = (-tmpA.y * 0.5 + 0.5) * h;

      let tx = (tmpT.x * 0.5 + 0.5) * w;
      let ty = (-tmpT.y * 0.5 + 0.5) * h;

      // Pastikan seluruh kartu label tetap berada di dalam kanvas sesuai lebar/tingginya.
      const cardEl = refs.tag?.firstElementChild;
      const cw = cardEl?.offsetWidth || (compact ? 78 : 112);
      const ch = cardEl?.offsetHeight || (compact ? 24 : 36);

      let lx;
      if (item.side === 'left') {
        lx = Math.max(padX + cw, Math.min(w - padX, tx - shelf));
        tx = Math.min(w - padX, lx + shelf);
      } else if (item.side === 'right') {
        lx = Math.max(padX, Math.min(w - padX - cw, tx + shelf));
        tx = Math.max(padX, lx - shelf);
      } else {
        lx = Math.max(padX + cw / 2, Math.min(w - padX - cw / 2, tx));
        tx = lx;
      }

      if (item.side === 'top') {
        ty = Math.max(padY + ch, Math.min(h - padY, ty));
      } else if (item.side === 'bottom') {
        ty = Math.max(padY, Math.min(h - padY - ch - 6, ty));
      } else {
        ty = Math.max(padY + ch / 2, Math.min(h - padY - ch / 2, ty));
      }

      if (refs.line) {
        refs.line.setAttribute('points', `${ax.toFixed(1)},${ay.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} ${lx.toFixed(1)},${ty.toFixed(1)}`);
        refs.line.style.visibility = visible ? 'visible' : 'hidden';
      }
      if (refs.dot) {
        refs.dot.setAttribute('cx', ax.toFixed(1));
        refs.dot.setAttribute('cy', ay.toFixed(1));
        refs.dot.style.visibility = visible ? 'visible' : 'hidden';
      }
      if (refs.ring) {
        refs.ring.setAttribute('cx', ax.toFixed(1));
        refs.ring.setAttribute('cy', ay.toFixed(1));
        refs.ring.style.visibility = visible ? 'visible' : 'hidden';
      }
      if (refs.tag) {
        refs.tag.style.transform = `translate3d(${lx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        refs.tag.style.visibility = visible ? 'visible' : 'hidden';
      }
    }
  });

  return null;
}

// Bergerak halus saat masuk dan saat berpindah sudut pandang, lalu mengembalikan kendali ke pengguna.
// Letaknya di dalam <Canvas> karena butuh kamera dan OrbitControls.
function ViewRig({ apiRef, auto, onUserDrag, onReady }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const goal = useRef(null);
  const intro = useRef(null);
  const placed = useRef(false);
  const warmup = useRef(0);
  const readySent = useRef(false);
  const homeDist = useRef(40);

  const measure = useCallback(() => {
    const hand = scene.getObjectByName('robot-hand');
    if (!hand || size.width < 10 || size.height < 10) return null;
    hand.updateWorldMatrix(true, true);
    tmpBox.setFromObject(hand);
    if (tmpBox.isEmpty()) return null;
    const c = tmpBox.getCenter(new V3());
    const sz = tmpBox.getSize(new V3());
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    // jarak agar tinggi dan lebar model muat, lalu diberi ruang napas supaya tidak terlihat raksasa
    const dH = (sz.y / 2) / Math.tan(fov / 2);
    const dW = (Math.max(sz.x, sz.z) / 2) / (Math.tan(fov / 2) * aspect);
    const all = Math.max(dH, dW) * 1.42;
    // titik "mesin" (kotak komponen elektronik di dasar), dalam koordinat dunia
    const machine = hand.localToWorld(new V3(0, -0.95, -1.9));
    // beri jarak ekstra pada layar portrait sempit agar seluruh label komponen muat nyaman
    const machineDist = Math.max(27, 29 / Math.min(1, aspect * 1.15));
    return { center: c, all, machine, machineDist };
  }, [camera, scene, size.width, size.height]);

  const goTo = useCallback((name) => {
    const m = measure();
    const v = VIEWS[name];
    if (!m || !v) return;
    intro.current = null;
    goal.current = {
      az: v.az,
      el: v.el,
      dist: v.focus === 'machine' ? m.machineDist : m.all,
      target: v.focus === 'machine' ? m.machine : m.center,
    };
  }, [measure]);

  useEffect(() => {
    apiRef.current = { goTo };
  }, [apiRef, goTo]);

  // Seret/cubit manual membatalkan animasi kamera dan mematikan putar otomatis.
  useEffect(() => {
    if (!controls) return undefined;
    const start = () => {
      intro.current = null;
      goal.current = null;
      onUserDrag?.();
    };
    controls.addEventListener('start', start);
    return () => controls.removeEventListener('start', start);
  }, [controls, onUserDrag]);

  useFrame((_, rawDt) => {
    if (!controls) return;
    const dt = Math.min(rawDt, 0.05);

    // 1. Posisikan kamera sebelum kanvas ditampilkan (saat opacity masih 0) agar tidak ada lompatan frame.
    if (!placed.current) {
      const m = measure();
      if (!m) return;
      placed.current = true;
      homeDist.current = m.all;
      controls.minDistance = 8;
      controls.maxDistance = m.all * 1.85;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 1.1;

      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setOrbit(camera, controls, m.center, m.all, HOME_POSE.az, HOME_POSE.el);
        intro.current = null;
      } else {
        // Mulai sedikit lebih jauh, lebih rendah, dan serong ke kanan sehingga sapuan masuk
        // melayang naik dan berputar searah autoRotate (theta menurun) tanpa patah saat transisi.
        const from = {
          az: HOME_POSE.az + 0.42,
          el: HOME_POSE.el - 0.14,
          dist: m.all * 1.15,
          target: m.center.clone().add(new V3(0, 1.25, 0)),
        };
        const to = {
          az: HOME_POSE.az,
          el: HOME_POSE.el,
          dist: m.all,
          target: m.center.clone(),
        };
        intro.current = { elapsed: 0, active: false, from, to };
        setOrbit(camera, controls, from.target, from.dist, from.az, from.el);
      }
      warmup.current = 1;
      return;
    }

    // 2. Tunggu 2 frame hangat (shader, shadow map, dan PMREM selesai) sebelum mulai fade-in & gerak masuk.
    if (!readySent.current) {
      warmup.current += 1;
      if (warmup.current >= 2) {
        readySent.current = true;
        if (intro.current) intro.current.active = true;
        onReady?.();
      }
      return;
    }

    // 3. Animasi masuk kamera 3D dengan quartic ease-out yang halus.
    const iv = intro.current;
    if (iv && iv.active) {
      controls.autoRotate = false;
      iv.elapsed += dt;
      const u = Math.min(1, iv.elapsed / INTRO_DURATION);
      const e = 1 - Math.pow(1 - u, 4);
      const az = iv.from.az + (iv.to.az - iv.from.az) * e;
      const el = iv.from.el + (iv.to.el - iv.from.el) * e;
      const dist = iv.from.dist + (iv.to.dist - iv.from.dist) * e;
      tmpTarget.lerpVectors(iv.from.target, iv.to.target, e);
      setOrbit(camera, controls, tmpTarget, dist, az, el);
      if (u >= 1) intro.current = null;
      return;
    }

    // 4. Transisi tombol sudut pandang atau putar otomatis.
    const g = goal.current;
    controls.autoRotate = auto && !g;
    controls.autoRotateSpeed = 1.1;
    if (!g) return;

    const k = 1 - Math.exp(-dt * 5.5);
    tmpOff.copy(camera.position).sub(controls.target);
    tmpSph.setFromVector3(tmpOff);
    // sudut keliling: ambil jalur terpendek
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

const ICONS = {
  depan: <path d="M12 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />,
  belakang: <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />,
  mesin: <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM10 10h4v4h-4z" />,
  putar: <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
};

function ViewButton({ id, label, active, onClick }) {
  return (
    <button type="button" className={`hero-view-btn ${active ? 'is-on' : ''}`} onClick={onClick} aria-pressed={active} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[id]}</svg>
      <span>{label}</span>
    </button>
  );
}

// Tangan 3D di hero: bisa diputar & dicubit untuk zoom, plus tombol pintas Depan / Belakang / Mesin / Putar.
export default function HeroViewer() {
  const { tr } = useI18n();
  const hv = tr.heroViewer;
  const pose = useMemo(() => [0, 0, 0, 0, 0], []);
  const cycle = useMemo(() => ({ seq: [5, 4, 3, 2, 1, 0, 1, 2, 3, 4], step: 1.2, delay: 1.5 }), []);
  const leds = useSavedLeds();
  const apiRef = useRef(null);
  const calloutRefs = useRef(MACHINE_CALLOUTS.map(() => ({})));
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState(null);
  const [ready, setReady] = useState(false);
  const [showCallouts, setShowCallouts] = useState(false);

  const isMachine = view === 'mesin';
  const handleReady = useCallback(() => setReady(true), []);

  // Pengaman: pastikan model tetap tampil meski sinyal siap tertunda.
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 1400);
    return () => clearTimeout(id);
  }, []);

  // Tampilkan garis & label komponen dengan sedikit jeda setelah kamera mulai menyorot ruang mesin.
  useEffect(() => {
    if (!isMachine) {
      setShowCallouts(false);
      return undefined;
    }
    const id = setTimeout(() => setShowCallouts(true), 240);
    return () => clearTimeout(id);
  }, [isMachine]);

  const pick = (name) => {
    setAuto(false);
    setView(name);
    apiRef.current?.goTo(name);
  };
  const toggleAuto = () => {
    setView(null);
    setAuto((a) => !a);
  };
  const onUserDrag = useCallback(() => {
    setAuto(false);
    // Saat sedang melihat "Mesin", tetap tampilkan label komponen walau pengguna memutar atau mencubit zoom.
    setView((prev) => (prev === 'mesin' ? prev : null));
  }, []);

  return (
    <>
      <div className={`hero-canvas ${ready ? 'is-ready' : ''}`}>
        <ModelCanvas
          camera={[0, 4, 40]}
          fit={false}
          shadowY={null}
          touchAction="none"
          controls={HERO_CONTROLS}
        >
          <Center>
            <RobotHand pose={pose} cycle={cycle} leds={leds} />
          </Center>
          <ViewRig apiRef={apiRef} auto={auto} onUserDrag={onUserDrag} onReady={handleReady} />
          <MachineCalloutProjector active={isMachine} domRefs={calloutRefs} />
        </ModelCanvas>

        <div className={`hero-callouts ${showCallouts ? 'is-shown' : ''}`} aria-hidden={!showCallouts}>
          <svg className="callout-svg" aria-hidden="true">
            {MACHINE_CALLOUTS.map((item, i) => (
              <g key={item.id} style={{ '--ci': i }}>
                <polyline
                  ref={(el) => { calloutRefs.current[i].line = el; }}
                  className="callout-line"
                  pathLength="1"
                  points="0,0 0,0 0,0"
                />
                <circle
                  ref={(el) => { calloutRefs.current[i].ring = el; }}
                  className="callout-ring"
                  cx="0"
                  cy="0"
                  r="6"
                />
                <circle
                  ref={(el) => { calloutRefs.current[i].dot = el; }}
                  className="callout-dot"
                  cx="0"
                  cy="0"
                  r="3"
                />
              </g>
            ))}
          </svg>
          {MACHINE_CALLOUTS.map((item, i) => {
            const loc = hv.callouts[i] || item;
            return (
              <div
                key={item.id}
                ref={(el) => { calloutRefs.current[i].tag = el; }}
                className={`callout-tag callout-${item.side}`}
                style={{ '--ci': i }}
              >
                <span className="callout-card">
                  <strong>{loc.name}</strong>
                  <small>{loc.sub}</small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={`hero-views ${ready ? 'is-ready' : ''}`} role="group" aria-label={hv.viewsAria}>
        <ViewButton id="depan" label={hv.front} active={view === 'depan'} onClick={() => pick('depan')} />
        <ViewButton id="belakang" label={hv.back} active={view === 'belakang'} onClick={() => pick('belakang')} />
        <ViewButton id="mesin" label={hv.bay} active={view === 'mesin'} onClick={() => pick('mesin')} />
        <ViewButton id="putar" label={hv.spin} active={auto} onClick={toggleAuto} />
      </div>
    </>
  );
}
