import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Grup 3D yang berputar mengikuti progres scroll dan posisi kursor (dihaluskan per frame).
// progressRef.current.p: 0-1, pointerRef.current: { x, y } dalam rentang -1..1.
export function Spin({ progressRef, pointerRef, children }) {
  const grp = useRef();
  useFrame(() => {
    if (!grp.current) return;
    const p = progressRef.current.p;
    const pt = pointerRef.current;
    const ty = p * Math.PI * 1.1 + pt.x * 0.35;
    const tx = pt.y * 0.18;
    grp.current.rotation.y += (ty - grp.current.rotation.y) * 0.07;
    grp.current.rotation.x += (tx - grp.current.rotation.x) * 0.07;
  });
  return <group ref={grp}>{children}</group>;
}
