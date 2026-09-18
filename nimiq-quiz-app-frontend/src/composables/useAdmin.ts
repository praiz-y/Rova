// src/composables/useAdmin.ts

import { authHeaders } from './sessionToken'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/** Admin API helpers */
export function useAdmin() {
  /**
   * Fetch contests with optional filters and pagination.
   * `filters` may contain status, title, sponsor, dateFrom, dateTo.
   * `options` must include page and limit.
   */
  async function listContests(params: {
    status?: string;
    title?: string;
    sponsor?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }) {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.title) query.append('title', params.title);
    if (params.sponsor) query.append('sponsor', params.sponsor);
    if (params.dateFrom) query.append('dateFrom', params.dateFrom);
    if (params.dateTo) query.append('dateTo', params.dateTo);
    query.append('page', String(params.page));
    query.append('limit', String(params.limit));
    const data = await apiFetch(`/api/admin/contests?${query.toString()}`);
    return { contests: data.contests, total: data.total };
  }

  

  /**
   * Fetch participants for a contest with pagination and optional search.
   * Returns { participants, total }.
   */
  async function listRegistrationsByContest(params: {
    contestId: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const query = new URLSearchParams();
    query.append('page', String(params.page));
    query.append('limit', String(params.limit));
    if (params.search && params.search.trim()) query.append('search', params.search.trim());
    const data = await apiFetch(`/api/admin/contests/${params.contestId}/participants?${query.toString()}`);
    return { participants: data.participants, total: data.total };
  }

  /**
   * Fetch contest-specific analytics.
   */
  async function getContestAnalytics(contestId: string) {
    return await apiFetch(`/api/admin/contests/${contestId}/analytics`);
  }

  /**
   * Fetch payouts for a contest.
   */
  async function getPayoutsByContest(contestId: string) {
    const data = await apiFetch(`/api/admin/contests/${contestId}`);
    return data?.payouts || [];
  }

  return { listContests, getContestAnalytics, listRegistrationsByContest, getPayoutsByContest };
}
