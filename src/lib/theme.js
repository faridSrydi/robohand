import { useEffect, useState } from 'react';

const THEME_EVENT = 'robohand-theme';

export function setAppTheme(next) {
  if (next !== 'dark' && next !== 'light') return;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = next;
  }
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  }
}

// Tema disimpan di <html data-theme>. Inisialisasinya dilakukan di index.html agar tidak berkedip.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
    }
  }, [theme]);

  useEffect(() => {
    const onExt = (e) => {
      if (e.detail === 'dark' || e.detail === 'light') setTheme(e.detail);
    };
    window.addEventListener(THEME_EVENT, onExt);
    return () => window.removeEventListener(THEME_EVENT, onExt);
  }, []);

  const toggle = () => setAppTheme(theme === 'dark' ? 'light' : 'dark');
  return { theme, setTheme: setAppTheme, toggle };
}
