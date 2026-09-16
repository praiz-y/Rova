import { ref } from 'vue'
import { useContests, type PublicContest } from '../../composables/useContests'

export function useDiscoveryData() {
  const { listPublic } = useContests()

  const ongoing = ref<PublicContest[]>([])
  const upcoming = ref<PublicContest[]>([])
  const ongoingLoading = ref(true)
  const upcomingLoading = ref(true)
  const ongoingError = ref<string | null>(null)
  const upcomingError = ref<string | null>(null)

  async function loadOngoing() {
    ongoingLoading.value = true
    ongoingError.value = null
    try {
      ongoing.value = await listPublic('ongoing')
    } catch (err: any) {
      ongoingError.value = err?.message ?? 'Failed to load live contests'
    } finally {
      ongoingLoading.value = false
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

  function load() {
    loadOngoing()
    loadUpcoming()
  }

  return { ongoing, upcoming, ongoingLoading, upcomingLoading, ongoingError, upcomingError, load, loadOngoing, loadUpcoming }
}
