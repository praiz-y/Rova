/**
 * The bearer-token half of the session.
 *
 * The backend issues the session two ways: an httpOnly cookie, and the same
 * JWT in the /api/auth/verify response body. This module owns the second one.
 *
 * Why both — the cookie alone does not survive the Nimiq Pay webview. The
 * frontend (*.vercel.app) and the API (*.up.railway.app) are different
 * *sites*, because both suffixes are on the Public Suffix List, so the cookie
 * has to be SameSite=None; Secure. Desktop browsers accept that. In-app
 * webviews (iOS WKWebView under ITP, Android WebView) drop third-party cookies
 * outright, and the symptom is deceptive: the wallet connects, /api/auth/verify
 * returns 200, and then every authenticated request after it fails with "Not
 * authenticated". The header has no such problem — it is a string we control
 * and attach ourselves.
 *
 * localStorage rather than sessionStorage: the session is 30 days and closing
 * the webview shouldn't sign anyone out. Every access is wrapped in try/catch
 * because localStorage throws outright in some privacy modes rather than
 * returning null, and an exception escaping here would take down every API
 * call in the app at once. A failed write is survivable — the cookie still
 * carries the session wherever it is accepted.
 */
const STORAGE_KEY = 'rova.session.token'

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string): void {
  // Guarded because the frontend can be deployed ahead of the backend. An
  // older /api/auth/verify returns no `token` field at all, and localStorage
  // stringifies whatever it is handed — so an unguarded write would store the
  // literal text "undefined" and every later request would send `Bearer
  // undefined`. The backend rejects that and falls back to the cookie, which
  // means desktop would look fine while mobile stayed broken: the exact
  // failure this module exists to fix, now silent.
  if (typeof token !== 'string' || token.length === 0) return
  try {
    window.localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Non-fatal, per the note above.
  }
}

export function clearSessionToken(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Non-fatal. The server-side cookie is cleared by /api/auth/logout.
  }
}

/**
 * Headers to merge into every API call. Returns `{}` when there is no token,
 * so callers can spread it unconditionally without a null check.
 *
 * Merge order at each call site puts this before the caller's own headers, so
 * a deliberate Authorization override still wins.
 */
export function authHeaders(): Record<string, string> {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
