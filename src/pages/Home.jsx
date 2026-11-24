import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Page } from '../components/Layout';
import HeroViewer from '../components/HeroViewer';
import FeatureViewer from '../components/FeatureViewer';
import { SplitHeading, Reveal, Magnetic, CountUp } from '../components/Motion';
import { createComponentViewer } from '../three/components';
import { useI18n } from '../lib/i18n';

const pad = (n) => String(n + 1).padStart(2, '0');
const FLIP_EASE = 'cubic-bezier(.2,.8,.2,1)';
const FLIP_DUR = 750;

function Hero() {
  const { lang, tr } = useI18n();
  const h = tr.home;
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section className="hero" ref={heroRef}>
      <div className="container hero-inner">
        <motion.div className="hero-copy" style={{ y: copyY, opacity: copyOpacity }}>
          <Reveal as="span" className="eyebrow" delay={0}>
            {h.eyebrow}
          </Reveal>
          <SplitHeading key={lang} as="h1" text={h.heroTitle} />
          <Reveal as="p" className="lead" delay={0.07}>
            {h.heroLead}
          </Reveal>
          <Reveal className="hero-ctas" delay={0.14}>
            <Magnetic><Link className="btn btn-invert" to="/robot-hand">{h.ctaControl}</Link></Magnetic>
            <Magnetic><Link className="btn btn-outline" to="/simulasi">{h.ctaSim}</Link></Magnetic>
          </Reveal>
          <Reveal as="dl" className="hero-stats" delay={0.21}>
            <div><dt>{h.statFingers}</dt><dd><CountUp to={5} /></dd></div>
            <div><dt>{h.statLink}</dt><dd>WiFi · USB</dd></div>
            <div><dt>{h.statInput}</dt><dd>{h.statInputVal}</dd></div>
            <div><dt>{h.statLed}</dt><dd>2 × 34 RGB</dd></div>
          </Reveal>
        </motion.div>
      </div>
      <div className="hero-model">
        <HeroViewer />
      </div>
    </section>
  );
}

