// Efek suara sintetis (Web Audio), tanpa file audio. Dibuat saat pertama kali ada tindakan pengguna
// karena browser memblokir suara sebelum ada klik atau tombol keyboard.
let ctx = null;
let master = null;
let muted = false;

try {
  muted = localStorage.getItem('muted') === '1';
} catch {
  /* penyimpanan diblokir: suara tetap menyala */
}

function ensure() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Satu nada pendek dengan amplop (attack cepat, decay halus).
function tone({ freq, to = freq, dur = 0.12, type = 'sine', gain = 0.25, at = 0, filter = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

// Tangga nada pentatonik: jari ke-1 sampai ke-5 mendapat nada sendiri.
const SCALE = [392.0, 440.0, 523.25, 587.33, 659.25];

export const sfx = {
  isMuted: () => muted,
  setMuted(v) {
    muted = v;
    try {
      localStorage.setItem('muted', v ? '1' : '0');
    } catch {
      /* abaikan */
    }
  },

  // Klik tombol biasa.
  click() {
    tone({ freq: 1500, to: 700, dur: 0.05, type: 'triangle', gain: 0.18 });
  },

  // Suara servo bergerak: dengung gergaji yang naik-turun, durasi mengikuti jumlah jari yang bergerak.
  servo(fingers = 1, opening = true) {
    const dur = 0.16 + Math.min(5, fingers) * 0.05;
    const a = opening ? 150 : 230;
    const b = opening ? 235 : 140;
    tone({ freq: a, to: b, dur, type: 'sawtooth', gain: 0.1, filter: 900 });
    tone({ freq: a * 2.01, to: b * 2.01, dur: dur * 0.9, type: 'square', gain: 0.03, filter: 1400, at: 0.01 });
  },

  // Tekan angka 1-5: servo berdengung, lalu n nada naik (satu per jari yang terbuka).
  count(n, opening = true) {
    this.servo(Math.max(1, n), opening);
    for (let i = 0; i < n; i += 1) {
      tone({ freq: SCALE[i], dur: 0.16, type: 'triangle', gain: 0.2, at: 0.05 + i * 0.075 });
    }
    if (n === 0) tone({ freq: 196, to: 130, dur: 0.22, type: 'triangle', gain: 0.22, at: 0.04 });
  },

  // Pola tetap: dua nada kecil.
  pattern() {
    this.servo(3, true);
    tone({ freq: 523.25, dur: 0.1, type: 'triangle', gain: 0.18, at: 0.05 });
    tone({ freq: 783.99, dur: 0.14, type: 'triangle', gain: 0.18, at: 0.13 });
  },

  toggle(on) {
    tone({ freq: on ? 660 : 440, to: on ? 880 : 330, dur: 0.09, type: 'triangle', gain: 0.18 });
  },
};
