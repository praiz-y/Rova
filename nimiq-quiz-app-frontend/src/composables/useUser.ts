// src/composables/useUser.ts
import { ref } from 'vue';
import type { Ref } from 'vue';

export interface UserHistory {
  registrations: any[];
  attempts: any[];
  payouts: any[];
}

export interface SponsoredContest {
  id: string;
  title: string;
  status: string;
}

/**
 * Fetch user history (registration attempts, quiz attempts, payouts)
 */
export function useUserHistory(userId: string) {
  const loading: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);
  const data: Ref<UserHistory | null> = ref(null);

  const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
      const resp = await window.fetch(`${apiBase}/api/users/${userId}/history`, {
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(`Failed ${resp.status}`);
      data.value = await resp.json();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  };

  return { loading, error, data, fetch: fetchData };
}

/**
 * Fetch contests where the user is the sponsor/creator
 */
export function useSponsoredContests(userId: string) {
  const loading: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);
  const contests: Ref<SponsoredContest[] | null> = ref(null);

  const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
      const resp = await window.fetch(`${apiBase}/api/users/${userId}/sponsored`, {
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(`Failed ${resp.status}`);
      contests.value = await resp.json();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  };

  return { loading, error, contests, fetch: fetchData };
}
