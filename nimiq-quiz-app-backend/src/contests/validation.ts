import { randomUUID } from 'node:crypto'
import type { Contest, ContestDraftInput, ContestResource, EntryRequirement, EntryRequirementType, Question } from './types.js'

/**
 * Validates a contest DRAFT (create or update). This is deliberately lenient
 * — it only rejects structurally/logically invalid data (wrong types, a
 * contradiction like isFree=true with a nonzero prize pool, an end time
 * before a start time). It does NOT require completeness: a title-less,
 * question-less draft is valid, matching D008 ("drafts are freely editable")
 * and the Phase 2/3 split in ROADMAP.md (creation vs. publish are separate
 * phases).
 *
 * The stricter "is this actually ready to go live" check (all fields
 * present, prizeDistribution sums to prizePoolNim per D018, etc.) belongs to
 * the Phase 3 publish gate — not implemented here, and should not be
 * back-ported into this function when that phase is built. See T014 in
 * TESTING.md for the fuller validation-case list that publish-time check
 * will need to cover.
 */
export function validateContestDraftInput(body: unknown): { errors: string[]; value: ContestDraftInput } {
  const errors: string[] = []
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const value: ContestDraftInput = {}

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.length > 200) {
      errors.push('title must be a string of at most 200 characters')
    } else {
      value.title = input.title.trim()
    }
  }

  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > 5000) {
      errors.push('description must be a string of at most 5000 characters')
    } else {
      value.description = input.description
    }
  }

  if (input.imageUrl !== undefined && input.imageUrl !== null) {
    if (typeof input.imageUrl !== 'string' || !/^https?:\/\//.test(input.imageUrl) || input.imageUrl.length > 2000) {
      errors.push('imageUrl must be an http(s) URL')
    } else {
      value.imageUrl = input.imageUrl
    }
  } else if (input.imageUrl === null) {
    value.imageUrl = null
  }

  if (input.questions !== undefined) {
    if (!Array.isArray(input.questions)) {
      errors.push('questions must be an array')
    } else {
      const questions: Question[] = []
      let anyQuestionInvalid = false
      input.questions.forEach((q: unknown, i: number) => {
        const questionErrors = validateQuestion(q, i)
        if (questionErrors.length > 0) {
          anyQuestionInvalid = true
          errors.push(...questionErrors)
        } else {
          questions.push(normalizeQuestion(q as Record<string, unknown>))
        }
      })
      if (!anyQuestionInvalid) value.questions = questions
    }
  }

  for (const [field, key] of [
    ['registrationOpenAt', 'registrationOpenAt'],
    ['registrationCloseAt', 'registrationCloseAt'],
    ['quizStartAt', 'quizStartAt'],
  ] as const) {
    const raw = input[field]
    if (raw === undefined) continue
    if (raw === null) {
      ;(value as any)[key] = null
      continue
    }
    if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
      errors.push(`${field} must be a valid ISO date string or null`)
    } else {
      ;(value as any)[key] = new Date(raw).toISOString()
    }
  }

  if (value.registrationOpenAt && value.registrationCloseAt) {
    if (new Date(value.registrationOpenAt) >= new Date(value.registrationCloseAt)) {
      errors.push('registrationOpenAt must be before registrationCloseAt')
    }
  }
  if (value.registrationCloseAt && value.quizStartAt) {
    if (new Date(value.quizStartAt) < new Date(value.registrationCloseAt)) {
      errors.push('quizStartAt must not be before registrationCloseAt')
    }
  }

  if (input.quizDurationSeconds !== undefined) {
    if (input.quizDurationSeconds === null) {
      value.quizDurationSeconds = null
    } else if (!isPositiveInteger(input.quizDurationSeconds)) {
      errors.push('quizDurationSeconds must be a positive integer')
    } else {
      value.quizDurationSeconds = input.quizDurationSeconds
    }
  }

  if (input.isFree !== undefined) {
    if (typeof input.isFree !== 'boolean') {
      errors.push('isFree must be a boolean')
    } else {
      value.isFree = input.isFree
    }
  }

  if (input.prizePoolNim !== undefined && input.prizePoolNim !== null) {
    if (!isNonNegativeDecimalString(input.prizePoolNim)) {
      errors.push('prizePoolNim must be a non-negative decimal string')
    } else {
      value.prizePoolNim = input.prizePoolNim as string
    }
  } else if (input.prizePoolNim === null) {
    value.prizePoolNim = null
  }

  // A real contradiction, not just incompleteness — reject regardless of
  // draft leniency.
  if (value.isFree === true && value.prizePoolNim && Number(value.prizePoolNim) > 0) {
    errors.push('a free contest (isFree=true) cannot have a nonzero prizePoolNim')
  }

  if (input.winnerCount !== undefined) {
    if (input.winnerCount === null) {
      value.winnerCount = null
    } else if (!isPositiveInteger(input.winnerCount)) {
      errors.push('winnerCount must be a positive integer')
    } else {
      value.winnerCount = input.winnerCount
    }
  }

  if (input.prizeDistribution !== undefined) {
    if (!Array.isArray(input.prizeDistribution)) {
      errors.push('prizeDistribution must be an array')
    } else {
      const seenRanks = new Set<number>()
      let anyEntryInvalid = false
      const distribution = input.prizeDistribution.map((entry: unknown, i: number) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`prizeDistribution[${i}] must be an object`)
          anyEntryInvalid = true
          return null
        }
        const e = entry as Record<string, unknown>
        if (!isPositiveInteger(e.rank)) {
          errors.push(`prizeDistribution[${i}].rank must be a positive integer`)
          anyEntryInvalid = true
        } else if (seenRanks.has(e.rank as number)) {
          errors.push(`prizeDistribution[${i}].rank ${e.rank} is duplicated`)
          anyEntryInvalid = true
        } else {
          seenRanks.add(e.rank as number)
        }
        if (!isNonNegativeDecimalString(e.amountNim)) {
          errors.push(`prizeDistribution[${i}].amountNim must be a non-negative decimal string`)
          anyEntryInvalid = true
        }
        return { rank: e.rank as number, amountNim: e.amountNim as string }
      })
      if (!anyEntryInvalid) {
        value.prizeDistribution = distribution as ContestDraftInput['prizeDistribution']
      }
    }
  }

  if (input.entryRequirements !== undefined) {
    if (!Array.isArray(input.entryRequirements)) {
      errors.push('entry requirements must be a list of tasks')
    } else if (input.entryRequirements.length > 10) {
      errors.push('entry requirements can contain at most 10 tasks')
    } else {
      const requirements: EntryRequirement[] = []
      const validTypes = new Set<EntryRequirementType>(['follow_x', 'join_telegram', 'visit_website', 'join_discord', 'subscribe_follow', 'custom'])
      let invalid = false
      input.entryRequirements.forEach((raw, index) => {
        if (typeof raw !== 'object' || raw === null) {
          errors.push(`Requirement ${index + 1} must be a task.`)
          invalid = true
          return
        }
        const requirement = raw as Record<string, unknown>
        const taskInvalid = typeof requirement.type !== 'string' || !validTypes.has(requirement.type as EntryRequirementType)
          || typeof requirement.title !== 'string' || !requirement.title.trim() || requirement.title.length > 160
          || typeof requirement.url !== 'string' || !/^https?:\/\//.test(requirement.url) || requirement.url.length > 2000
          || (requirement.description !== undefined && (typeof requirement.description !== 'string' || requirement.description.length > 1000))
        if (taskInvalid) {
          errors.push(`Requirement ${index + 1} needs a type, title, and valid link.`)
          invalid = true
          return
        }
        requirements.push({
          id: typeof requirement.id === 'string' && requirement.id.trim() ? requirement.id.trim() : randomUUID(),
          type: requirement.type as EntryRequirementType,
          title: (requirement.title as string).trim(),
          url: requirement.url as string,
          description: typeof requirement.description === 'string' ? requirement.description.trim() || undefined : undefined,
        })
      })
      if (!invalid) value.entryRequirements = requirements
    }
  }

  if (input.resources !== undefined) {
    if (!Array.isArray(input.resources)) {
      errors.push('resources must be an array')
    } else if (input.resources.length > 10) {
      errors.push('resources must contain at most 10 items')
    } else {
      const resources: ContestResource[] = []
      let anyResourceInvalid = false
      input.resources.forEach((r: unknown, i: number) => {
        if (typeof r !== 'object' || r === null) {
          errors.push(`resources[${i}] must be an object`)
          anyResourceInvalid = true
          return
        }
        const res = r as Record<string, unknown>
        const resourceErrors: string[] = []

        if (typeof res.title !== 'string' || !res.title.trim()) {
          resourceErrors.push(`resources[${i}].title must be a non-empty string`)
        }
        if (typeof res.url !== 'string' || !/^https?:\/\//.test(res.url) || res.url.length > 2000) {
          resourceErrors.push(`resources[${i}].url must be a valid http(s) URL`)
        }
        if (typeof res.type !== 'string' || !res.type.trim() || res.type.length > 100) {
          resourceErrors.push(`resources[${i}].type must be a non-empty string`)
        }
        if (res.description !== undefined && res.description !== null) {
          if (typeof res.description !== 'string' || res.description.length > 2000) {
            resourceErrors.push(`resources[${i}].description must be a string of at most 2000 characters`)
          }
        }

        if (resourceErrors.length > 0) {
          errors.push(...resourceErrors)
          anyResourceInvalid = true
        } else {
          resources.push({
            // Generate a stable ID if the client omitted one.
            id: typeof res.id === 'string' && res.id.trim() ? res.id.trim() : randomUUID(),
            title: (res.title as string).trim(),
            type: (res.type as string).trim(),
            url: res.url as string,
            description: typeof res.description === 'string' ? res.description : undefined,
          })
        }
      })
      if (!anyResourceInvalid) value.resources = resources
    }
  }

  return { errors, value }
}

