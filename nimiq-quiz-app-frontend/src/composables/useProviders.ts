/**
 * useProviders — the proper way to access a Nimiq wallet, on any platform.
 *
 * Two backends, one shared surface (D050):
 * - Nimiq Pay: `init()` from `@nimiq/mini-app-sdk` resolves with a fully-typed
 *   `NimiqProvider` once Nimiq Pay injects it (or rejects on timeout). See
 *   https://nimiq.dev/mini-apps/mini-app-tutorial. Ported from
 *   nimiq-mini-app-demo (T001-T003 validated this against real Nimiq Pay).
 * - Desktop/any other browser: nothing injects that provider, so we fall back
 *   to the Nimiq Hub API (`@nimiq/hub-api`) — the same popup-based
 *   connect/sign/pay flow every pre-Mini-App Nimiq dApp (wallet.nimiq.com
 *   included) has used for years. It needs no Nimiq Pay wrapper at all.
 *
 * Both are wrapped behind the same `WalletAdapter` shape (`signIn`,
 * `sendBasicTransactionWithData`) so callers (useSession.ts,
 * ContestEditorPage.vue) never need to know which backend is live.
 *
 * `signIn(message)` is deliberately ONE call that both picks an account and
 * signs, not two (D051). A real desktop test found that Nimiq Pay's
 * `listAccounts()` + `sign()` sequence, when ported naively to Hub, breaks:
 * Hub's `chooseAddress()` and `signMessage()` each open a real browser
 * popup, and the login-challenge network round-trip that used to sit
 * between "pick account" and "sign" consumes the click's user-activation
 * token, so the second popup gets silently blocked ("Failed to open
 * popup"). Hub's `signMessage()` already shows its own account picker when
 * `signer` is omitted, so the fix is one popup total: fetch the challenge
 * first (now address-agnostic server-side, D051), then a single
 * `signIn(message)` call. The Nimiq Pay adapter follows the same shape for
 * consistency, even though chaining isn't a popup risk there (its
 * `listAccounts`/`sign` talk to an injected in-page provider, not a real
 * browser popup).
 *
 * The Hub adapter normalizes `HubApi`'s calls (and its throw-on-cancel
 * behavior) to match the shared shape, including hex-encoding Hub's raw
 * `Uint8Array` signature output and reusing D048's broadcast path for
 * Hub-signed transactions (Hub only signs client-side; it does not
 * reliably relay to the network the way `sendBasicTransactionWithData`
 * does inside Nimiq Pay).
 *
 * Ethereum: the injected `window.ethereum` is used directly via the standard
 * EIP-1193 `request({ method, params })` interface. Not needed for
 * Phase 1 (D041: NIM-only MVP), kept for parity with the demo in case a
 * later phase needs it.
 *
 * Readiness/provider state lives in module scope so it is resolved exactly
 * once and shared across the whole app.
 */
import { ref, readonly, type Ref } from 'vue'
import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'
import HubApi from '@nimiq/hub-api'

const NIMIQ_INIT_TIMEOUT = 10_000
const HUB_URL = import.meta.env.VITE_NIMIQ_HUB_URL ?? 'https://hub.nimiq-testnet.com'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const HUB_APP_NAME = 'ROVA'

/**
 * hub-api resolves only when the Hub popup replies from the exact origin it
 * was constructed with: @nimiq/rpc's PostMessageRpcClient compares
 * `message.origin` against `new URL(endpoint).origin` and returns early on a
 * mismatch — before it ever inspects the payload (see its `_receive` and
 * `_connect`). The request then neither resolves nor rejects, so a wrong
 * VITE_NIMIQ_HUB_URL presents as an indefinite spinner with no error at all.
 * This bound converts that silence into something the user can act on.
 *
 * The abandoned request is not cancelled; if it settles later the result is
 * simply discarded, which is the safe outcome for a login or a payment.
 */
const HUB_REQUEST_TIMEOUT_MS =
  Number.parseInt(import.meta.env.VITE_NIMIQ_HUB_TIMEOUT_MS ?? '', 10) || 120_000

function withHubTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${action} did not respond within ${Math.round(HUB_REQUEST_TIMEOUT_MS / 1000)} seconds. ` +
              'If the wallet window is still open, close it and try again.'
          )
        ),
      HUB_REQUEST_TIMEOUT_MS
    )
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/**
 * hub-api's errors carry a numeric `code` alongside the message — the only
 * thing that distinguishes "the user cancelled" from "the Hub itself failed".
 * Keeping just the message made those two indistinguishable in the header,
 * and made the origin-mismatch hang above read like a flat refusal.
 */
function describeHubError(err: any, fallback: string): string {
  const message = typeof err?.message === 'string' && err.message ? err.message : fallback
  const code = err?.code
  return code === undefined || code === null ? message : `${message} (code ${code})`
}

export type WalletMode = 'nimiq-pay' | 'hub'

export interface SignInResult {
  address: string
  publicKey: string
  signature: string
}
interface ErrorResponse {
  error?: { message?: string }
}

export interface WalletAdapter {
  /** Picks an account (if needed) and signs `message` in one step (D051). */
  signIn(message: string): Promise<SignInResult | ErrorResponse>
  sendBasicTransactionWithData(tx: { recipient: string; value: number; data: string }): Promise<string | ErrorResponse>
}

const walletMode = ref<WalletMode | null>(null)
const nimiqReady = ref(false)
const nimiqConnecting = ref(true)
const nimiqError = ref<string | null>(null)

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function buildNimiqPayAdapter(provider: NimiqProvider): WalletAdapter {
  return {
    async signIn(message: string) {
      const accounts = await provider.listAccounts()
      if (!Array.isArray(accounts) || accounts.length === 0) {
        const err = !Array.isArray(accounts) ? accounts.error?.message : null
        return { error: { message: err ?? 'No Nimiq account available' } }
      }
      const address = accounts[0]
      const signed = await provider.sign(message)
      if (!('publicKey' in signed)) {
        return { error: { message: signed.error?.message ?? 'Wallet declined to sign the login challenge' } }
      }
      return { address, publicKey: signed.publicKey, signature: signed.signature }
    },
    sendBasicTransactionWithData: (tx) => provider.sendBasicTransactionWithData(tx),
  }
}

function buildHubAdapter(): WalletAdapter {
  const hubApi = new HubApi(HUB_URL)

  // TEMP diagnostic — remove once the desktop checkout hang is resolved. If
  // this never prints, the Hub adapter was never built (i.e. the page is
  // still running Nimiq Pay's adapter, or init() hasn't settled yet).
  console.info('[wallet] Hub adapter active:', HUB_URL)

  return {
    async signIn(message: string) {
      try {
        // `signer` intentionally omitted: Hub shows its own account picker
        // as part of this same popup, so this is one popup total, not two.
        const signed = await withHubTimeout(
          hubApi.signMessage({ appName: HUB_APP_NAME, message }),
          'Signing in with the Nimiq wallet'
        )
        return {
          address: signed.signer,
          publicKey: bytesToHex(signed.signerPublicKey),
          signature: bytesToHex(signed.signature),
        }
      } catch (err: any) {
        return { error: { message: describeHubError(err, 'Wallet declined to sign the login challenge') } }
      }
    },
    async sendBasicTransactionWithData(tx: { recipient: string; value: number; data: string }) {
      // TEMP diagnostic — remove once the desktop checkout hang is resolved.
      // If this prints and nothing follows, the Hub popup never replied.
      console.info('[wallet] checkout →', { recipient: tx.recipient, value: tx.value, data: tx.data })
      try {
        const signed = await withHubTimeout(
          hubApi.checkout({
            appName: HUB_APP_NAME,
            recipient: tx.recipient,
            value: tx.value,
            extraData: tx.data,
          }),
          'The deposit transaction'
        )
        console.info('[wallet] checkout resolved, broadcasting')
        const res = await fetch(`${API_BASE}/api/blockchain/broadcast`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hex: signed.serializedTx }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { error: { message: body.error ?? 'Failed to broadcast the deposit transaction' } }
        }
        return body.hash as string
      } catch (err: any) {
        // TEMP diagnostic — remove once the desktop checkout hang is resolved.
        console.warn('[wallet] checkout failed:', err)
        return { error: { message: describeHubError(err, 'Wallet declined the deposit transaction') } }
      }
    },
  }
}

const nimiqInit: Promise<WalletAdapter> = init({ timeout: NIMIQ_INIT_TIMEOUT })
  .then((provider: NimiqProvider) => {
    walletMode.value = 'nimiq-pay'
    nimiqReady.value = true
    return buildNimiqPayAdapter(provider)
  })
  .catch(() => {
    // Not running inside Nimiq Pay's WebView (e.g. a desktop browser) — the
    // Hub API needs no host app at all, so this is a graceful fallback, not
    // an error (D050).
    try {
      const adapter = buildHubAdapter()
      walletMode.value = 'hub'
      nimiqReady.value = true
      return adapter
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      nimiqError.value = message || 'No Nimiq wallet connection available. Reload and try again.'
      throw err
    }
  })
  .finally(() => {
    nimiqConnecting.value = false
  })

/** Await the resolved wallet adapter. Only rejects if both backends fail to initialize. */
async function getWallet(): Promise<WalletAdapter> {
  return nimiqInit
}

export interface MethodRunner {
  loading: Ref<boolean>
  output: Ref<any>
  runMethod(name: string, fn: () => Promise<any>): Promise<any>
}

export function useMethodRunner(): MethodRunner {
  const loading = ref(false)
  const output = ref<any>(null)

  async function runMethod(name: string, fn: () => Promise<any>) {
    loading.value = true
    output.value = { method: name, status: 'pending...' }
    try {
      const result = await fn()
      output.value = { method: name, result }
      return result
    } catch (error: any) {
      output.value = { method: name, error: error?.message || error }
      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, output, runMethod }
}

export function useProviders() {
  return {
    nimiqReady: readonly(nimiqReady),
    nimiqConnecting: readonly(nimiqConnecting),
    nimiqError: readonly(nimiqError),
    walletMode: readonly(walletMode),
    getWallet,
  }
}
