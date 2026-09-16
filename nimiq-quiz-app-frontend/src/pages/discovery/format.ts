/**
 * Pure formatting helpers for the ROVA discovery page. Ported from the
 * previous DiscoveryPage.vue's inline formatDate/sponsorName, extended
 * with relative-time formatting for the redesigned live/upcoming cards.
 */
import type { PublicContest } from '../../composables/useContests'

export function formatDateTime(value: string | null): string {
  if (!value) return 'To be announced'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

/** "8m ago" / "in 18m" / "2h ago" / falls back to a real date beyond a day. */
export function relativeTime(value: string | null, now: Date = new Date()): string {
  if (!value) return 'To be announced'
  const target = new Date(value).getTime()
  const diffMs = target - now.getTime()
  const past = diffMs <= 0
  const absSeconds = Math.abs(diffMs) / 1000

  if (absSeconds < 60) return past ? 'moments ago' : 'in moments'
  if (absSeconds < 3600) {
    const minutes = Math.round(absSeconds / 60)
    return past ? `${minutes}m ago` : `in ${minutes}m`
  }
  if (absSeconds < 86400) {
    const hours = Math.round(absSeconds / 3600)
    return past ? `${hours}h ago` : `in ${hours}h`
  }
  return formatDateTime(value)
}

export function formatMinutes(seconds: number | null): number {
  if (!seconds) return 0
  return Math.round(seconds / 60)
}

export function sponsorName(contest: PublicContest): string {
  return contest.sponsor.username ?? shortAddress(contest.sponsor.address)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/** contest.prizePoolNim is a decimal string already; this only adds the unit/FREE label. */
export function prizeLabel(contest: PublicContest): string {
  if (contest.isFree) return 'FREE'
  return `${contest.prizePoolNim ?? '0'} NIM`
}
