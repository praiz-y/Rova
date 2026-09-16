/**
 * Nimiq address derivation and signed-message verification.
 *
 * This is implemented from Nimiq's own documentation, not guessed:
 * - Address format/derivation: https://nimiq-network.github.io/developer-reference/chapters/primitives.html
 * - Signed-message construction: https://nimiq.github.io/hub/api-reference/sign-message
 *
 * Cross-checked by hand against the known Nimiq burn address
 * (NQ07 0000 0000 0000 0000 0000 0000 0000 0000 — 20 zero bytes) in
 * `nimiqCrypto.selfcheck.ts`, but NOT yet tested against a real
 * device-signed message from Nimiq Pay. See TESTING.md T057.
 */
import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { sha512 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'

ed25519.hashes.sha512 = sha512

const BASE32_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY' // Nimiq's custom alphabet: no I or O
const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

/** Encode raw bytes using Nimiq's custom base32 alphabet (5 bits per character). */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return output
}

/** IBAN-style MOD-97-10 check digits for a Nimiq address body. */
function computeChecksum(base32Body: string): string {
  // Per IBAN check-digit rules: move "NQ00" (country code + zeroed check
  // digits) to the end, convert letters to numbers (A=10..Z=35), then mod 97.
  const rearranged = base32Body + 'NQ00'
  const numeric = rearranged
    .split('')
    .map((ch) => {
      if (ch >= '0' && ch <= '9') return ch
      return String(ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10)
    })
    .join('')
  const remainder = BigInt(numeric) % 97n
  const checkDigits = 98n - remainder
  return checkDigits.toString().padStart(2, '0')
}

/** Format a 20-byte raw address into Nimiq's "NQ.. XXXX XXXX ..." user-friendly form. */
function formatAddress(rawAddress: Uint8Array): string {
  const body = base32Encode(rawAddress)
  const checksum = computeChecksum(body)
  const groups = body.match(/.{1,4}/g) ?? []
  return `NQ${checksum} ${groups.join(' ')}`
}

/** Derive the Nimiq NQ-address for a raw 32-byte Ed25519 public key. */
export function addressFromPublicKey(publicKey: Uint8Array): string {
  const hash = blake2b(publicKey, { dkLen: 32 })
  const rawAddress = hash.slice(0, 20)
  return formatAddress(rawAddress)
}

/** Normalize an address string for comparison (strip spaces, uppercase). */
export function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

/** Build the exact byte sequence Nimiq signs for a text message. */
function buildSignedMessageDigest(message: string): Uint8Array {
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)
  const prefixBytes = encoder.encode(SIGNED_MESSAGE_PREFIX)
  const lengthBytes = encoder.encode(String(messageBytes.length))
  const combined = new Uint8Array(prefixBytes.length + lengthBytes.length + messageBytes.length)
  combined.set(prefixBytes, 0)
  combined.set(lengthBytes, prefixBytes.length)
  combined.set(messageBytes, prefixBytes.length + lengthBytes.length)
  return sha256(combined)
}

export interface VerifyAndDeriveAddressParams {
  message: string
  publicKeyHex: string
  signatureHex: string
}

/**
 * Verify a Nimiq signed message and return the address that produced it,
 * derived directly from the public key (D051) — the signature itself is
 * what authenticates the address; there is no separately-claimed address
 * to cross-check. Returns null if the signature does not verify.
 */
export function verifyAndDeriveAddress(params: VerifyAndDeriveAddressParams): string | null {
  const { message, publicKeyHex, signatureHex } = params
  const publicKey = hexToBytes(publicKeyHex)
  const signature = hexToBytes(signatureHex)

  const digest = buildSignedMessageDigest(message)
  if (!ed25519.verify(signature, digest, publicKey)) return null

  return addressFromPublicKey(publicKey)
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export const _internal = { base32Encode, computeChecksum, formatAddress }
