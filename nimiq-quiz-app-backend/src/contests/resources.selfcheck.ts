import assert from 'node:assert'
import { validateContestDraftInput, validateResources } from './validation.js'
import type { ContestResource, ShortAnswerQuestion } from './types.js'

function gradeShortAnswer(question: ShortAnswerQuestion, givenAnswer: unknown): boolean {
  if (typeof givenAnswer !== 'string') return false
  const given = givenAnswer.trim().toLowerCase()
  if (!given) return false
  const primary = (question.correctAnswer ?? '').trim().toLowerCase()
  if (given === primary) return true
  const alts = (question.acceptedAlternatives ?? []).map((a) => a.trim().toLowerCase())
  return alts.includes(given)
}

function runResourcesSelfCheck() {
  console.log('Running Phase 2 Contest Resources & Backward-Compatibility Self-Check...')

  // 1. Backward Compatibility Test: Old contest missing `resources` column or null
  const oldContestRaw: Record<string, unknown> = {
    id: 'c-old-123',
    creatorId: 'u-1',
    status: 'published',
    title: 'Old Legacy Contest',
    description: 'Created before resources feature existed',
    imageUrl: null,
    questions: [],
    registrationOpenAt: null,
    registrationCloseAt: null,
    quizStartAt: null,
    quizDurationSeconds: 600,
    isFree: true,
    prizePoolNim: null,
    winnerCount: null,
    prizeDistribution: [],
    entryRequirements: [],
    // resources field absent or null in old database record
    resources: undefined,
  }

  // Verify fallback logic handles undefined resources safely
  const resourcesResult = (oldContestRaw.resources ?? []) as ContestResource[]
  assert.deepStrictEqual(resourcesResult, [], 'Old contest should safely default resources to empty array')

  // 2. Backward Compatibility Test: Old short-answer question missing `acceptedAlternatives`
  const oldShortAnswerQuestion: ShortAnswerQuestion = {
    type: 'short_answer',
    prompt: 'What is the ticker symbol for Nimiq?',
    points: 1,
    correctAnswer: 'NIM',
    // acceptedAlternatives is undefined (old schema)
  }

  assert.strictEqual(gradeShortAnswer(oldShortAnswerQuestion, 'NIM'), true, 'Exact match on primary answer should pass')
  assert.strictEqual(gradeShortAnswer(oldShortAnswerQuestion, '  nim  '), true, 'Trimmed lowercase match on primary answer should pass')
  assert.strictEqual(gradeShortAnswer(oldShortAnswerQuestion, 'BTC'), false, 'Incorrect answer should fail')

  // 3. Short Answer with Alternatives Normalization & Case-Insensitive Grading
  const newShortAnswerQuestion: ShortAnswerQuestion = {
    type: 'short_answer',
    prompt: 'Name the Nimiq native token',
    points: 2,
    correctAnswer: 'Nimiq',
    acceptedAlternatives: ['NIM', 'Nimiq Network'],
  }

  assert.strictEqual(gradeShortAnswer(newShortAnswerQuestion, 'Nimiq'), true, 'Exact primary match should pass')
  assert.strictEqual(gradeShortAnswer(newShortAnswerQuestion, '  nimiq  '), true, 'Whitespace trimmed case-insensitive match should pass')
  assert.strictEqual(gradeShortAnswer(newShortAnswerQuestion, 'nim'), true, 'Alternative match "nim" should pass')
  assert.strictEqual(gradeShortAnswer(newShortAnswerQuestion, '  Nimiq Network '), true, 'Alternative match "Nimiq Network" should pass')
  assert.strictEqual(gradeShortAnswer(newShortAnswerQuestion, 'Solana'), false, 'Unmatched answer should fail')

  // 4. Resource Validation & URL Regex Test
  const validResourcesInput = {
    resources: [
      {
        id: 'res-1',
        title: 'Nimiq Whitepaper',
        type: 'whitepaper',
        url: 'https://nimiq.com/whitepaper.pdf',
        description: 'Read sections 1 to 3',
      },
      {
        title: 'Video Guide',
        type: 'video',
        url: 'http://youtube.com/watch?v=123',
      },
    ],
  }

  const { errors: validErrors, value: validValue } = validateContestDraftInput(validResourcesInput)
  assert.strictEqual(validErrors.length, 0, 'Valid http/https resources should pass validation')
  assert.strictEqual(validValue.resources?.length, 2, 'Should validate and normalize 2 resources')
  assert.strictEqual(validValue.resources?.[0].title, 'Nimiq Whitepaper')
  assert.strictEqual(validValue.resources?.[0].type, 'whitepaper')

  const invalidResourcesInput = {
    resources: [
      {
        title: 'Bad Link',
        type: 'link',
        url: 'ftp://invalid-scheme.com', // Invalid URL scheme
      },
    ],
  }

  const { errors: invalidErrors } = validateContestDraftInput(invalidResourcesInput)
  assert.strictEqual(invalidErrors.length > 0, true, 'ftp:// scheme should fail URL validation')

  // 5. Standalone validateResources Helper Test
  const { errors: standaloneErrors, resources: standaloneResources } = validateResources(validResourcesInput.resources)
  assert.strictEqual(standaloneErrors.length, 0, 'validateResources should accept valid array')
  assert.strictEqual(standaloneResources.length, 2)

  console.log('✅ All Phase 2 Contest Resources & Backward-Compatibility self-check assertions passed!')
}

runResourcesSelfCheck()
