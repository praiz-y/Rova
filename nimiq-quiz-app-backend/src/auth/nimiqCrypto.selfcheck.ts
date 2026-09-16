/**
 * Standalone self-check for nimiqCrypto.ts, run manually via:
 *   npx tsx src/auth/nimiqCrypto.selfcheck.ts
 *
 * Validates the address-formatting logic against the known Nimiq burn
 * address (20 zero bytes -> "NQ07 0000 0000 0000 0000 0000 0000 0000 0000")
 * before any of this is trusted for real authentication. This does NOT
 * validate the signature-verification path against a real device-signed
 * message — that still needs a live test (TESTING.md T057).
 */
import { _internal } from './nimiqCrypto.js'

const zeroAddress = new Uint8Array(20)
const formatted = _internal.formatAddress(zeroAddress)
const expected = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

console.log('Formatted:', formatted)
console.log('Expected: ', expected)

if (formatted !== expected) {
  console.error('FAIL: burn-address vector did not match. Do not trust nimiqCrypto.ts yet.')
  process.exit(1)
}

console.log('PASS: burn-address vector matches.')
