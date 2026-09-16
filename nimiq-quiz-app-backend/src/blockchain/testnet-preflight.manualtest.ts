/**
 * Phase 3 testnet preflight.
 *
 * Run with the backend stopped or running:
 *   npx tsx src/blockchain/testnet-preflight.manualtest.ts
 *
 * This makes no transaction and never prints private-key material. It proves
 * that the configured RPC can read the configured shared deposit address.
 */
import 'dotenv/config'
import { getIncomingTransactions, isTransactionFinalized } from './nimiqRpc.js'

function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

async function main() {
  const rpcUrl = process.env.NIMIQ_RPC_URL
  const depositAddress = process.env.NIMIQ_DEPOSIT_ADDRESS

  if (!rpcUrl) fail('NIMIQ_RPC_URL is not configured')
  if (!depositAddress) fail('NIMIQ_DEPOSIT_ADDRESS is not configured')
  if (!/^NQ[0-9A-Z]{34}$/.test(depositAddress.replace(/\s/g, ''))) {
    fail('NIMIQ_DEPOSIT_ADDRESS is not a valid Nimiq address shape')
  }

  console.log(`RPC: ${rpcUrl}`)
  console.log(`Deposit address: ${depositAddress}`)
  const transactions = await getIncomingTransactions(depositAddress)
  console.log(`PASS: RPC returned ${transactions.length} recent transaction(s) for the deposit address.`)

  const included = transactions.find((transaction) => transaction.blockNumber != null)
  if (!included?.blockNumber) {
    console.log('PASS: RPC read completed. No included transaction is available to test finality yet.')
    return
  }

  const finalized = await isTransactionFinalized(included.blockNumber)
  console.log(`PASS: Finality query succeeded for block ${included.blockNumber} (${finalized ? 'finalized' : 'not finalized yet'}).`)
}

main().catch((error) => {
  console.error('FAIL:', error instanceof Error ? error.message : error)
  process.exit(1)
})
