import { ref } from 'vue'
import { useContests, type PublicContest } from '../../composables/useContests'

export type ContestStatusTab = 'all' | 'live' | 'upcoming' | 'completed'

export interface TaggedContest {
  contest: PublicContest
  variant: 'live' | 'upcoming' | 'completed'
}

export function useAllContestsData() {
  const { listPublic } = useContests()

  const live = ref<PublicContest[]>([])
  const upcoming = ref<PublicContest[]>([])
  const completed = ref<PublicContest[]>([])

  const liveLoading = ref(true)
  const upcomingLoading = ref(true)
  const completedLoading = ref(true)

  const liveError = ref<string | null>(null)
  const upcomingError = ref<string | null>(null)
  const completedError = ref<string | null>(null)

  function endsAt(contest: PublicContest): number {
    if (!contest.quizStartAt || !contest.quizDurationSeconds) return Infinity
    return new Date(contest.quizStartAt).getTime() + contest.quizDurationSeconds * 1000
  }

  async function loadLive() {
    liveLoading.value = true
    liveError.value = null
    try {
      // The backend sorts ongoing contests by start time; this page wants
      // "soonest ending" specifically, which isn't the same once durations differ.
      live.value = (await listPublic('ongoing')).sort((a, b) => endsAt(a) - endsAt(b))
    } catch (err: any) {
      liveError.value = err?.message ?? 'Failed to load live contests'
    } finally {
      liveLoading.value = false
    }
  }

  async function loadUpcoming() {
    upcomingLoading.value = true
    upcomingError.value = null
    try {
      upcoming.value = await listPublic('upcoming')
    } catch (err: any) {
      upcomingError.value = err?.message ?? 'Failed to load upcoming contests'
    } finally {
      upcomingLoading.value = false
    }
  }

  async function loadCompleted() {
    completedLoading.value = true
    completedError.value = null
    try {
      completed.value = await listPublic('completed')
    } catch (err: any) {
      completedError.value = err?.message ?? 'Failed to load completed contests'
    } finally {
      completedLoading.value = false
    }
  }

  function load() {
    loadLive()
    loadUpcoming()
    loadCompleted()
  }

  /** Live, then upcoming, then completed — deduped by ID (each category's SQL is mutually exclusive by status/timing, this is defensive insurance against a request-boundary race). Tagged with the source list's variant rather than re-deriving it from discoveryCategory, so a contest never flickers between card presentations if a boundary is crossed between the SQL query and this being read. */
  function combined(): TaggedContest[] {
    const seen = new Set<string>()
    const all: TaggedContest[] = []
    const sources: Array<[PublicContest[], TaggedContest['variant']]> = [
      [live.value, 'live'],
      [upcoming.value, 'upcoming'],
      [completed.value, 'completed'],
    ]
    for (const [list, variant] of sources) {
      for (const contest of list) {
        if (seen.has(contest.id)) continue
        seen.add(contest.id)
        all.push({ contest, variant })
      }
    }
    return all
  }

  return {
    live,
    upcoming,
    completed,
    liveLoading,
    upcomingLoading,
    completedLoading,
    liveError,
    upcomingError,
    completedError,
    load,
    loadLive,
    loadUpcoming,
    loadCompleted,
    combined,
  }
}
