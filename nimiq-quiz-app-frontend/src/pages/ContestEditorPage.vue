<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContests, type ContestResource, type EntryRequirement, type EntryRequirementType, type FundingInfo, type PrizeDistributionEntry, type Question } from '../composables/useContests'
import { useProviders } from '../composables/useProviders'

const route = useRoute()
const router = useRouter()
const { get, create, update, getFunding, checkFunding, publish, cancel } = useContests()
const { getWallet } = useProviders()
const explorerBaseUrl = import.meta.env.VITE_NIMIQ_EXPLORER_BASE_URL ?? 'https://test.nimiq.watch'

// Present (edit mode) only when navigated via /contests/:id/edit.
const contestId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
// D009: rules lock once a contest is no longer a draft — a new (unsaved)
// contest counts as editable too, it just has no id yet.
const isEditable = computed(() => !contestId.value || contestStatus.value === 'draft')

const loading = ref(!!contestId.value)
const saving = ref(false)
const error = ref<string | null>(null)
const errors = ref<string[]>([])
const contestStatus = ref<string>('draft')

const funding = ref<FundingInfo | null>(null)
const fundingLoading = ref(false)
const fundingError = ref<string | null>(null)
const fundingMessage = ref<string | null>(null)
const depositing = ref(false)
const publishing = ref(false)
const cancelling = ref(false)

const form = reactive({
  title: '',
  description: '',
  questions: [] as Question[],
  registrationOpenAt: '', // datetime-local string, converted on save
  registrationCloseAt: '',
  quizStartAt: '',
  quizDurationMinutes: '' as string | number,
  isFree: true,
  prizePoolNim: '',
  winnerCount: '' as string | number,
  prizeDistribution: [] as PrizeDistributionEntry[],
  entryRequirements: [] as EntryRequirement[],
  resources: [] as ContestResource[],
})

// Keep one distribution row per rank in sync with winnerCount, preserving
// any amounts already entered for ranks that still exist.
watch(
  () => form.winnerCount,
  (count) => {
    const n = Number(count) || 0
    if (n <= 0) {
      form.prizeDistribution = []
      return
    }
    const next: PrizeDistributionEntry[] = []
    for (let rank = 1; rank <= n; rank++) {
      const existing = form.prizeDistribution.find((e) => e.rank === rank)
      next.push({ rank, amountNim: existing?.amountNim ?? '' })
    }
    form.prizeDistribution = next
  }
)

const distributionTotal = computed(() =>
  form.prizeDistribution.reduce((sum, e) => sum + (Number(e.amountNim) || 0), 0)
)
const distributionMatchesPool = computed(() => {
  const pool = Number(form.prizePoolNim) || 0
  return pool > 0 && distributionTotal.value === pool
})

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

async function loadExisting(id: string) {
  loading.value = true
  error.value = null
  try {
    const contest = await get(id)
    contestStatus.value = contest.status
    form.title = contest.title
    form.description = contest.description
    form.questions = contest.questions
    form.registrationOpenAt = isoToLocalInput(contest.registrationOpenAt)
    form.registrationCloseAt = isoToLocalInput(contest.registrationCloseAt)
    form.quizStartAt = isoToLocalInput(contest.quizStartAt)
    form.quizDurationMinutes = contest.quizDurationSeconds ? contest.quizDurationSeconds / 60 : ''
    form.isFree = contest.isFree
    form.prizePoolNim = contest.prizePoolNim ?? ''
    form.winnerCount = contest.winnerCount ?? ''
    form.prizeDistribution = contest.prizeDistribution ?? []
    form.entryRequirements = contest.entryRequirements ?? []
    form.resources = contest.resources ?? []
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load contest'
  } finally {
    loading.value = false
  }
}

async function loadFunding() {
  if (!contestId.value) return
  fundingLoading.value = true
  fundingError.value = null
  fundingMessage.value = null
  try {
    funding.value = await getFunding(contestId.value)
  } catch (err: any) {
    fundingError.value = err?.message ?? 'Failed to load funding info'
  } finally {
    fundingLoading.value = false
  }
}

