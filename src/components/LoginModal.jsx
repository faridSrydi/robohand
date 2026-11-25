import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Logo } from './Layout';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise = null;
function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`);
    if (existing) {
      const check = () => (window.turnstile ? resolve(window.turnstile) : setTimeout(check, 60));
      check();
      return;
    }
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const wait = (tries = 0) => {
        if (window.turnstile) return resolve(window.turnstile);
        if (tries > 60) return reject(new Error('turnstile_timeout'));
        setTimeout(() => wait(tries + 1), 60);
      };
      wait();
    };
    s.onerror = () => reject(new Error('turnstile_load_error'));
    document.head.appendChild(s);
  });
  return turnstileScriptPromise;
}

export default function LoginModal({ turnstileEnabled = true, siteKey, mode, onSubmit, onCancel }) {
  const { theme } = useTheme();
  const { lang, tr } = useI18n();
  const a = tr.auth;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [token, setToken] = useState('');
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetErr, setWidgetErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const slotRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  // Render widget Cloudflare Turnstile (otomatis mengikuti tema gelap/terang & bahasa)
  useEffect(() => {
    if (!turnstileEnabled || !siteKey) return undefined;
    let alive = true;
    setWidgetReady(false);
    setWidgetErr('');
    setToken('');

    loadTurnstileScript()
      .then((ts) => {
        if (!alive || !ts || !slotRef.current) return;
        if (widgetIdRef.current != null) {
          try { ts.remove(widgetIdRef.current); } catch {}
          widgetIdRef.current = null;
        }
        slotRef.current.innerHTML = '';
        widgetIdRef.current = ts.render(slotRef.current, {
          sitekey: siteKey,
          theme: theme === 'light' ? 'light' : 'dark',
          language: lang === 'id' ? 'id' : 'en',
          appearance: 'always',
          callback: (tok) => {
            if (!alive) return;
            setToken(tok || '');
            setError('');
          },
          'expired-callback': () => {
            if (!alive) return;
            setToken('');
          },
          'error-callback': () => {
            if (!alive) return;
            setToken('');
            setWidgetErr(a.errTurnstileLoad);
          },
        });
        setWidgetReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setWidgetErr(a.errTurnstileLoad);
      });

    return () => {
      alive = false;
      if (window.turnstile && widgetIdRef.current != null) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [turnstileEnabled, siteKey, theme, lang, a.errTurnstileLoad]);

  const resetTurnstile = () => {
    setToken('');
    if (window.turnstile && widgetIdRef.current != null) {
      try { window.turnstile.reset(widgetIdRef.current); } catch {}
    }
  };

  const mapError = (reason, retrySec) => {
    switch (reason) {
      case 'invalid_credentials': return a.errInvalid;
      case 'turnstile_missing': return a.errTurnstileMissing;
      case 'turnstile_failed': return a.errTurnstileFailed;
      case 'turnstile_unconfigured': return a.errTurnstileConfig;
      case 'turnstile_network': return a.errTurnstileLoad;
      case 'db_unavailable': return a.errDb;
      case 'rate_limited': return a.errRateLimit(retrySec || 60);
      default: return a.errGeneric;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError(a.errEmpty);
      return;
    }
    if (turnstileEnabled && !token) {
      setError(a.errTurnstileMissing);
      return;
    }

    setError('');
    setSubmitting(true);
    const res = await onSubmit({
      username: username.trim(),
      password,
      turnstileToken: turnstileEnabled ? token : '',
    });
    setSubmitting(false);

    if (!res?.ok) {
      setError(mapError(res?.reason, res?.retrySec));
      if (turnstileEnabled) resetTurnstile();
    }
  };

  return (
    <motion.div
      className="auth-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-head">
          <div className="auth-brand">
            <Logo className="logo" />
            <div>
              <span className="auth-eyebrow">{a.eyebrow}</span>
              <h2 id="auth-modal-title">{a.title}</h2>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn auth-close"
            onClick={onCancel}
            disabled={submitting}
            aria-label={a.backHome}
            title={a.backHome}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="auth-desc">{turnstileEnabled ? a.desc : a.descNoCf}</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-user">{a.username}</label>
            <input
              id="auth-user"
              type="text"
              autoComplete="username"
              autoFocus
              spellCheck={false}
              placeholder={a.usernamePh}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-pass">{a.password}</label>
            <div className="auth-pw-wrap">
              <input
                id="auth-pass"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={a.passwordPh}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? a.hidePass : a.showPass}
              >
                {showPw ? a.hide : a.show}
              </button>
            </div>
          </div>

          {turnstileEnabled && (
            <div className="auth-turnstile">
              {siteKey ? (
                <>
                  {!widgetReady && !widgetErr && (
                    <div className="auth-ts-loading">{a.loadingCf}</div>
                  )}
                  <div ref={slotRef} className="auth-ts-slot" />
                  {mode === 'test' && (
                    <span className="auth-ts-badge">{a.testModeNote}</span>
                  )}
                </>
              ) : (
                <p className="auth-err">{a.errTurnstileConfig}</p>
              )}
              {widgetErr && <p className="auth-err">{widgetErr}</p>}
            </div>
          )}

          {error && (
            <div className="auth-err" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting || (turnstileEnabled && (!siteKey || !token))}
          >
            {submitting ? a.signingIn : a.signIn}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
