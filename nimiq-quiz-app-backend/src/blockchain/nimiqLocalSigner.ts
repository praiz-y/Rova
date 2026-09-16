/**
 * Local Nimiq transaction signing (D048). Builds and signs a basic Nimiq
 * transaction entirely offline using `@nimiq/core`'s WASM primitives, so
 * broadcasting a payout/refund never depends on the RPC's wallet/keystore
 * methods (`importRawKey`/`unlockAccount`/`sendTransaction`) — confirmed
 * blocked ("Method not allowed") on the currently configured public
 * testnet RPC. `sendRawTransaction`, used to broadcast the result, does
 * not require the node to hold or manage the key at all.
 *
 * Kept narrow and self-contained (D042's key-isolation principle): this
 * module has no knowledge of contests/payouts and never reads
 * `NIMIQ_PAYOUT_PRIVATE_KEY` itself — the caller (payouts.ts) reads the
 * secret and passes it in per call. The key never leaves process memory
 * and is never sent to any RPC; only the final signed transaction bytes
 * are, via nimiqRpc.ts's broadcastRawTransaction.
 *
 * Verified 2026-09-15 against real testnet chain state before being wired
 * into payout code: a locally built+signed transaction was independently
 * parsed by the real RPC (`getRawTransactionInfo`, no broadcast) and
 * matched exactly, then a dust-value (1 luna) transaction was broadcast
 * for real and reached macro-block finality. See DECISIONS.md D048.
 */
import { Address, KeyPair, PrivateKey, TransactionBuilder } from '@nimiq/core'

/** Verified directly against core-rs-albatross primitives/src/networks.rs. */
export const NIMIQ_NETWORK_IDS = {
  main: 24,
  test: 5,
} as const

function resolveNetworkId(): number {
  const raw = process.env.NIMIQ_NETWORK_ID?.trim()
  if (!raw) return NIMIQ_NETWORK_IDS.test
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `NIMIQ_NETWORK_ID must be a positive integer (${NIMIQ_NETWORK_IDS.test} = testnet, ${NIMIQ_NETWORK_IDS.main} = mainnet)`
    )
  }
  return parsed
}

function hexToPrivateKey(hex: string): PrivateKey {
  const normalized = hex.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('NIMIQ_PAYOUT_PRIVATE_KEY must be a 64-character hex string (32 raw bytes)')
  }
  return PrivateKey.fromHex(normalized)
}

/** The address a given private key controls — used to sanity-check config before signing anything. */
export function addressFromPrivateKeyHex(privateKeyHex: string): string {
  const keyPair = KeyPair.derive(hexToPrivateKey(privateKeyHex))
  return keyPair.toAddress().toUserFriendlyAddress().replace(/\s+/g, '').toUpperCase()
}

export interface SignedTransaction {
  hex: string
  hash: string
}

/**
 * Builds, signs, and locally verifies a basic Nimiq transaction with a
 * data field — the same shape funding.ts already uses for deposits.
 * Offline only: does not contact any RPC. Throws on any invalid input
 * (e.g. sender === recipient, which Nimiq's protocol itself rejects).
 */
export function buildAndSignTransaction(params: {
  privateKeyHex: string
  recipientAddress: string
  valueLuna: bigint
  data: string
  validityStartHeight: number
}): SignedTransaction {
  const networkId = resolveNetworkId()
  const keyPair = KeyPair.derive(hexToPrivateKey(params.privateKeyHex))
  const sender = keyPair.toAddress()
  const recipient = Address.fromString(params.recipientAddress)

  const tx = TransactionBuilder.newBasicWithData(
    sender,
    recipient,
    new TextEncoder().encode(params.data),
    params.valueLuna,
    0n,
    params.validityStartHeight,
    networkId
  )
  keyPair.signTransaction(tx)
  tx.verify(1, networkId)

  return { hex: tx.toHex(), hash: tx.hash() }
}
