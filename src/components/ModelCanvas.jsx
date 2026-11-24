import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Lingkungan studio lokal (tanpa unduhan HDR): memberi pantulan realistis pada material logam dan plastik.
function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 0.95;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Atur touch-action kanvas: default 'pan-y' agar scroll halaman tetap lancar,
// atau 'none' saat kanvas mendukung cubit zoom (pinch-to-zoom) dua jari.
function TouchScroll({ action = 'pan-y' }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const apply = () => { el.style.touchAction = action; };
    apply();
    const id = setTimeout(apply, 50);
    return () => clearTimeout(id);
  }, [gl, action]);
  return null;
}

// Render hanya saat kanvas terlihat di layar. Beranda punya beberapa kanvas sekaligus;
// yang di luar layar dihentikan supaya laptop tidak berat dan halaman tidak tersendat.
// Jika lazy = true, konteks WebGL baru dibuat saat kanvas mendekati layar (agar hero awal mulus).
function useOnScreen(lazy = false) {
  const ref = useRef(null);
  const [on, setOn] = useState(!lazy);
  const [mounted, setMounted] = useState(!lazy);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      setOn(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        setOn(e.isIntersecting);
        if (e.isIntersecting) setMounted(true);
      },
      { rootMargin: lazy ? '320px' : '80px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy]);
  return [ref, on, mounted];
}

/**
 * Kanvas 3D bersama: lingkungan studio, cahaya utama dengan bayangan lembut,
 * bayangan kontak di lantai, dan kamera yang menyesuaikan jarak (fit) agar model terlihat penuh.
 * fitKey: ganti nilainya untuk memuat ulang fit kamera tanpa membuat ulang konteks WebGL.
 * lazy: tunda pembuatan konteks WebGL sampai elemen mendekati viewport.
 */
export default function ModelCanvas({
  camera = [0, 1, 16],
  fov = 30,
  fit = true,
  margin = 1.2,
  controls = null,
  controlsRef = null,
  shadowY = null,
  shadowMap = 1024,
  shadows = true,
  fitKey = 'fit',
  lazy = false,
  touchAction = 'pan-y',
  className,
  children,
}) {
  const [wrapRef, onScreen, mounted] = useOnScreen(lazy);
  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      {mounted && (
        <Canvas
          className={className}
          dpr={shadows ? [1, 1.75] : [1, 1.5]}
          shadows={shadows}
          frameloop={onScreen ? 'always' : 'never'}
          camera={{ position: camera, fov }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <StudioEnvironment />
          <TouchScroll action={touchAction} />
          <hemisphereLight args={[0xffffff, 0x3a3a44, 0.45]} />
          <directionalLight
            position={[7, 14, 9]}
            intensity={1.2}
            castShadow={shadows}
            shadow-mapSize={[shadowMap, shadowMap]}
            shadow-camera-left={-9}
            shadow-camera-right={9}
            shadow-camera-top={9}
            shadow-camera-bottom={-9}
            shadow-bias={-0.0004}
            shadow-radius={6}
          />
          <directionalLight position={[-10, 4, -6]} intensity={0.35} color="#dfe8ff" />
          {fit ? <Bounds key={fitKey} fit clip observe margin={margin}>{children}</Bounds> : children}
          {shadowY !== null && (
            <ContactShadows position={[0, shadowY, 0]} opacity={0.5} scale={22} blur={2.2} far={7} />
          )}
          {controls && <OrbitControls ref={controlsRef} makeDefault {...controls} />}
        </Canvas>
      )}
    </div>
  );
}
