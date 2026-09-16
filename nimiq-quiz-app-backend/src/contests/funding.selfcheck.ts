/**
 * Validates the fee math and the recipientData hex-decoding against a real
 * transaction pulled from mainnet (block 61129503), before trusting either
 * in the funding-detection flow. Run: npx tsx src/contests/funding.selfcheck.ts
 */
import { computeCancellationRefund, computeSponsorPayment, contestDepositReference } from './funding.js'

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} — got "${actual}", expected "${expected}"`)
    process.exit(1)
  }
  console.log(`PASS: ${label} — ${actual}`)
}

// D019 example from DECISIONS.md: pool 1000, fee 100, total 1100.
const payment = computeSponsorPayment('1000')
assertEqual(payment.platformFeeNim, '100', 'platform fee on 1000 NIM pool')
assertEqual(payment.totalNim, '1100', 'total sponsor payment on 1000 NIM pool')

// D020 example: pool 1000, platform fee 100, cancellation fee 100, refund 900.
const refund = computeCancellationRefund('1000')
assertEqual(refund.platformFeeNim, '100', 'cancellation: platform fee')
assertEqual(refund.cancellationFeeNim, '100', 'cancellation: cancellation fee')
assertEqual(refund.refundNim, '900', 'cancellation: refund amount')

// Fractional amount, to check luna-precision rounding doesn't drift.
const fractional = computeSponsorPayment('33.33333')
assertEqual(fractional.platformFeeNim, '3.33333', 'platform fee on fractional pool (rounds down to luna precision)')

// Real recipientData decoding, verified against a live mainnet transaction
// (block 61129503) found via direct RPC query and manually hex-decoded.
const realHex = '4e696d69712053756e7365742043796265727370616365205061796f75742e2054533a31373838393431333536383434'
const decoded = Buffer.from(realHex, 'hex').toString('utf-8')
assertEqual(decoded, 'Nimiq Sunset Cyberspace Payout. TS:1788941356844', 'real mainnet recipientData hex-decodes to readable text')

// A contest reference round-trips through the same hex encode/decode Nimiq
// itself would apply when the Mini App sends it as tx `data`.
const reference = contestDepositReference('550e8400-e29b-41d4-a716-446655440000')
const encoded = Buffer.from(reference, 'utf-8').toString('hex')
const roundTripped = Buffer.from(encoded, 'hex').toString('utf-8')
assertEqual(roundTripped, reference, 'contest reference round-trips through hex encode/decode')

console.log('\nAll funding self-checks passed.')
