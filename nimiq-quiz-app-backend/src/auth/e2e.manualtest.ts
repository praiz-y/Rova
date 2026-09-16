/**
 * Manual end-to-end check against a running dev server (npm run dev):
 *   npx tsx src/auth/e2e.manualtest.ts
 *
 * Generates a real Ed25519 keypair, derives its Nimiq address, signs a
 * challenge exactly the way this module expects, and drives the actual
 * HTTP API (/challenge -> /verify) to prove the whole request/response
 * path works, not just the crypto functions in isolation.
 *
 * This does NOT prove Nimiq Pay's wallet produces byte-identical output —
 * it proves our own client and server agree with each other. The real
 * cross-check against a live Nimiq Pay signature is TESTING.md T057.
 */
import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from './nimiqCrypto.js'

ed25519.hashes.sha512 = sha512

const BASE_URL = 'http://localhost:3001'
const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function signMessage(privateKey: Uint8Array, publicKey: Uint8Array, message: string) {
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)
  const prefixBytes = encoder.encode(SIGNED_MESSAGE_PREFIX)
  const lengthBytes = encoder.encode(String(messageBytes.length))
  const combined = new Uint8Array(prefixBytes.length + lengthBytes.length + messageBytes.length)
  combined.set(prefixBytes, 0)
  combined.set(lengthBytes, prefixBytes.length)
  combined.set(messageBytes, prefixBytes.length + lengthBytes.length)
  const digest = sha256(combined)
  const signature = ed25519.sign(digest, privateKey)
  return { publicKey: bytesToHex(publicKey), signature: bytesToHex(signature) }
}

async function main() {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  const address = addressFromPublicKey(publicKey)
  console.log('Generated test address:', address)

  // Step 1: request a challenge
  const challengeRes = await fetch(`${BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const { message } = (await challengeRes.json()) as { message: string }
  console.log('Challenge message:', JSON.stringify(message))

  // Step 2: sign it exactly as a wallet would
  const { publicKey: publicKeyHex, signature } = signMessage(privateKey, publicKey, message)

  // Step 3: verify with the backend
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, publicKey: publicKeyHex, signature }),
  })
  const verifyBody = await verifyRes.json()
  console.log('Verify response:', verifyRes.status, verifyBody)

  const setCookie = verifyRes.headers.get('set-cookie')
  console.log('Session cookie issued:', setCookie ? 'yes' : 'NO')

  if (verifyRes.status !== 200 || !setCookie) {
    console.error('FAIL: auth flow did not succeed end-to-end.')
    process.exit(1)
  }

  // Step 4: negative check — tampering with the message must fail
  const challengeRes2 = await fetch(`${BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const { message: message2 } = (await challengeRes2.json()) as { message: string }
  const tampered = signMessage(privateKey, publicKey, message2 + ' tampered')
  const badVerifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message: message2, publicKey: tampered.publicKey, signature: tampered.signature }),
  })
  console.log('Tampered-signature verify status (expect 401):', badVerifyRes.status)
  if (badVerifyRes.status !== 401) {
    console.error('FAIL: tampered signature was incorrectly accepted.')
    process.exit(1)
  }

  console.log('PASS: full auth flow (positive + negative case) works end-to-end.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