function validateQuestion(q: unknown, index: number): string[] {
  const errors: string[] = []
  if (typeof q !== 'object' || q === null) {
    return [`questions[${index}] must be an object`]
  }
  const question = q as Record<string, unknown>

  if (question.type !== 'multiple_choice' && question.type !== 'short_answer') {
    errors.push(`questions[${index}].type must be "multiple_choice" or "short_answer"`)
  }
  if (question.prompt !== undefined && typeof question.prompt !== 'string') {
    errors.push(`questions[${index}].prompt must be a string`)
  }
  if (question.points !== undefined && !isPositiveNumber(question.points)) {
    errors.push(`questions[${index}].points must be a positive number`)
  }

  if (question.type === 'multiple_choice') {
    const options = question.options
    if (options !== undefined) {
      if (!Array.isArray(options) || options.some((o) => typeof o !== 'string')) {
        errors.push(`questions[${index}].options must be an array of strings`)
      } else if (
        question.correctOptionIndex !== undefined &&
        question.correctOptionIndex !== null &&
        (!Number.isInteger(question.correctOptionIndex) ||
          (question.correctOptionIndex as number) < 0 ||
          (question.correctOptionIndex as number) >= options.length)
      ) {
        errors.push(`questions[${index}].correctOptionIndex must be a valid index into options`)
      }
    }
  } else if (question.type === 'short_answer') {
    if (
      question.correctAnswer !== undefined &&
      question.correctAnswer !== null &&
      typeof question.correctAnswer !== 'string'
    ) {
      errors.push(`questions[${index}].correctAnswer must be a string or null`)
    }
    if (question.acceptedAlternatives !== undefined) {
      if (!Array.isArray(question.acceptedAlternatives)) {
        errors.push(`questions[${index}].acceptedAlternatives must be an array`)
      } else if (question.acceptedAlternatives.length > 20) {
        errors.push(`questions[${index}].acceptedAlternatives must contain at most 20 items`)
      } else if (question.acceptedAlternatives.some((a: unknown) => typeof a !== 'string')) {
        errors.push(`questions[${index}].acceptedAlternatives must be an array of strings`)
      }
    }
  }

  return errors
}

