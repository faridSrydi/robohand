import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';

// Halaman berat (WebGL + MediaPipe) dipecah jadi chunk sendiri.
const loadSimulasi = () => import('./pages/Simulasi');
const loadControl = () => import('./pages/Control');
const Simulasi = lazy(loadSimulasi);
const Control = lazy(loadControl);

export default function App() {
  const location = useLocation();

  // Unduh chunk halaman lain saat browser sedang santai, supaya pindah halaman
  // tidak menunggu jaringan dan tidak pernah menampilkan layar kosong.
  useEffect(() => {
    const run = () => { loadSimulasi(); loadControl(); };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1200);
    return () => clearTimeout(t);
  }, []);

  // Sengaja TANPA <AnimatePresence mode="wait">: animasi keluar halaman lama bisa nyangkut
  // saat WebGL sedang berat, sehingga halaman baru (Simulasi) tidak pernah tampil sampai di-refresh.
  // Sekarang halaman baru langsung dipasang dan hanya memakai animasi masuk.
  return (
    <MotionConfig reducedMotion="user">
      <Layout>
        <Suspense fallback={<div className="app-fallback" aria-hidden="true" />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/simulasi" element={<Simulasi />} />
            <Route path="/robot-hand" element={<Control />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </Layout>
    </MotionConfig>
  );
}
