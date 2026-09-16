/**
 * One-off check against a second known vector (private key -> pubkey -> address),
 * found via web search, to validate the Blake2b hashing step end-to-end, not just
 * the base32/checksum formatting. Not part of the permanent test suite — delete
 * once T057 (live device signature test) supersedes it.
 */
import { sha512 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from './nimiqCrypto.js'

ed25519.hashes.sha512 = sha512

const privateKeyHex = '0429b5b4f7fe799640501c366fba99da00d6c8e28cc5178a1bd2d185b93266f3'
const expectedAddress = 'NQ288KG7ER5QUANFN5X1J1CJFRN6FE8GC1KM'

const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'))
const publicKey = ed25519.getPublicKey(privateKey)
const derived = addressFromPublicKey(publicKey).replace(/\s+/g, '')

console.log('Derived: ', derived)
console.log('Expected:', expectedAddress)
console.log(derived === expectedAddress ? 'PASS' : 'FAIL')