/**
 * Builds the deposit transaction via the Nimiq provider — same shape
 * validated in T055/T063, now targeting this contest's real deposit
 * address/reference/amount instead of a demo placeholder.
 */
async function sendDeposit() {
  if (!funding.value?.depositAddress || !funding.value.reference || !funding.value.totalNim) return
  depositing.value = true
  fundingError.value = null
  fundingMessage.value = null
  try {
    const nimiq = await getWallet()
    const valueLuna = Math.round(Number(funding.value.totalNim) * 100_000)
    const result = await nimiq.sendBasicTransactionWithData({
      recipient: funding.value.depositAddress,
      value: valueLuna,
      data: funding.value.reference,
    })
    if (typeof result !== 'string') {
      fundingError.value = (result as any)?.error?.message ?? 'Wallet declined the deposit transaction'
      return
    }
    // Transaction was broadcast; give the network a moment before checking finality.
    fundingMessage.value = 'Deposit sent. Waiting for the backend to find a finalized matching transaction...'
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await checkFundingStatus()
  } catch (err: any) {
    fundingError.value = err?.message ?? 'Failed to send deposit'
  } finally {
    depositing.value = false
  }
}

async function checkFundingStatus() {
  if (!contestId.value) return
  fundingLoading.value = true
  fundingError.value = null
  fundingMessage.value = null
  try {
    const contest = await checkFunding(contestId.value)
    contestStatus.value = contest.status
    funding.value = {
      ...(funding.value ?? {}),
      fundingStatus: contest.fundingStatus,
      fundingTxHash: contest.fundingTxHash,
      fundedAmountNim: contest.fundedAmountNim,
      fundedAt: contest.fundedAt,
    }
    if (contest.fundingStatus === 'confirmed') {
      fundingMessage.value = 'Funding confirmed on-chain.'
    } else if (contest.fundingStatus === 'underfunded') {
      fundingMessage.value = contest.underfundedMessage ?? 'A deposit was received but it did not cover the required total.'
    } else {
      fundingMessage.value = 'No finalized matching deposit found yet. Check again after the transaction finalizes.'
    }
  } catch (err: any) {
    fundingError.value = err?.message ?? 'Failed to check funding status'
  } finally {
    fundingLoading.value = false
  }
}

async function handlePublish() {
  if (!contestId.value) return
  publishing.value = true
  errors.value = []
  error.value = null
  try {
    const published = await publish(contestId.value)
    contestStatus.value = published.status
  } catch (err: any) {
    errors.value = err?.errors ?? []
    error.value = errors.value.length > 0
      ? 'Complete the highlighted contest details before publishing.'
      : (err?.message ?? 'Failed to publish contest')
  } finally {
    publishing.value = false
  }
}

async function handleCancel() {
  if (!contestId.value) return
  if (!confirm('Cancel this contest? This cannot be undone.')) return
  cancelling.value = true
  error.value = null
  try {
    const cancelled = await cancel(contestId.value)
    contestStatus.value = cancelled.status
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to cancel contest'
  } finally {
    cancelling.value = false
  }
}

onMounted(async () => {
  if (contestId.value) {
    await loadExisting(contestId.value)
    await loadFunding()
  }
})

function addQuestion(type: Question['type']) {
  if (type === 'multiple_choice') {
    form.questions.push({ type, prompt: '', points: 1, options: ['', ''], correctOptionIndex: null })
  } else {
    form.questions.push({ type, prompt: '', points: 1, correctAnswer: '', acceptedAlternatives: [] })
  }
}

function removeQuestion(index: number) {
  form.questions.splice(index, 1)
}

function addOption(question: Question) {
  if (question.type === 'multiple_choice') question.options.push('')
}

function removeOption(question: Question, index: number) {
  if (question.type !== 'multiple_choice') return
  question.options.splice(index, 1)
  if (question.correctOptionIndex === index) question.correctOptionIndex = null
}

