import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { createRobotRig } from '../three/robotRig';
import { build } from '../three/components';
import { S as SCENES } from '../three/features';

/**
 * Tangan robot. pose = array 5 nilai (0 = buka, 1 = tutup), urutan Jempol..Kelingking.
 * Array boleh dimutasi dari luar; rig akan mengikuti tiap frame.
 * cycle (opsional) membuat tangan bergerak sendiri: { seq: [jumlah jari terbuka], step: detik }.
 * leds (opsional) = array 2 konfigurasi LED strip [strip1, strip2] untuk animasi LED di depan pergelangan.
 */
export function RobotHand({ pose, cycle, leds, ...props }) {
  const rig = useMemo(() => {
    const r = createRobotRig();
    r.group.name = 'robot-hand';
    return r;
  }, []);
  const elapsed = useRef(0);

  useEffect(() => {
    if (leds) rig.setLeds(leds);
  }, [rig, leds]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (cycle) {
      elapsed.current += dt;
      const t = elapsed.current - (cycle.delay || 0);
      if (t >= 0) {
        const n = cycle.seq[Math.floor(t / cycle.step) % cycle.seq.length];
        for (let i = 0; i < 5; i++) pose[i] = i < n ? 0 : 1;
      }
    }
    rig.setPose(pose);
    rig.update(dt);
  });

  return <primitive object={rig.group} {...props} />;
}

// Putar masuk dengan halus saat model diganti (kanvas tetap, hanya isinya yang berganti).
// Memakai rotasi, bukan skala, supaya hitungan fit kamera tidak terganggu.
export function PopIn({ children }) {
  const grp = useRef();
  const t0 = useRef(null);
  useFrame(({ clock }) => {
    if (!grp.current) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const p = Math.min(1, (clock.elapsedTime - t0.current) / 0.8);
    const e = 1 - Math.pow(1 - p, 3);
    grp.current.rotation.y = (1 - e) * -1.1;
  });
  return <group ref={grp} rotation={[0, -1.1, 0]}>{children}</group>;
}

// Model komponen dari components3d.js asli. kind: esp32 | servo | battery | charger | xl4015 | mini360 | fuse | frame
export function PartModel({ kind }) {
  const obj = useMemo(() => build[kind](), [kind]);
  return <primitive object={obj} />;
}

// Adegan fitur dari features3d.js asli. id: track | conn | cal | speed | power | sim
export function FeatureScene({ id }) {
  const scene = useMemo(() => SCENES[id](), [id]);
  useFrame(({ clock }, dt) => scene.update(clock.elapsedTime, dt));
  return <primitive object={scene.g} />;
}
