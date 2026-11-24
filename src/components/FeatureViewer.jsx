import { useEffect, useRef, useState } from 'react';
import { createFeatureViewer } from '../three/features';

// Penampil 3D bagian Fitur: satu canvas WebGL bersama seperti features3d.js,
// dengan cache per adegan, transisi spin-out + bounce-in, kamera dinamis, dan drag + auto-rotate.
export default function FeatureViewer({ id }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const idRef = useRef(id);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  idRef.current = id;

  // Tunda pembuatan konteks WebGL sampai bagian Fitur mendekati layar agar hero awal tetap ringan.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: '320px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return undefined;
    const viewer = createFeatureViewer(canvasRef.current, {
      onReady: () => setReady(true),
    });
    if (!viewer) {
      setReady(true);
      return undefined;
    }
    viewerRef.current = viewer;
    viewer.show(idRef.current);

    const fallback = setTimeout(() => setReady(true), 900);
    return () => {
      clearTimeout(fallback);
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    viewerRef.current?.show(id);
  }, [id]);

  return (
    <div ref={wrapRef} className={`feature-canvas ${ready ? 'is-visible' : ''}`}>
      {mounted && <canvas ref={canvasRef} className="feature-gl" />}
    </div>
  );
}
