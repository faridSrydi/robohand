import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ledCfg';
const EVENT_NAME = 'robotichand-led-change';

export const defaultLedStrip = () => ({
  mode: 0,
  r: 255,
  g: 170,
  b: 30,
  bright: 140,
  speed: 60,
  rgb: false,
});

export function normalizeLedStrip(x) {
  const d = defaultLedStrip();
  if (!x || typeof x !== 'object') return d;
  return {
    mode: Number.isFinite(+x.mode) ? Math.min(10, Math.max(0, Math.round(+x.mode))) : d.mode,
    r: Number.isFinite(+x.r) ? Math.min(255, Math.max(0, Math.round(+x.r))) : d.r,
    g: Number.isFinite(+x.g) ? Math.min(255, Math.max(0, Math.round(+x.g))) : d.g,
    b: Number.isFinite(+x.b) ? Math.min(255, Math.max(0, Math.round(+x.b))) : d.b,
    bright: Number.isFinite(+x.bright) ? Math.min(255, Math.max(1, Math.round(+x.bright))) : d.bright,
    speed: Number.isFinite(+x.speed) ? Math.min(100, Math.max(1, Math.round(+x.speed))) : d.speed,
    rgb: Boolean(x.rgb),
  };
}

export function normalizeLeds(m) {
  if (!m) return [defaultLedStrip(), defaultLedStrip()];
  return Array.isArray(m)
    ? [normalizeLedStrip(m[0]), normalizeLedStrip(m[1] || m[0])]
    : [normalizeLedStrip(m), normalizeLedStrip(m)];
}

export function loadLedCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeLeds(JSON.parse(raw));
  } catch {
    /* abaikan jika data lokal rusak */
  }
  return [defaultLedStrip(), defaultLedStrip()];
}

export function saveLedCfg(leds) {
  const clean = normalizeLeds(leds);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* penyimpanan diblokir */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: clean }));
  }
}

export function useSavedLeds() {
  const [leds, setLeds] = useState(loadLedCfg);

  useEffect(() => {
    const onCustom = (e) => {
      if (e.detail) setLeds(normalizeLeds(e.detail));
    };
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setLeds(loadLedCfg());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return leds;
}
