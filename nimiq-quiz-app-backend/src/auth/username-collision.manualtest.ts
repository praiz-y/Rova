import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from './nimiqCrypto.js'

ed25519.hashes.sha512 = sha512
const BASE_URL = 'http://localhost:3001'
const PREFIX = '\x16Nimiq Signed Message:\n'

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}
function sign(privateKey: Uint8Array, message: string): string {
  const enc = new TextEncoder()
  const msgBytes = enc.encode(message)
  const prefixBytes = enc.encode(PREFIX)
  const lenBytes = enc.encode(String(msgBytes.length))
  const combined = new Uint8Array(prefixBytes.length + lenBytes.length + msgBytes.length)
  combined.set(prefixBytes, 0)
  combined.set(lenBytes, prefixBytes.length)
  combined.set(msgBytes, prefixBytes.length + lenBytes.length)
  return bytesToHex(ed25519.sign(sha256(combined), privateKey))
}

async function loginAsNewUser(): Promise<string> {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  const address = addressFromPublicKey(publicKey)

  const challengeRes = await fetch(`${BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const { message } = (await challengeRes.json()) as { message: string }
  const signature = sign(privateKey, message)

  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, publicKey: bytesToHex(publicKey), signature }),
  })
  return verifyRes.headers.get('set-cookie')!.split(';')[0]
}

async function main() {
  const cookieA = await loginAsNewUser()
  const cookieB = await loginAsNewUser()

  const takeName = await fetch(`${BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ username: 'CollisionName' }),
  })
  console.log('User A takes "CollisionName":', takeName.status, await takeName.json())

  const collide = await fetch(`${BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ username: 'collisionname' }), // different case, different user
  })
  const collideBody = await collide.json()
  console.log('User B tries "collisionname" (expect 409):', collide.status, collideBody)

  if (collide.status !== 409) {
    console.error('FAIL: case-insensitive username collision was not rejected.')
    process.exit(1)
  }
  console.log('PASS: cross-user case-insensitive username collision correctly rejected.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
