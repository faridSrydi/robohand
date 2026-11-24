import { useCallback, useEffect, useState } from 'react';

const AUTH_EVENT = 'robohand-auth';

let cache = {
  checked: false,
  authenticated: false,
  user: null,
  turnstileSiteKey: '',
  turnstileMode: 'unconfigured',
  dbReady: false,
};

let inflight = null;

function broadcast(next) {
  cache = { ...cache, ...next };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: cache }));
  }
  return cache;
}

export async function fetchAuthState(force = false) {
  if (cache.checked && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    try {
      const r = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('status_' + r.status);
      const data = await r.json();
      return broadcast({
        checked: true,
        authenticated: Boolean(data.authenticated),
        user: data.user || null,
        turnstileSiteKey: data.turnstileSiteKey || '',
        turnstileMode: data.turnstileMode || 'unconfigured',
        dbReady: Boolean(data.dbReady),
      });
    } catch {
      return broadcast({ checked: true, authenticated: false, user: null });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function loginWithCredentials({ username, password, turnstileToken }) {
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, turnstileToken }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) {
      broadcast({ checked: true, authenticated: true, user: data.user || { username } });
      return { ok: true, user: data.user };
    }
    return {
      ok: false,
      reason: data.reason || 'login_failed',
      retrySec: data.retrySec,
    };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function logoutSession() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  broadcast({ checked: true, authenticated: false, user: null });
}

export function useAuth() {
  const [state, setState] = useState(cache);

  useEffect(() => {
    const onChange = (e) => setState(e.detail || cache);
    window.addEventListener(AUTH_EVENT, onChange);
    if (!cache.checked) {
      fetchAuthState();
    } else {
      setState(cache);
    }
    return () => window.removeEventListener(AUTH_EVENT, onChange);
  }, []);

  const refresh = useCallback(() => fetchAuthState(true), []);
  const login = useCallback((payload) => loginWithCredentials(payload), []);
  const logout = useCallback(() => logoutSession(), []);

  return { ...state, refresh, login, logout };
}