// Bagian 01: Komponen utama — grid kartu membesar dengan animasi FLIP + 1 canvas 3D bersama.
function Components() {
  const { tr } = useI18n();
  const h = tr.home;
  const parts = h.parts;
  const [active, setActive] = useState(0);
  const cardRefs = useRef([]);
  const slotRefs = useRef([]);
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const firstRectsRef = useRef(null);
  const scrollTimerRef = useRef(null);

  useEffect(() => {
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-label', h.partsTitle);
    canvasRef.current = cv;

    const firstSlot = slotRefs.current[0];
    if (firstSlot) firstSlot.appendChild(cv);

    const viewer = createComponentViewer(cv);
    viewerRef.current = viewer;
    viewer?.show(parts[0].k);

    return () => {
      clearTimeout(scrollTimerRef.current);
      viewer?.dispose();
      viewerRef.current = null;
      cv.remove();
      canvasRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const cv = canvasRef.current;
    const slot = slotRefs.current[active];
    if (cv && slot && cv.parentElement !== slot) {
      slot.appendChild(cv);
    }
    if (viewerRef.current) {
      viewerRef.current.show(parts[active].k);
      viewerRef.current.resize();
    }

    const first = firstRectsRef.current;
    if (!first) return;
    firstRectsRef.current = null;

    const cards = cardRefs.current.filter(Boolean);
    cards.forEach((x, idx) => {
      const f = first.get(idx);
      if (!f) return;
      const l = x.getBoundingClientRect();
      const dx = f.left - l.left;
      const dy = f.top - l.top;
      const sx = f.width / (l.width || 1);
      const sy = f.height / (l.height || 1);

      if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02) {
        x.style.zIndex = '3';
        const bg = x.querySelector('.cp-bg');
        const inner = x.querySelector('.cp-in');
        if (bg) {
          bg.animate(
            [
              { transformOrigin: '0 0', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` },
              { transformOrigin: '0 0', transform: 'none' },
            ],
            { duration: FLIP_DUR, easing: FLIP_EASE }
          ).onfinish = () => {
            x.style.zIndex = '';
          };
        }
        if (inner) {
          inner.animate(
            [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }],
            { duration: FLIP_DUR, easing: 'linear' }
          );
        }
      } else if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        x.animate(
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
          { duration: FLIP_DUR, easing: FLIP_EASE }
        );
      }
    });

    clearTimeout(scrollTimerRef.current);
    const activeCard = cardRefs.current[active];
    if (activeCard) {
      scrollTimerRef.current = setTimeout(() => {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, FLIP_DUR * 0.6);
    }
  }, [active]);

  const selectCard = (idx) => {
    if (idx === active) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const cards = cardRefs.current;
      const map = new Map();
      cards.forEach((x, i) => {
        if (!x) return;
        x.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        map.set(i, x.getBoundingClientRect());
      });
      firstRectsRef.current = map;
    }
    setActive(idx);
  };

  return (
    <section className="section" id="komponen">
      <div className="container">
        <header className="section-head">
          <Reveal as="span" className="section-label" delay={0}>{h.partsLabel}</Reveal>
          <div className="section-title-row">
            <Reveal as="h2" delay={0.07}>{h.partsTitle}</Reveal>
          </div>
        </header>

        <div className="cmp" id="cmp">
          {parts.map((p, i) => {
            const on = i === active;
            return (
              <article
                key={p.k}
                ref={(el) => { cardRefs.current[i] = el; }}
                className={`cp ${on ? 'on' : ''}`}
                data-k={p.k}
                tabIndex={0}
                role="button"
                aria-expanded={on}
                aria-label={p.title}
                onClick={() => selectCard(i)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !on) {
                    e.preventDefault();
                    selectCard(i);
                  }
                }}
              >
                <div className="cp-bg" />
                <div className="cp-in">
                  <div className="cp-s">
                    <span className="cp-n">{pad(i)}</span>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                  <div className="cp-b">
                    <div className="cp-m" ref={(el) => { slotRefs.current[i] = el; }} />
                    <div className="cp-x">
                      <span className="cp-n">{pad(i)}</span>
                      <h3>{p.title}</h3>
                      <p>{p.desc}</p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Bagian 02: Fitur — daftar akordeon + panggung 3D sticky dengan caption animasi.
function Features() {
  const { tr } = useI18n();
  const h = tr.home;
  const features = h.features;
  const [active, setActive] = useState(0);
  const [capIdx, setCapIdx] = useState(0);
  const [capIn, setCapIn] = useState(true);
  const itemRefs = useRef([]);
  const capTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(capTimerRef.current), []);

  const activate = (idx, focus = false) => {
    if (idx === active) return;
    setActive(idx);
    clearTimeout(capTimerRef.current);
    setCapIn(false);
    capTimerRef.current = setTimeout(() => {
      setCapIdx(idx);
      setCapIn(true);
    }, 200);
    if (focus) {
      itemRefs.current[idx]?.focus({ preventScroll: true });
    }
  };

  const currentCap = features[capIdx];

  return (
    <section className="section" id="fitur">
      <div className="container">
        <header className="section-head">
          <Reveal as="span" className="section-label" delay={0}>{h.featuresLabel}</Reveal>
          <div className="section-title-row">
            <Reveal as="h2" delay={0.07}>{h.featuresTitle}</Reveal>
            <Reveal as="p" delay={0.14}>{h.featuresLead}</Reveal>
          </div>
        </header>

        <div className="fx">
          <ul className="feat" id="feat">
            {features.map((f, i) => {
              const on = i === active;
              return (
                <Reveal
                  key={f.k}
                  as="li"
                  delay={Math.min(i, 8) * 0.07}
                  className={on ? 'on' : ''}
                  tabIndex={0}
                  role="button"
                  aria-expanded={on}
                  aria-controls="fxStage"
                  onClick={() => activate(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activate(i);
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const next = (i + (e.key === 'ArrowDown' ? 1 : features.length - 1)) % features.length;
                      activate(next, false);
                      e.currentTarget.parentElement?.children[next]?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <div ref={(el) => { itemRefs.current[i] = el; }} className="fh">
                    <span>{pad(i)}</span>
                    <h3>{f.title}</h3>
                    <i className="fc" aria-hidden="true" />
                  </div>
                  <div className="fb">
                    <div className="fbi">
                      <p>{f.desc}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <div className="fx-stage" id="fxStage">
            <FeatureViewer id={features[active].k} />
            <div className="fx-hint">{h.dragToRotate}</div>
            <div className="fx-cap">
              <div className={capIn ? 'in' : ''}>
                <b>{pad(capIdx)} / {pad(features.length - 1)}</b>
                <h4>{currentCap.title}</h4>
                <p>{currentCap.cap}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pipeline() {
  const { tr } = useI18n();
  const h = tr.home;
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.6'] });
  return (
    <section className="section" id="alur" ref={ref}>
      <div className="container">
        <header className="section-head">
          <Reveal as="span" className="section-label" delay={0}>{h.flowLabel}</Reveal>
          <div className="section-title-row">
            <Reveal as="h2" delay={0.07}>{h.flowTitle}</Reveal>
            <Reveal as="p" delay={0.14}>{h.flowLead}</Reveal>
          </div>
        </header>
        <div className="pipeline-wrap">
          <div className="pipeline-line" aria-hidden="true">
            <motion.span style={{ scaleX: scrollYProgress }} />
          </div>
          <ol className="pipeline">
            {h.steps.map((s, i) => (
              <Reveal key={i} as="li" className="pipe-step" delay={i * 0.07}>
                <span className="pipe-num">{pad(i)}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  const { tr } = useI18n();
  const h = tr.home;
  return (
    <section className="section cta">
      <div className="container">
        <div className="cta-inner">
          <Reveal as="h2" delay={0}>{h.ctaTitle}</Reveal>
          <Reveal className="hero-ctas" delay={0.12}>
            <Magnetic><Link className="btn btn-invert" to="/simulasi">{h.ctaSimBtn}</Link></Magnetic>
            <Magnetic><Link className="btn btn-outline" to="/robot-hand">{h.ctaRobotBtn}</Link></Magnetic>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Page>
      <Hero />
      <Components />
      <Features />
      <Pipeline />
      <Cta />
    </Page>
  );
}