function normalizeQuestion(q: Record<string, unknown>): Question {
  const points = typeof q.points === 'number' ? q.points : 1
  const prompt = typeof q.prompt === 'string' ? q.prompt : ''
  if (q.type === 'multiple_choice') {
    return {
      type: 'multiple_choice',
      prompt,
      points,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      correctOptionIndex: typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : null,
    }
  }
  return {
    type: 'short_answer',
    prompt,
    points,
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : null,
    // Alternatives kept verbatim — normalization (trim+lower) happens at
    // grading time in gameplay.ts to avoid encoding creator intent in storage.
    acceptedAlternatives: Array.isArray(q.acceptedAlternatives)
      ? (q.acceptedAlternatives as string[]).filter((a) => typeof a === 'string')
      : undefined,
  }
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

function isNonNegativeDecimalString(v: unknown): v is string {
  return typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)
}

/**
 * The "is this actually ready to go live" gate flagged as deferred in this
 * module's top docstring. Full completeness, not just structural validity:
 * title, at least one question with a correct answer configured, all
 * timing fields present in the right order, and — if not free — the prize
 * pool/winner count/distribution are consistent (D018) AND funding has
 * actually been confirmed on-chain (D023, D042). Called from the publish
 * route, not the draft create/update routes.
 */
