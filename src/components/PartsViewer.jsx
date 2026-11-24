import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import ModelCanvas from './ModelCanvas';
import { build } from '../three/components';
import { createRobotRig } from '../three/robotRig';

const TARGET_RADIUS = 2.6;
const FRAME_POSE = [0.2, 0, 0, 0, 0.3];
const PARTS_CAMERA = [7.5, 5.8, 10.5];
const PARTS_CONTROLS = {
  enablePan: false,
  enableZoom: false,
  enableDamping: true,
  dampingFactor: 0.08,
  rotateSpeed: 0.85,
  autoRotate: true,
  autoRotateSpeed: 1.15,
};

// Pusat dan skala tiap komponen dinormalisasi sinkron sebelum frame pertama.
// Dengan begitu semua komponen (termasuk tangan robot) pas di kamera tetap tanpa <Bounds>,
// menghilangkan kedipan/clipping dan konflik kamera dengan OrbitControls.
function normalizeObject(obj, targetRadius = TARGET_RADIUS) {
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = box.getCenter(new THREE.Vector3());
  const scale = sphere.radius > 0 ? targetRadius / sphere.radius : 1;
  obj.position.sub(center);
  wrap.scale.setScalar(scale);
  return wrap;
}

function buildNormalizedPart(kind) {
  if (kind === 'frame') {
    const r = createRobotRig();
    r.setPose(FRAME_POSE);
    for (let i = 0; i < 40; i++) r.update(0.05);
    return normalizeObject(r.group);
  }
  return normalizeObject(build[kind]());
}

function PartStage({ kind, animRef, onReady }) {
  const grp = useRef(null);
  const cacheRef = useRef(new Map());
  const warmupRef = useRef(0);
  const revealedRef = useRef(false);
  const firstRef = useRef(true);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Cache geometri & tekstur komponen yang sudah dibuka agar perpindahan balik instan tanpa lag.
  const object = useMemo(() => {
    const cache = cacheRef.current;
    if (!cache.has(kind)) cache.set(kind, buildNormalizedPart(kind));
    return cache.get(kind);
  }, [kind]);

  // Setel pose masuk sebelum browser sempat menggambar frame pertama untuk komponen baru.
  useLayoutEffect(() => {
    const g = grp.current;
    if (g) {
      g.position.set(0, reduced ? 0 : -0.34, 0);
      g.rotation.set(0, reduced ? 0 : -0.5, 0);
      g.scale.setScalar(reduced ? 1 : 0.91);
    }
    warmupRef.current = 0;
    revealedRef.current = false;
  }, [kind, reduced]);

  // Pengaman di dalam Canvas agar model selalu tampil meski sinyal hangat tertunda.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!revealedRef.current) {
        revealedRef.current = true;
        firstRef.current = false;
        onReady();
      }
    }, 900);
    return () => clearTimeout(id);
  }, [kind, onReady]);

  useFrame((_, rawDt) => {
    const g = grp.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.05);

    // Tunggu 2 frame hangat pada muatan awal (PMREM + shader) atau 1 frame saat ganti komponen
    // selagi kanvas masih transparan (opacity 0), supaya tidak ada kedipan sama sekali.
    if (!revealedRef.current) {
      warmupRef.current += 1;
      const needed = firstRef.current ? 2 : 1;
      if (warmupRef.current >= needed) {
        revealedRef.current = true;
        const duration = firstRef.current ? 0.85 : 0.65;
        firstRef.current = false;
        animRef.current = reduced
          ? { mode: 'idle', elapsed: 0, duration }
          : { mode: 'in', elapsed: 0, duration };
        onReady();
      }
      return;
    }

    const anim = animRef.current;
    if (anim.mode === 'in') {
      anim.elapsed += dt;
      const u = Math.min(1, anim.elapsed / anim.duration);
      const e = 1 - Math.pow(1 - u, 4);
      g.position.y = (1 - e) * -0.34;
      g.rotation.y = (1 - e) * -0.5;
      g.scale.setScalar(0.91 + 0.09 * e);
      if (u >= 1) anim.mode = 'idle';
    } else if (anim.mode === 'out' && !reduced) {
      anim.elapsed += dt;
      const u = Math.min(1, anim.elapsed / anim.duration);
      const e = u * u;
      g.position.y = -0.18 * e;
      g.scale.setScalar(1 - 0.06 * e);
    } else if (anim.mode === 'restore') {
      const k = 1 - Math.exp(-dt * 12);
      g.position.y += (0 - g.position.y) * k;
      g.rotation.y += (0 - g.rotation.y) * k;
      const s = g.scale.x + (1 - g.scale.x) * k;
      g.scale.setScalar(s);
      if (Math.abs(g.position.y) < 0.002 && Math.abs(1 - s) < 0.002) {
        g.position.y = 0;
        g.rotation.y = 0;
        g.scale.setScalar(1);
        anim.mode = 'idle';
      }
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.14} floatIntensity={0.75} floatingRange={[-0.18, 0.18]}>
      <group ref={grp}>
        <primitive object={object} />
      </group>
    </Float>
  );
}

// Penampil 3D komponen utama: satu kanvas tetap tanpa Bounds, transisi keluar-masuk halus tanpa blink.
export default function PartsViewer({ kind }) {
  const [shownKind, setShownKind] = useState(kind);
  const [visible, setVisible] = useState(false);
  const targetRef = useRef(kind);
  const shownKindRef = useRef(kind);
  const readyOnceRef = useRef(false);
  const swapTimerRef = useRef(null);
  const animRef = useRef({ mode: 'idle', elapsed: 0, duration: 0.75 });

  targetRef.current = kind;

  const handleReady = useCallback(() => {
    readyOnceRef.current = true;
    setVisible(true);
  }, []);

  useEffect(() => {
    clearTimeout(swapTimerRef.current);

    if (!readyOnceRef.current) {
      shownKindRef.current = kind;
      setShownKind(kind);
      return undefined;
    }

    if (kind === shownKindRef.current) {
      animRef.current = { mode: 'restore', elapsed: 0, duration: 0.3 };
      setVisible(true);
      return undefined;
    }

    // Pudar & turun tipis dulu sampai transparan, baru tukar model supaya bebas kedipan.
    setVisible(false);
    animRef.current = { mode: 'out', elapsed: 0, duration: 0.16 };
    swapTimerRef.current = setTimeout(() => {
      shownKindRef.current = targetRef.current;
      setShownKind(targetRef.current);
    }, 165);

    return () => clearTimeout(swapTimerRef.current);
  }, [kind]);

  return (
    <div className={`float-canvas ${visible ? 'is-visible' : ''}`}>
      <ModelCanvas
        camera={PARTS_CAMERA}
        fov={30}
        fit={false}
        lazy
        controls={PARTS_CONTROLS}
      >
        <PartStage kind={shownKind} animRef={animRef} onReady={handleReady} />
      </ModelCanvas>
    </div>
  );
}
