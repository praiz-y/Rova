import assert from 'node:assert'
import type { Contest } from './types.js'
import { calculateScore, evaluateAnswer } from './gameplay.js'

function runGameplaySelfCheck() {
  console.log('Running Phase 5 Gameplay Self-Check...')

  const questions: Contest['questions'] = [
    {
      type: 'multiple_choice',
      prompt: 'What currency is used for Nimiq Mini App prizes in MVP?',
      points: 10,
      options: ['USDT', 'NIM', 'BTC', 'ETH'],
      correctOptionIndex: 1,
    },
    {
      type: 'short_answer',
      prompt: 'What is the primary ranking criterion?',
      points: 20,
      correctAnswer: 'Score',
      acceptedAlternatives: ['points', 'final score'],
    },
  ]

  // Test 1: Multiple choice correct option
  const mcResult = evaluateAnswer(questions[0], 1)
  assert.strictEqual(mcResult.correct, true, 'Multiple choice correct option failed')
  assert.strictEqual(mcResult.points, 10, 'Multiple choice points failed')

  // Test 2: Multiple choice incorrect option
  const mcWrong = evaluateAnswer(questions[0], 0)
  assert.strictEqual(mcWrong.correct, false, 'Multiple choice incorrect option failed')
  assert.strictEqual(mcWrong.points, 0)

  // Test 3: Short answer case-insensitive & whitespace trimmed
  const saResult = evaluateAnswer(questions[1], '  SCORE ')
  assert.strictEqual(saResult.correct, true, 'Short answer case/trim grading failed')
  assert.strictEqual(saResult.points, 20)

  // Test 4: Short answer accepted alternative
  const saAltResult = evaluateAnswer(questions[1], ' FINAL SCORE ')
  assert.strictEqual(saAltResult.correct, true, 'Short answer accepted alternative failed')
  assert.strictEqual(saAltResult.points, 20)

  // Test 5: Short answer incorrect
  const saWrong = evaluateAnswer(questions[1], 'Speed')
  assert.strictEqual(saWrong.correct, false, 'Short answer wrong text failed')
  assert.strictEqual(saWrong.points, 0)

  // Test 6: Total score calculation
  const totalScore = calculateScore(questions, [
    { questionIndex: 0, answer: 1 },
    { questionIndex: 1, answer: 'points' },
  ])
  assert.strictEqual(totalScore, 30, 'Total score calculation failed')

  // Test 7: Zero answers submission score
  const zeroScore = calculateScore(questions, [])
  assert.strictEqual(zeroScore, 0, 'Zero answers submission score should be 0')

  console.log('All 7 gameplay self-check assertions passed successfully.')
}

runGameplaySelfCheck()
process.exit(0)
