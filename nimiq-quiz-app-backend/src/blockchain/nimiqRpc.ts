/**
 * Nimiq RPC access for backend-side deposit detection (D042, D025 — reads
 * must happen backend-side, never trusting the Mini App's injected
 * provider, which T009 already showed is unreliable for reads).
 *
 * Uses `nimiq-rpc-client-ts` against a configurable RPC endpoint. Defaults
 * to https://rpc.nimiqwatch.com, a free third-party public RPC — verified
 * live and responsive against real mainnet data as of 2026-09-09 (current
 * block ~61.1M, batch length empirically confirmed at 60 blocks, matching
 * the sourced mainnet policy constant). This is NOT Nimiq Foundation
 * infrastructure and carries availability/trust risk appropriate for MVP,
 * not production reliability — set NIMIQ_RPC_URL to a self-hosted or
 * otherwise trusted node before relying on this for real fund volume.
 */
import { initRpcClient } from 'nimiq-rpc-client-ts/client'
import { setDefaultResultOrder } from 'node:dns'
import {
  getBlockNumber,
  getMacroBlockAfter,
  getRawTransactionInfo,
  getTransactionByHash,
  getTransactionsByAddress,
  sendRawTransaction,
} from 'nimiq-rpc-client-ts/http'
import type { Transaction } from 'nimiq-rpc-client-ts/types'

const RPC_URL = process.env.NIMIQ_RPC_URL ?? 'https://rpc.testnet.nimiqwatch.com'

// On this Windows host the public testnet RPC resolves to IPv6 and IPv4,
// but the IPv6 route stalls. Node's fetch then waits until our RPC timeout
// rather than reaching the working IPv4 endpoint. Prefer IPv4 while keeping
// the configured hostname and TLS validation intact.
setDefaultResultOrder('ipv4first')
initRpcClient({ url: RPC_URL })

// nimiq-rpc-client-ts catches fetch()'s own throw and does `JSON.stringify(e)`
// on it (see its http.mjs). Native Error/TypeError objects have no enumerable
// own properties, so this always collapses to the literal string "{}",
// destroying the real reason (DNS failure, connection reset, TLS error, ...)
// before it ever reaches this module. We can't fix the library, so we
// intercept the global fetch it calls internally, capture the real error
// here, and let requireRpcSuccess/formatRpcError below fold it back in.
let lastRpcFetchError: { message: string; at: number } | null = null

function describeFetchError(error: unknown, depth = 0): string {
  if (error && typeof error === 'object' && depth < 4) {
    const err = error as { name?: string; message?: string; cause?: unknown; errors?: unknown[] }
    const parts: string[] = []
    if (err.name || err.message) parts.push(`${err.name ?? 'Error'}: ${err.message ?? ''}`.trim())
    if (err.cause !== undefined) parts.push(`caused by ${describeFetchError(err.cause, depth + 1)}`)
    if (Array.isArray(err.errors) && err.errors.length) {
      parts.push(`[${err.errors.map((e) => describeFetchError(e, depth + 1)).join('; ')}]`)
    }
    if (parts.length) return parts.join(' ')
  }
  return String(error)
}

const originalFetch = globalThis.fetch
if (typeof originalFetch === 'function') {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      return await originalFetch(input, init)
    } catch (error) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      if (url?.startsWith(RPC_URL)) {
        const detail = describeFetchError(error)
        lastRpcFetchError = { message: detail, at: Date.now() }
        console.error(`[nimiqRpc] underlying fetch to ${RPC_URL} failed: ${detail}`)
      }
      throw error
    }
  }) as typeof fetch
}

const RPC_TIMEOUT_MS = Number.parseInt(process.env.NIMIQ_RPC_TIMEOUT_MS ?? '15000', 10)
// The shared testnet address accumulates many historical transactions. The
// public endpoint responds quickly for a recent batch but can exceed the
// timeout when asked to serialize 100 records. New sponsor deposits are
// necessarily recent, so 30 is a reliable MVP window and remains configurable.
const RPC_TRANSACTION_LOOKUP_LIMIT = Math.max(
  1,
  Math.min(100, Number.parseInt(process.env.NIMIQ_RPC_TRANSACTION_LOOKUP_LIMIT ?? '30', 10) || 30)
)

function withTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${action} timed out after ${RPC_TIMEOUT_MS}ms`)), RPC_TIMEOUT_MS)
  })
  return Promise.race([promise, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

/**
 * Public RPCs occasionally drop a single request. Use this only for
 * read-only operations; broadcasting stays a single attempt so a caller can
 * handle its transaction hash deterministically.
 */
async function readWithRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }
  }
  throw lastError
}

/**
 * A transaction is finalized once the macro block ending its batch has
 * actually been produced (chain head has reached/passed it) — Albatross
 * gives true finality via Tendermint-style 2/3+ validator vote on that
 * macro block, not probabilistic confirmation depth.
 */
export async function isTransactionFinalized(blockNumber: number): Promise<boolean> {
  return readWithRetry(async () => {
    const [headOk, headError, head] = await withTimeout(getBlockNumber(), 'Fetch Nimiq head block')
    const [macroOk, macroError, macroBlockNumber] = await withTimeout(
      getMacroBlockAfter({ blockNumber }),
      'Fetch Nimiq finality macro block'
    )
    const currentHead = requireRpcSuccess(headOk, headError, head, 'Fetch Nimiq head block')
    const finalityBlock = requireRpcSuccess(macroOk, macroError, macroBlockNumber, 'Fetch Nimiq finality macro block')
    return currentHead >= finalityBlock
  })
}

export async function getIncomingTransactions(address: string, max = RPC_TRANSACTION_LOOKUP_LIMIT): Promise<Transaction[]> {
  return readWithRetry(async () => {
    const [ok, error, transactions] = await withTimeout(
      getTransactionsByAddress({ address, max }),
      'Fetch Nimiq incoming transactions'
    )
    return requireRpcSuccess(ok, error, transactions, 'Fetch Nimiq incoming transactions')
  })
}

function requireRpcSuccess<T>(ok: boolean, error: unknown, value: T | undefined | null, action: string): T {
  if (!ok || value == null) {
    throw new Error(formatRpcError(error, action))
  }
  return value
}

function formatRpcError(error: unknown, action: string): string {
  if (typeof error === 'string' && error && error !== '{}') return `${action}: ${error}`
  if (error instanceof Error && error.message) return `${action}: ${error.message}`
  // nimiq-rpc-client-ts serializes a native fetch TypeError as "{}", losing
  // its message. The fetch interceptor above captures the real error at the
  // moment it happens; fold it back in here if it's fresh enough to be the
  // same failure (retries + our own timeout mean this fires within ~1.5s).
  const recent = lastRpcFetchError && Date.now() - lastRpcFetchError.at < 5000 ? lastRpcFetchError.message : null
  const reason = recent ? ` Underlying error: ${recent}.` : ''
  return `${action} failed because the configured RPC (${RPC_URL}) did not return a usable response.${reason} Check NIMIQ_RPC_URL and run the testnet preflight.`
}

/**
 * Current chain head, needed as a transaction's `validityStartHeight`
 * (D048: locally-signed transactions need this to build the transaction
 * before it can be broadcast at all).
 */
export async function getCurrentBlockNumber(): Promise<number> {
  return readWithRetry(async () => {
    const [ok, error, head] = await withTimeout(getBlockNumber(), 'Fetch Nimiq head block')
    return requireRpcSuccess(ok, error, head, 'Fetch Nimiq head block')
  })
}

/**
 * The macro block number that finalizes `blockNumber`'s batch. This is a
 * deterministic function of `blockNumber` alone (Albatross batches are
 * fixed-length), so callers polling for finality should fetch it once and
 * then just re-check `getCurrentBlockNumber()` — recomputing it every poll
 * (as isTransactionFinalized does, since it's also used for a single
 * one-shot check by funding detection) wastes RPC calls against a
 * rate-limited public endpoint.
 */
export async function getFinalityMacroBlock(blockNumber: number): Promise<number> {
  return readWithRetry(async () => {
    const [ok, error, macroBlockNumber] = await withTimeout(
      getMacroBlockAfter({ blockNumber }),
      'Fetch Nimiq finality macro block'
    )
    return requireRpcSuccess(ok, error, macroBlockNumber, 'Fetch Nimiq finality macro block')
  })
}

/**
 * Parses/validates a raw signed transaction against the node without
 * broadcasting it (D048) — a real pre-flight check before moving funds,
 * not just a local sanity check. Returns the RPC's own read of the
 * transaction (recipient, value, fee, data, networkId, ...).
 */
export async function checkRawTransaction(rawTransactionHex: string): Promise<Transaction> {
  return readWithRetry(async () => {
    const [ok, error, transaction] = await withTimeout(
      getRawTransactionInfo({ rawTransaction: rawTransactionHex }),
      'Validate raw payout transaction'
    )
    return requireRpcSuccess(ok, error, transaction, 'Validate raw payout transaction')
  })
}

/**
 * Broadcasts an already-signed raw transaction (D048). Unlike the RPC's
 * wallet-keystore methods (`importRawKey`/`sendTransaction`), this does not
 * require the node to hold or manage the private key — signing happens
 * entirely locally in payouts.ts before this is ever called. Most public
 * RPCs that block wallet/keystore methods still permit this.
 */
export async function broadcastRawTransaction(rawTransactionHex: string): Promise<string> {
  const [ok, error, hash] = await withTimeout(
    sendRawTransaction({ rawTransaction: rawTransactionHex }),
    'Broadcast payout transaction'
  )
  return requireRpcSuccess(ok, error, hash, 'Broadcast payout transaction')
}

export async function getTransaction(hash: string): Promise<Transaction | null> {
  const [ok, , transaction] = await withTimeout(getTransactionByHash({ hash }), 'Fetch Nimiq transaction by hash')
  if (!ok || !transaction) return null
  return transaction
}

export type { Transaction }
