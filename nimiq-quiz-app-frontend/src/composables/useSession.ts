/**
 * Wallet-based session (D004): connect the Nimiq wallet, sign a
 * backend-issued challenge, and hold the resulting session/user state.
 *
 * Talks to the backend implemented in nimiq-quiz-app-backend
 * (src/auth/routes.ts, src/users/routes.ts) — see TESTING.md T058-T060 for
 * the verified request/response shapes this relies on.
 */
import { ref, readonly } from 'vue'
import { useProviders } from './useProviders'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface CurrentUser {
  id: string
  address: string
  username: string | null
}

const user = ref<CurrentUser | null>(null)
const connecting = ref(false)
const error = ref<string | null>(null)

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

/**
 * Connect the wallet and complete the sign-in flow against the backend.
 *
 * The challenge is fetched *before* the wallet call, and `signIn` is a
 * single wallet call that both picks an account and signs (D051) — not a
 * pick-then-sign pair. On the Hub API desktop fallback (D050) those are two
 * separate browser popups, and a real test found that a network round-trip
 * (the old fetch-challenge-with-address-already-known step) sitting between
 * them consumed the click's user-activation, so the second popup was
 * silently blocked ("Failed to open popup"). Keeping exactly one wallet
 * call after the network fetch avoids that regardless of which backend is
 * live.
 */
async function connect(): Promise<void> {
  const { getWallet } = useProviders()
  connecting.value = true
  error.value = null
  try {
    const nimiq = await getWallet()
    const { message } = await apiFetch('/api/auth/challenge', { method: 'POST' })

    const signed = await nimiq.signIn(message)
    if (!('address' in signed)) {
      throw new Error(signed.error?.message ?? 'Wallet declined to sign the login challenge')
    }

    const result = await apiFetch('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message,
        publicKey: signed.publicKey,
        signature: signed.signature,
      }),
    })
    user.value = result
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to connect wallet'
    throw err
  } finally {
    connecting.value = false
  }
}

async function refresh(): Promise<void> {
  try {
    user.value = await apiFetch('/api/users/me')
  } catch {
    user.value = null
  }
}

async function setUsername(username: string): Promise<void> {
  const result = await apiFetch('/api/users/username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
  if (user.value) user.value.username = result.username
}

async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  user.value = null
}

/**
 * Phase 5: called by any authenticated API call elsewhere (useContests.ts)
 * that gets a 401 mid-session — expired/invalid JWT, or a redeploy that
 * rotated SESSION_JWT_SECRET. Without this, `user` stays stale (the header
 * keeps showing "connected") while every action silently fails with
 * "Not authenticated" — exactly the silent-failure trap D030 exists to
 * prevent. Clearing `user` here makes the header immediately revert to
 * "Connect Wallet", and `error` carries a clear, actionable message.
 */
function invalidateSession(message = 'Your session expired. Reconnect your wallet to continue.'): void {
  user.value = null
  error.value = message
}

export function useSession() {
  return {
    user: readonly(user),
    connecting: readonly(connecting),
    error: readonly(error),
    connect,
    refresh,
    setUsername,
    logout,
  }
}

export { invalidateSession }
