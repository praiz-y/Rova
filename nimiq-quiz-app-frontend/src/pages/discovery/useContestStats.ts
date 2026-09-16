import { ref } from 'vue'
import { useContests, type PublicContestStats } from '../../composables/useContests'

export function useContestStats() {
  const { getStats } = useContests()

  const stats = ref<PublicContestStats | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      stats.value = await getStats()
    } catch (err: any) {
      error.value = err?.message ?? 'Failed to load stats'
    } finally {
      loading.value = false
    }
  }

  return { stats, loading, error, load }
}
