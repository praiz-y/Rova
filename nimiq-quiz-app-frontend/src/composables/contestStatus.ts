/**
 * Whether a contest may be shared.
 *
 * Its own module rather than a condition written out twice: the share control
 * appears on the creator's list and on the contest page, and those two have to
 * agree about when it is offered.
 *
 * A draft has no public page yet, so its link would lead nowhere; a cancelled
 * contest is not something to invite people to. Everything else is shareable —
 * including a finished one, which is exactly when the leaderboard is worth
 * looking at.
 */
export function canShare(status: string): boolean {
  return status !== 'draft' && status !== 'cancelled'
}
