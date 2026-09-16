/**
 * Manual end-to-end check against a running dev server:
 *   npx tsx src/contests/e2e.manualtest.ts
 */
import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from '../auth/nimiqCrypto.js'

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

async function api(cookie: string, path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init?.headers },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

async function main() {
  const cookieA = await loginAsNewUser()
  const cookieB = await loginAsNewUser()

  // Structural validation rejects nonsense, but allows an incomplete draft.
  const invalid = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({ isFree: true, prizePoolNim: '100' }), // contradiction
  })
  assert(invalid.status === 400, 'isFree=true with nonzero prizePoolNim is rejected (400)')

  const minimalDraft = await api(cookieA, '/api/contests', { method: 'POST', body: JSON.stringify({}) })
  assert(minimalDraft.status === 201, 'empty body creates a valid minimal draft (201)')
  assert(minimalDraft.body.status === 'draft', 'new contest defaults to draft status')

  // A more complete draft with a question.
  const fullDraft = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Web3 Trivia Night',
      description: 'Test your knowledge',
      questions: [
        { type: 'multiple_choice', prompt: 'What is NIM?', points: 10, options: ['A coin', 'A fruit'], correctOptionIndex: 0 },
      ],
      registrationOpenAt: '2026-10-01T00:00:00Z',
      registrationCloseAt: '2026-10-02T00:00:00Z',
      quizStartAt: '2026-10-02T01:00:00Z',
      quizDurationSeconds: 600,
      isFree: false,
      prizePoolNim: '100',
      winnerCount: 3,
    }),
  })
  assert(fullDraft.status === 201, 'full draft with a question is created (201)')
  const contestId = fullDraft.body.id

  // Bad timing order should be rejected.
  const badTiming = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({ registrationOpenAt: '2026-10-02T00:00:00Z', registrationCloseAt: '2026-10-01T00:00:00Z' }),
  })
  assert(badTiming.status === 400, 'registrationOpenAt after registrationCloseAt is rejected (400)')

  // Owner can edit.
  const edited = await api(cookieA, `/api/contests/${contestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Web3 Trivia Night (Updated)' }),
  })
  assert(edited.status === 200 && edited.body.title === 'Web3 Trivia Night (Updated)', 'owner can edit their draft')

  // Non-owner cannot edit or delete (D003 doesn't mean anyone can touch anyone's contest).
  const otherEdit = await api(cookieB, `/api/contests/${contestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Hijacked' }),
  })
  assert(otherEdit.status === 403, 'non-owner cannot edit another user\'s draft (403)')

  const otherDelete = await api(cookieB, `/api/contests/${contestId}`, { method: 'DELETE' })
  assert(otherDelete.status === 403, 'non-owner cannot delete another user\'s draft (403)')

  // Non-owner cannot even view someone else's draft (not published/public yet).
  const otherView = await api(cookieB, `/api/contests/${contestId}`)
  assert(otherView.status === 404, 'non-owner cannot view another user\'s draft (404, not 403 — no existence leak)')

  // Owner's "mine" list contains both drafts.
  const mine = await api(cookieA, '/api/contests/mine')
  assert(mine.status === 200 && mine.body.length === 2, 'owner\'s /mine lists both created drafts')

  // Owner can delete.
  const deleted = await api(cookieA, `/api/contests/${contestId}`, { method: 'DELETE' })
  assert(deleted.status === 204, 'owner can delete their draft (204)')

  const afterDelete = await api(cookieA, `/api/contests/${contestId}`)
  assert(afterDelete.status === 404, 'deleted contest is gone (404)')

  console.log('\nAll contest creation/edit/delete checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
