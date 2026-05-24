// Shared reconnection helpers for Supabase Realtime channels and presence.
//
// Goals:
//  - When a channel reports CHANNEL_ERROR / TIMED_OUT / CLOSED unexpectedly,
//    schedule a reconnection attempt with exponential backoff + jitter.
//  - When the browser regains network (`online`) or the tab becomes visible
//    again (`visibilitychange`), trigger an immediate resync.
//  - Always re-fetch authoritative state on reconnect, so the game state
//    stays consistent with the server even if we missed realtime events
//    while disconnected.
//
// The helpers here are intentionally framework-agnostic: they only deal with
// scheduling. Callers wire the actual `subscribe()` / `track()` / `refresh()`
// logic through the provided callbacks.

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

export function backoffDelay(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempt, 6));
  // Full jitter: [0, exp]
  return Math.floor(Math.random() * exp);
}