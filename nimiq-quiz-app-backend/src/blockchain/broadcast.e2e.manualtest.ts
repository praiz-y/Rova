/**
 * Manual end-to-end check against a running dev server:
 *   npx tsx src/blockchain/broadcast.e2e.manualtest.ts
 *
 * Verifies the new `POST /api/blockchain/broadcast` route (D050) — the
 * relay path the desktop Hub-API wallet fallback uses, since Hub only signs
 * client-side and does not reliably relay to the network itself. This is
 * the same `checkRawTransaction`/`broadcastRawTransaction` pair D048 already
 * proved for server-signed payouts (T070/T071); this test proves the new
 * HTTP route wraps them correctly for an arbitrary externally-signed
 * transaction, not just ones the backend itself produced.
 */
import 'dotenv/config'
import { KeyPair, PrivateKey } from '@nimiq/core'
import { addressFromPrivateKeyHex, buildAndSignTransaction } from './nimiqLocalSigner.js'
import { getCurrentBlockNumber } from './nimiqRpc.js'

const BASE_URL = 'http://localhost:3001'
const RPC_URL = process.env.NIMIQ_RPC_URL ?? 'https://rpc.testnet.nimiqwatch.com'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return res.json()
}

async function main() {
  // Malformed input should come back as a clean 400, not a 500 crash.
  const badRes = await fetch(`${BASE_URL}/api/blockchain/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex: 'not-valid-hex' }),
  })
  const badBody = (await badRes.json()) as { error?: string }
  assert(badRes.status === 400 && typeof badBody.error === 'string', `malformed hex rejected cleanly — ${JSON.stringify(badBody)}`)

  const missingRes = await fetch(`${BASE_URL}/api/blockchain/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert(missingRes.status === 400, 'missing hex rejected with 400')

  // Real signed transaction. The testnet faucet is globally rate-limited
  // and already exhausted by earlier sessions' runs (T070-T072), so this
  // reuses the already-funded payout wallet's own balance as the sender
  // instead of faucet-funding a fresh throwaway one — the route being
  // tested doesn't care who signed the input, only that it's valid.
  const privateKey = process.env.NIMIQ_PAYOUT_PRIVATE_KEY
  assert(!!privateKey, 'NIMIQ_PAYOUT_PRIVATE_KEY is set in .env')
  const address = addressFromPrivateKeyHex(privateKey!)
  console.log('Using existing funded wallet:', address)

  const balanceRes = await rpc('getAccountByAddress', [address])
  const balance = balanceRes?.result?.data?.balance ?? 0
  console.log(`Wallet balance: ${balance} luna`)
  assert(balance > 0, 'sender wallet has a spendable balance')

  const validityStartHeight = await getCurrentBlockNumber()
  const throwawayRecipient = PrivateKey.generate()
  const recipientAddress = KeyPair.derive(throwawayRecipient).toAddress().toUserFriendlyAddress()

  const signed = buildAndSignTransaction({
    privateKeyHex: privateKey!,
    recipientAddress,
    valueLuna: 1n,
    data: 'broadcast route test',
    validityStartHeight,
  })
  console.log('Locally signed dust transaction, expected hash:', signed.hash)

  const res = await fetch(`${BASE_URL}/api/blockchain/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex: signed.hex }),
  })
  const body = (await res.json()) as { hash?: string }
  assert(res.status === 200, `broadcast route returned 200 — ${JSON.stringify(body)}`)
  assert(body.hash === signed.hash, `returned hash matches locally computed hash (${body.hash} === ${signed.hash})`)

  console.log('\nAll broadcast route checks passed.')
}

main().catch((err) => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})
