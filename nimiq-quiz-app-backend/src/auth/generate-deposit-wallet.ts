/**
 * One-off script to generate a dev/test NIM keypair for D042's shared
 * project deposit address. Run manually:
 *   npx tsx src/auth/generate-deposit-wallet.ts
 *
 * Writes the private key to .secrets/deposit-wallet.txt (gitignored) rather
 * than printing it, so it doesn't linger in terminal scrollback/logs. Move
 * it to a password manager and delete the file once saved.
 */
import { writeFileSync } from 'node:fs'
import { sha512 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from './nimiqCrypto.js'

ed25519.hashes.sha512 = sha512

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const privateKey = ed25519.utils.randomSecretKey()
const publicKey = ed25519.getPublicKey(privateKey)
const address = addressFromPublicKey(publicKey)

const contents = `Nimiq Quiz App — dev/test deposit wallet (D042)
Generated: ${new Date().toISOString()}
This is a DEV/TEST keypair, not audited or hardened for production custody.

Address:     ${address}
Private key: ${bytesToHex(privateKey)}
Public key:  ${bytesToHex(publicKey)}

Move the private key to a password manager and delete this file once saved.
Do not commit this file (it's already gitignored via .secrets/).
`

writeFileSync('.secrets/deposit-wallet.txt', contents)
console.log('Deposit wallet generated.')
console.log('Address:', address)
console.log('Private key and public key written to .secrets/deposit-wallet.txt (not printed here).')
