import { Fragment, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useSpring } from 'framer-motion';

// Animasi judul huruf per huruf (rise + gelombang aksen) sama dengan robotic hand v2.
export function SplitHeading({ text, as = 'h1', className = '' }) {
  const Tag = as;
  const words = text.trim().split(' ');
  let idx = 0;

  return (
    <Tag className={`split ${className}`.trim()} aria-label={text}>
      {words.map((word, wi) => (
        <Fragment key={wi}>
          <span className="w" aria-hidden="true">
            {Array.from(word).map((ch, ci) => {
              const k = idx++;
              return (
                <span key={ci} className="ch" style={{ '--k': k }}>
                  {ch}
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  );
}

// Animasi muncul teks (.rv -> .rv.in) saat elemen masuk layar, sama dengan robotic hand v2.
export function Reveal({ as = 'div', delay = 0, className = '', style, children, ...props }) {
  const Tag = as;
  const ref = useRef(null);
  const [shown, setShown] = useState(() =>
    typeof window !== 'undefined' &&
    (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );

  useEffect(() => {
    if (shown) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={`rv ${shown ? 'in' : ''} ${className}`.trim()}
      style={{ '--d': `${delay}s`, ...style }}
      {...props}
    >
      {children}
    </Tag>
  );
}

// Judul yang muncul kata per kata dengan geser halus dari bawah mask.
// Pemicu "terlihat di layar" dipasang pada elemen judul (bukan kata di dalam overflow mask).
// immediate = langsung berjalan saat dipasang (khusus judul hero di bagian paling atas).
export function TextReveal({ text, as = 'h2', className = '', delay = 0, immediate = false }) {
  const Tag = motion[as] ? motion[as] : motion.h2;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.25, margin: '0px 0px -50px 0px' });
  const show = immediate || inView;
  const words = text.split(' ');
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="word-mask" aria-hidden="true">
          <motion.span
            className="word"
            initial={{ y: '105%', opacity: 0 }}
            animate={show
              ? { y: '0%', opacity: 1 }
              : { y: '105%', opacity: 0 }}
            transition={{ duration: 0.8, delay: show ? delay + i * 0.055 : 0, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

// Tombol yang sedikit tertarik ke arah kursor.
export function Magnetic({ children, strength = 0.25, className = '', ...props }) {
  const x = useSpring(0, { stiffness: 260, damping: 20, mass: 0.4 });
  const y = useSpring(0, { stiffness: 260, damping: 20, mass: 0.4 });
  const ref = useRef(null);
  return (
    <motion.div
      ref={ref}
      className={`magnetic ${className}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Angka yang terhitung naik saat masuk layar.
export function CountUp({ to, duration = 1.4 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const mv = useMotionValue(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v); } });
    return () => controls.stop();
  }, [inView, to, duration, mv]);
  return <span ref={ref}>0</span>;
}

// Strip teks yang berjalan terus (marquee) untuk daftar komponen.
export function Marquee({ items }) {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i} className="marquee-item">{t}<i /></span>
        ))}
      </div>
    </div>
  );
}