function addResource() {
  form.resources.push({
    id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    type: 'link',
    url: '',
    description: '',
  })
}

function removeResource(index: number) {
  form.resources.splice(index, 1)
}

const requirementDefaults: Record<EntryRequirementType, { title: string; description: string }> = {
  follow_x: { title: 'Follow us on X', description: 'Follow our official X account.' },
  join_telegram: { title: 'Join our Telegram', description: 'Join our Telegram community.' },
  visit_website: { title: 'Visit our website', description: 'Open the required page.' },
  join_discord: { title: 'Join our Discord', description: 'Join our Discord server.' },
  subscribe_follow: { title: 'Subscribe / Follow', description: 'Follow the sponsor on the linked platform.' },
  custom: { title: '', description: '' },
}

function addRequirement(type: EntryRequirementType) {
  const defaults = requirementDefaults[type]
  form.entryRequirements.push({
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: defaults.title,
    description: defaults.description,
    url: '',
  })
}

function removeRequirement(index: number) {
  form.entryRequirements.splice(index, 1)
}

async function handleSave() {
  saving.value = true
  error.value = null
  errors.value = []

  const input = {
    title: form.title,
    description: form.description,
    questions: form.questions,
    registrationOpenAt: localInputToIso(form.registrationOpenAt),
    registrationCloseAt: localInputToIso(form.registrationCloseAt),
    quizStartAt: localInputToIso(form.quizStartAt),
    quizDurationSeconds: form.quizDurationMinutes ? Number(form.quizDurationMinutes) * 60 : null,
    isFree: form.isFree,
    prizePoolNim: form.isFree ? null : form.prizePoolNim || null,
    winnerCount: form.winnerCount ? Number(form.winnerCount) : null,
    prizeDistribution: form.isFree
      ? []
      : form.prizeDistribution.filter((e) => e.amountNim.trim() !== ''),
    entryRequirements: form.entryRequirements.filter((requirement) => requirement.title.trim() && requirement.url.trim()),
    resources: form.resources.filter((r) => r.title.trim() && r.url.trim()),
  }

  try {
    if (contestId.value) {
      await update(contestId.value, input)
      // Prize pool may have changed — funding amounts/reference could differ.
      await loadFunding()
    } else {
      const created = await create(input)
      router.replace(`/contests/${created.id}/edit`)
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to save contest'
    errors.value = err?.errors ?? []
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page">
    <h1>{{ contestId ? 'Edit Contest' : 'New Contest' }}</h1>

    <p v-if="loading" class="placeholder">Loading…</p>

    <div v-else-if="!isEditable" class="form-section status-banner">
      <p>This contest is <strong>{{ contestStatus }}</strong> and can no longer be edited (D009).</p>
    </div>

    <form v-else @submit.prevent="handleSave">
      <section class="form-section">
        <h2>Basic Info</h2>
        <label>
          Title
          <input v-model="form.title" type="text" placeholder="Web3 Trivia Night" />
        </label>
        <label>
          Description
          <textarea v-model="form.description" rows="3" placeholder="What's this contest about?" />
        </label>
      </section>

      <section class="form-section">
        <div class="section-header">
          <h2>Questions ({{ form.questions.length }})</h2>
          <div class="add-buttons">
            <button type="button" @click="addQuestion('multiple_choice')">+ Multiple Choice</button>
            <button type="button" @click="addQuestion('short_answer')">+ Short Answer</button>
          </div>
        </div>

        <div v-for="(question, qIndex) in form.questions" :key="qIndex" class="question-card">
          <div class="question-header">
            <span class="question-type">{{ question.type === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer' }}</span>
            <button type="button" class="remove-button" @click="removeQuestion(qIndex)">Remove</button>
          </div>
          <label>
            Prompt
            <input v-model="question.prompt" type="text" placeholder="What is...?" />
          </label>
          <label class="points-label">
            Points
            <input v-model.number="question.points" type="number" min="1" />
          </label>

          <template v-if="question.type === 'multiple_choice'">
            <div v-for="(_, oIndex) in question.options" :key="oIndex" class="option-row">
              <input
                type="radio"
                :name="`correct-${qIndex}`"
                :checked="question.correctOptionIndex === oIndex"
                @change="question.correctOptionIndex = oIndex"
              />
              <input v-model="question.options[oIndex]" type="text" :placeholder="`Option ${oIndex + 1}`" />
              <button type="button" class="remove-button" @click="removeOption(question, oIndex)">✕</button>
            </div>
            <button type="button" class="add-option-button" @click="addOption(question)">+ Add option</button>
          </template>

          <template v-else>
            <label>
              Correct answer
              <input v-model="question.correctAnswer" type="text" placeholder="Expected answer" />
            </label>
            <label>
              Accepted alternative answers (comma-separated)
              <input
                :value="(question.acceptedAlternatives ?? []).join(', ')"
                @input="question.acceptedAlternatives = ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean)"
                type="text"
                placeholder="e.g. NIM, Nimiq Network"
              />
            </label>
          </template>
        </div>
      </section>

      <section class="form-section">
        <h2>Timing</h2>
        <label>
          Registration opens
          <input v-model="form.registrationOpenAt" type="datetime-local" />
        </label>
        <label>
          Registration closes
          <input v-model="form.registrationCloseAt" type="datetime-local" />
        </label>
        <label>
          Quiz starts
          <input v-model="form.quizStartAt" type="datetime-local" />
        </label>
        <label>
          Duration (minutes)
          <input v-model="form.quizDurationMinutes" type="number" min="1" placeholder="10" />
        </label>
      </section>

      <section class="form-section">
        <h2>Prize</h2>
        <label class="checkbox-label">
          <input v-model="form.isFree" type="checkbox" />
          Free contest (no prize)
        </label>
        <template v-if="!form.isFree">
          <label>
            Prize pool (NIM)
            <input v-model="form.prizePoolNim" type="text" placeholder="1000" />
          </label>
          <label>
            Number of winners
            <input v-model="form.winnerCount" type="number" min="1" />
          </label>

          <div v-if="form.prizeDistribution.length > 0" class="distribution">
            <div v-for="entry in form.prizeDistribution" :key="entry.rank" class="distribution-row">
              <span class="rank-label">Rank {{ entry.rank }}</span>
              <input v-model="entry.amountNim" type="text" placeholder="0" />
              <span class="nim-suffix">NIM</span>
            </div>
            <p class="distribution-total" :class="{ matched: distributionMatchesPool }">
              Total allocated: {{ distributionTotal }} / {{ form.prizePoolNim || '0' }} NIM
              <span v-if="form.prizePoolNim && !distributionMatchesPool"> (should match the prize pool before publishing)</span>
            </p>
          </div>
        </template>
      </section>

      <section class="form-section">
        <h2>Entry Requirements</h2>
        <p class="resource-hint">Optional tasks participants complete before they can register. These are acknowledged in-app and are not externally verified.</p>
        <div v-if="form.entryRequirements.length === 0" class="empty-requirements">No requirements added.</div>
        <div v-for="(requirement, index) in form.entryRequirements" :key="requirement.id" class="question-card">
          <div class="question-header">
            <span class="question-type">{{ requirement.type.replace('_', ' ') }}</span>
            <button type="button" class="remove-button" @click="removeRequirement(index)">Remove</button>
          </div>
          <label>Task title<input v-model="requirement.title" type="text" placeholder="e.g. Follow @MyProject" /></label>
          <label>Link<input v-model="requirement.url" type="url" placeholder="https://..." /></label>
          <label>Description (optional)<textarea v-model="requirement.description" rows="2" placeholder="Tell participants what to do" /></label>
        </div>
        <div class="requirement-actions">
          <button type="button" @click="addRequirement('follow_x')">＋ Follow on X</button>
          <button type="button" @click="addRequirement('join_telegram')">＋ Join Telegram</button>
          <button type="button" @click="addRequirement('visit_website')">＋ Visit website</button>
          <button type="button" @click="addRequirement('join_discord')">＋ Join Discord</button>
          <button type="button" @click="addRequirement('subscribe_follow')">＋ Subscribe / Follow</button>
          <button type="button" @click="addRequirement('custom')">＋ Custom task</button>
        </div>
      </section>

      <section class="form-section">
        <div class="section-header">
          <h2>Study Resources / Materials (optional)</h2>
          <button type="button" @click="addResource">+ Add Resource</button>
        </div>
        <p class="resource-hint">Provide study materials (links, whitepapers, videos, docs) for participants to prepare before the quiz.</p>

        <div v-for="(res, rIndex) in form.resources" :key="res.id || rIndex" class="question-card">
          <div class="question-header">
            <span class="question-type">Resource #{{ rIndex + 1 }}</span>
            <button type="button" class="remove-button" @click="removeResource(rIndex)">Remove</button>
          </div>
          <label>
            Title
            <input v-model="res.title" type="text" placeholder="e.g. Nimiq Whitepaper Sections 1–3" />
          </label>
          <label>
            Type
            <select v-model="res.type">
              <option value="link">Link</option>
              <option value="whitepaper">Whitepaper</option>
              <option value="pdf">PDF</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            URL
            <input v-model="res.url" type="text" placeholder="https://nimiq.com/whitepaper" />
          </label>
          <label>
            Description (optional)
            <textarea v-model="res.description" rows="2" placeholder="Read this before taking the quiz" />
          </label>
        </div>
      </section>

      <p v-if="error" class="error-text">{{ error }}</p>
      <ul v-if="errors.length > 0" class="error-list">
        <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
      </ul>

      <div class="actions">
        <button type="submit" class="save-button" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save Draft' }}
        </button>
      </div>
    </form>

    <!-- Fund & Publish (D042) — only meaningful once a draft exists. -->
    <section v-if="contestId && contestStatus === 'draft'" class="form-section">
      <h2>Fund &amp; Publish</h2>

      <template v-if="form.isFree">
        <p class="placeholder">This is a free contest — no funding required. You can publish once the content above is complete.</p>
      </template>

      <template v-else-if="fundingLoading && !funding">
        <p class="placeholder">Loading funding info…</p>
      </template>

      <template v-else-if="funding">
        <div v-if="funding.fundingStatus === 'confirmed'" class="funding-confirmed">
          Funding confirmed: {{ funding.fundedAmountNim }} NIM received.
          <a v-if="funding.fundingTxHash" :href="`${explorerBaseUrl}/transaction/${funding.fundingTxHash}`" target="_blank" rel="noopener">View transaction</a>
        </div>
        <template v-else>
          <p v-if="funding.fundingStatus === 'underfunded'" class="funding-underfunded">
            ⚠️ {{ fundingMessage ?? 'A deposit was received but it did not cover the required total.' }}
          </p>
          <p class="funding-instructions">
            Send <strong>{{ funding.totalNim }} NIM</strong> (prize pool {{ funding.prizePoolNim }} + platform fee {{ funding.platformFeeNim }}, D019)
            to the address below. The deposit button builds this automatically with the correct reference attached — sending manually works too as long as the reference matches exactly.
          </p>
          <div class="funding-detail">
            <span class="funding-label">Deposit address</span>
            <code>{{ funding.depositAddress }}</code>
          </div>
          <div class="funding-detail">
            <span class="funding-label">Reference (in transaction data)</span>
            <code>{{ funding.reference }}</code>
          </div>
          <div class="funding-actions">
            <button type="button" @click="sendDeposit" :disabled="depositing">
              {{ depositing ? 'Sending…' : 'Send Deposit via Wallet' }}
            </button>
            <button type="button" @click="checkFundingStatus" :disabled="fundingLoading">
              {{ fundingLoading ? 'Checking…' : 'Check Funding Status' }}
            </button>
          </div>
          <p class="funding-status-text">Status: {{ funding.fundingStatus }}</p>
          <p v-if="fundingMessage && funding.fundingStatus !== 'underfunded'" class="funding-status-text">{{ fundingMessage }}</p>
        </template>
      </template>

      <p v-if="fundingError" class="error-text">{{ fundingError }}</p>

      <div class="publish-actions">
        <button
          type="button"
          class="publish-button"
          @click="handlePublish"
          :disabled="publishing || (!form.isFree && funding?.fundingStatus !== 'confirmed')"
        >
          {{ publishing ? 'Publishing…' : 'Publish Contest' }}
        </button>
        <button type="button" class="cancel-button" @click="handleCancel" :disabled="cancelling">
          {{ cancelling ? 'Cancelling…' : 'Cancel Contest' }}
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page {
  padding: 2rem 1rem;
  max-width: 640px;
  margin: 0 auto;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  color: var(--rova-navy-900);
}

.placeholder {
  color: var(--text-muted);
}

.form-section {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1rem;
  margin-bottom: 1rem;
}

.form-section h2 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: var(--rova-navy-900);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.add-buttons {
  display: flex;
  gap: 0.5rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

label:last-child {
  margin-bottom: 0;
}

.checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

input[type='text'],
input[type='number'],
input[type='datetime-local'],
textarea {
  padding: 0.5rem 0.7rem;
  border-radius: var(--rova-radius-sm);
  border: 1px solid var(--rova-line);
  background: var(--rova-surface-alt);
  color: var(--rova-ink);
  font: inherit;
}

button {
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--rova-line);
  background: var(--rova-surface);
  color: var(--rova-navy-900);
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
}

.question-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.question-type {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.points-label {
  max-width: 100px;
}

.remove-button {
  color: var(--error-text);
  border: none;
  background: none;
  cursor: pointer;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.option-row input[type='text'] {
  flex: 1;
}

.add-option-button {
  font-size: 0.8rem;
}

.empty-requirements { color: var(--text-muted); font-size: .85rem; margin-bottom: .75rem; }
.requirement-actions { display: flex; flex-wrap: wrap; gap: .5rem; }

.distribution {
  border-top: 1px solid var(--rova-line);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.distribution-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.rank-label {
  width: 60px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.distribution-row input[type='text'] {
  flex: 1;
}

.nim-suffix {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.distribution-total {
  font-size: 0.8rem;
  color: var(--warning-text);
  margin: 0.5rem 0 0 0;
}

.distribution-total.matched {
  color: var(--text-muted);
}

.error-text {
  color: var(--error-text);
  margin-bottom: 0.5rem;
}

.error-list {
  color: var(--error-text);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.save-button {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  padding: 0.6rem 1.5rem;
  font-weight: 700;
}

.save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-banner {
  color: var(--text-muted);
}

.funding-instructions {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0 0 0.75rem 0;
}

.funding-detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.funding-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.funding-detail code {
  font-size: 0.8rem;
  word-break: break-all;
  background: var(--rova-surface-alt);
  padding: 0.4rem 0.6rem;
  border-radius: var(--rova-radius-sm);
}

.funding-confirmed {
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  padding: 0.75rem;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

/* D049: underfunded is a warning, not an error — amber, distinct from the
   red error treatment. */
.funding-underfunded {
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-warning-text);
  color: var(--rova-warning-text);
  border-radius: var(--rova-radius-sm);
  padding: 0.75rem;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.funding-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.funding-status-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

.publish-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--rova-line);
}

.publish-button {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  padding: 0.6rem 1.5rem;
  font-weight: 700;
}

.publish-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-button {
  color: var(--rova-red-600);
  border-color: var(--rova-red-600);
  background: transparent;
}

@media (max-width: 480px) {
  .page {
    padding: 1rem 0.75rem;
  }

  .section-header,
  .publish-actions {
    align-items: stretch;
    flex-direction: column;
    gap: 0.65rem;
  }

  .add-buttons,
  .funding-actions {
    flex-wrap: wrap;
  }

  .funding-actions button,
  .publish-actions button {
    flex: 1 1 10rem;
  }
}
</style>
