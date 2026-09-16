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
  const digest = sha256(combined)
  return bytesToHex(ed25519.sign(digest, privateKey))
}

async function main() {
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
  const cookie = verifyRes.headers.get('set-cookie')!.split(';')[0]
  console.log('Got session cookie')

  const meRes = await fetch(`${BASE_URL}/api/users/me`, { headers: { Cookie: cookie } })
  console.log('GET /me before username:', meRes.status, await meRes.json())

  const setRes = await fetch(`${BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ username: 'testuser1' }),
  })
  console.log('POST /username:', setRes.status, await setRes.json())

  const dupRes = await fetch(`${BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ username: 'TestUser1' }),
  })
  console.log('POST /username (case-variant duplicate, expect 409):', dupRes.status, await dupRes.json())

  const badRes = await fetch(`${BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ username: 'x' }),
  })
  console.log('POST /username (too short, expect 400):', badRes.status, await badRes.json())

  const noAuthRes = await fetch(`${BASE_URL}/api/users/me`)
  console.log('GET /me without cookie (expect 401):', noAuthRes.status)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
