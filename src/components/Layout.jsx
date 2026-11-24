import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';

export function Logo({ className = 'logo' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#f5b82e" />
      <g fill="#111">
        <rect x="9.5" y="17" width="16" height="8" rx="2.5" />
        <rect x="9.5" y="13.5" width="3" height="5.5" rx="1" />
        <rect x="13.83" y="13.5" width="3" height="5.5" rx="1" />
        <rect x="18.17" y="13.5" width="3" height="5.5" rx="1" />
        <rect x="22.5" y="13.5" width="3" height="5.5" rx="1" />
        <rect x="9.5" y="8" width="3" height="4.5" rx="1.5" />
        <rect x="13.83" y="5.5" width="3" height="7" rx="1.5" />
        <rect x="18.17" y="7" width="3" height="5.5" rx="1.5" />
        <rect x="22.5" y="9.5" width="3" height="3" rx="1.5" />
        <path d="M9.5 22.5 5.8 18" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
      <circle cx="17.5" cy="21" r="1.2" fill="#f5b82e" />
    </svg>
  );
}

const LINKS = [
  { to: '/', label: 'Beranda' },
  { to: '/simulasi', label: 'Simulasi' },
  { to: '/robot-hand', label: 'Kontrol' },
];

function ThemeIcon({ theme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  );
}

function Nav() {
  const { theme, toggle } = useTheme();
  const { lang, setLang, toggleLang, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  const links = [
    { to: '/', label: tr.nav.home },
    { to: '/simulasi', label: tr.nav.sim },
    { to: '/robot-hand', label: tr.nav.control },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth > 860) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <>
      <header className={`nav ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
        <div className="nav-inner">
          <Link className="brand" to="/" aria-label={tr.nav.brandAria}>
            <Logo />
            <span>RoboticHand</span>
          </Link>
          <nav className="nav-links" aria-label={tr.nav.mainAria}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className="nav-link">
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                    <span className="nav-label">{l.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="nav-actions">
            <button
              type="button"
              className="lang-btn nav-lang"
              onClick={toggleLang}
              aria-label={tr.nav.switchLang}
              title={tr.nav.switchLang}
            >
              <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
              <i aria-hidden="true">/</i>
              <span className={lang === 'id' ? 'is-on' : ''}>ID</span>
            </button>
            <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? tr.nav.lightTheme : tr.nav.darkTheme}>
              <ThemeIcon theme={theme} />
            </button>
            <Link className="btn btn-primary btn-sm nav-cta" to="/robot-hand">{tr.nav.openControl}</Link>
            <button
              type="button"
              className="icon-btn burger"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? tr.nav.closeMenu : tr.nav.openMenu}
            >
              <span className="burger-line burger-top" />
              <span className="burger-line burger-bot" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="mobile-backdrop"
              className="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              key="mobile-drawer"
              id="mobile-menu"
              className="mobile-drawer"
              aria-label={tr.nav.mobileAria}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mobile-drawer-list">
                {links.map((l, i) => (
                  <motion.div
                    key={l.to}
                    className="mobile-float-item"
                    initial={{ opacity: 0, x: 34, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 22, scale: 0.96 }}
                    transition={{
                      type: 'spring',
                      stiffness: 340,
                      damping: 28,
                      mass: 0.82,
                      delay: 0.04 + i * 0.055,
                    }}
                  >
                    <NavLink
                      to={l.to}
                      end={l.to === '/'}
                      className={({ isActive }) => `mobile-link ${isActive ? 'is-active' : ''}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="mobile-link-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="mobile-link-text">{l.label}</span>
                      <span className="mobile-link-arrow" aria-hidden="true">→</span>
                    </NavLink>
                  </motion.div>
                ))}
              </div>
              <motion.div
                className="mobile-drawer-foot"
                initial={{ opacity: 0, x: 34, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 22, scale: 0.96 }}
                transition={{
                  type: 'spring',
                  stiffness: 340,
                  damping: 28,
                  mass: 0.82,
                  delay: 0.04 + links.length * 0.055,
                }}
              >
                <div className="mobile-lang-switch" role="group" aria-label={tr.nav.switchLang}>
                  <button
                    type="button"
                    className={lang === 'en' ? 'is-on' : ''}
                    aria-pressed={lang === 'en'}
                    onClick={() => setLang('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={lang === 'id' ? 'is-on' : ''}
                    aria-pressed={lang === 'id'}
                    onClick={() => setLang('id')}
                  >
                    ID
                  </button>
                </div>
                <Link className="btn btn-primary mobile-cta" to="/robot-hand" onClick={() => setOpen(false)}>
                  {tr.nav.openControl}
                </Link>
              </motion.div>
              <motion.div
                className="mobile-close-row"
                initial={{ opacity: 0, x: 34, scale: 0.88 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 22, scale: 0.9 }}
                transition={{
                  type: 'spring',
                  stiffness: 340,
                  damping: 28,
                  mass: 0.82,
                  delay: 0.04 + (links.length + 1) * 0.055,
                }}
              >
                <button
                  type="button"
                  className="mobile-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label={tr.nav.closeMenu}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </motion.div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Footer() {
  const { tr } = useI18n();
  const links = [
    { to: '/', label: tr.nav.home },
    { to: '/simulasi', label: tr.nav.sim },
    { to: '/robot-hand', label: tr.nav.control },
  ];
  return (
    <motion.footer
      className="footer"
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/">
              <Logo />
              <span>RoboticHand</span>
            </Link>
            <p>{tr.footer.desc}</p>
          </div>
          <div className="footer-col">
            <h4>{tr.footer.pages}</h4>
            <ul>
              {links.map((l) => (
                <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div className="footer-col">
            <h4>{tr.footer.builtWith}</h4>
            <ul>
              {tr.footer.tech.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} RoboticHand</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {tr.footer.backToTop}
          </button>
        </div>
      </div>
      <div className="footer-mark" aria-hidden="true">
        <span>ROBOTICHAND</span>
      </div>
    </motion.footer>
  );
}

// Transisi halaman: hanya animasi masuk (fade + geser ringan). Tidak ada animasi keluar
// karena exit yang nyangkut membuat halaman berikutnya tidak muncul.
// Mengikuti prefers-reduced-motion lewat MotionConfig.
export function Page({ children, className = '' }) {
  return (
    <motion.main
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.main>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const fullBleed = location.pathname === '/simulasi' || location.pathname === '/robot-hand';
  return (
    <>
      <Nav />
      <div className={fullBleed ? 'app-body is-fullbleed' : 'app-body'}>{children}</div>
      {!fullBleed && <Footer />}
    </>
  );
}
