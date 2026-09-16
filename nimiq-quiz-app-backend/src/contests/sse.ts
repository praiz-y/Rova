// src/contests/sse.ts
import { EventEmitter } from 'events';

/** Simple in‑process EventEmitter used to broadcast leaderboard updates.
 * In production you might hook this into your quiz‑attempt persistence layer.
 */
const emitter = new EventEmitter();

export interface LeaderboardPayload {
  contestId: string;
  entry: {
    userId: string;
    username: string | null;
    address: string;
    score: number;
    completionSeconds: number;
    submittedAt: string;
    rank?: number;
    prizeNim?: string | null;
  };
}

export function subscribe(handler: (payload: LeaderboardPayload) => void): void {
  emitter.on('leaderboard-update', handler);
}

export function unsubscribe(handler: (payload: LeaderboardPayload) => void): void {
  emitter.off('leaderboard-update', handler);
}

export function emitUpdate(payload: LeaderboardPayload): void {
  emitter.emit('leaderboard-update', payload);
}