export function validateContestForPublish(contest: Contest): string[] {
  const errors: string[] = []

  if (!contest.title.trim()) errors.push('title is required to publish')
  if (contest.questions.length === 0) errors.push('at least one question is required to publish')

  contest.questions.forEach((q, i) => {
    if (!q.prompt.trim()) errors.push(`Question ${i + 1}: add a question prompt.`)
    if (q.type === 'multiple_choice') {
      if (q.options.length < 2) errors.push(`Question ${i + 1}: add at least two answer options.`)
      if (q.correctOptionIndex === null) errors.push(`Question ${i + 1}: choose the correct answer.`)
    } else if (!q.correctAnswer || !q.correctAnswer.trim()) {
      errors.push(`Question ${i + 1}: enter the correct answer.`)
    }
  })

  if (!contest.registrationOpenAt) errors.push('Set when registration opens.')
  if (!contest.registrationCloseAt) errors.push('Set when registration closes.')
  if (!contest.quizStartAt) errors.push('Set when the quiz starts.')
  if (!contest.quizDurationSeconds) errors.push('Set the quiz duration.')

  if (!contest.isFree) {
    if (!contest.prizePoolNim || Number(contest.prizePoolNim) <= 0) {
      errors.push('prizePoolNim is required to publish a non-free contest')
    }
    if (!contest.winnerCount || contest.winnerCount <= 0) {
      errors.push('winnerCount is required to publish a non-free contest')
    }
    if (contest.winnerCount && contest.prizeDistribution.length !== contest.winnerCount) {
      errors.push(`prizeDistribution must have exactly ${contest.winnerCount} entries (one per winner rank) to publish`)
    }
    if (contest.prizePoolNim) {
      const distributionSum = contest.prizeDistribution.reduce((sum, e) => sum + Number(e.amountNim), 0)
      if (distributionSum !== Number(contest.prizePoolNim)) {
        errors.push(
          `prizeDistribution must sum to exactly prizePoolNim to publish (D018) — got ${distributionSum}, expected ${contest.prizePoolNim}`
        )
      }
    }
    if (contest.fundingStatus !== 'confirmed') {
      errors.push('contest funding must be confirmed on-chain before publishing (D023, D042)')
    }
  }

  return errors
}

/**
 * Standalone resource-array validator — used by the dedicated
 * `PATCH /:id/resources` endpoint which has a different locking rule from
 * the general draft-update route.
 */
export function validateResources(raw: unknown): { errors: string[]; resources: ContestResource[] } {
  const errors: string[] = []
  const resources: ContestResource[] = []

  if (!Array.isArray(raw)) {
    errors.push('resources must be an array')
    return { errors, resources }
  }
  if (raw.length > 10) {
    errors.push('resources must contain at most 10 items')
    return { errors, resources }
  }

  let anyInvalid = false
  raw.forEach((r: unknown, i: number) => {
    if (typeof r !== 'object' || r === null) {
      errors.push(`resources[${i}] must be an object`)
      anyInvalid = true
      return
    }
    const res = r as Record<string, unknown>
    const itemErrors: string[] = []

    if (typeof res.title !== 'string' || !res.title.trim()) {
      itemErrors.push(`resources[${i}].title must be a non-empty string`)
    }
    if (typeof res.url !== 'string' || !/^https?:\/\//.test(res.url) || res.url.length > 2000) {
      itemErrors.push(`resources[${i}].url must be a valid http(s) URL`)
    }
    if (typeof res.type !== 'string' || !res.type.trim() || res.type.length > 100) {
      itemErrors.push(`resources[${i}].type must be a non-empty string`)
    }
    if (res.description !== undefined && res.description !== null) {
      if (typeof res.description !== 'string' || res.description.length > 2000) {
        itemErrors.push(`resources[${i}].description must be a string of at most 2000 characters`)
      }
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors)
      anyInvalid = true
    } else {
      resources.push({
        id: typeof res.id === 'string' && res.id.trim() ? res.id.trim() : randomUUID(),
        title: (res.title as string).trim(),
        type: (res.type as string).trim(),
        url: res.url as string,
        description: typeof res.description === 'string' ? res.description : undefined,
      })
    }
  })

  return { errors: anyInvalid ? errors : [], resources: anyInvalid ? [] : resources }
}
