/**
 * Hook that runs a list of scheduled callbacks at fixed offsets (ms from
 * the schedule start) but freezes/resumes when the `paused` flag flips.
 *
 * On pause, all pending timers are cleared and the elapsed time is frozen.
 * On resume, the remaining timers are rescheduled relative to "now", so the
 * animation continues seamlessly from where it left off.
 *
 * Returns a function `start(items, onAllDone?)` to (re)start the schedule
 * for a given list of {at, fn} items. Calling `start` again cancels any
 * previous schedule.
 */
import { useCallback, useEffect, useRef } from "react";

export interface ScheduledItem {
  /** Offset (ms) from the schedule start when `fn` should fire. */
  at: number;
  /** Callback executed at `at` ms (real, paused-time excluded). */
  fn: () => void;
}

export function usePausableTimers(paused: boolean) {
  const itemsRef = useRef<ScheduledItem[]>([]);
  const firedRef = useRef<Set<number>>(new Set());
  // Total elapsed virtual time accumulated during running periods.
  const elapsedRef = useRef<number>(0);
  // Wall-clock time when current running period started, or null when paused.
  const runStartRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const onDoneRef = useRef<(() => void) | null>(null);
  const doneFiredRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const currentElapsed = useCallback(() => {
    if (runStartRef.current == null) return elapsedRef.current;
    return elapsedRef.current + (performance.now() - runStartRef.current);
  }, []);

  const scheduleRemaining = useCallback(() => {
    clearTimers();
    if (paused) return;
    const elapsed = currentElapsed();
    for (let i = 0; i < itemsRef.current.length; i++) {
      if (firedRef.current.has(i)) continue;
      const remaining = Math.max(0, itemsRef.current[i]!.at - elapsed);
      const idx = i;
      timersRef.current.push(
        window.setTimeout(() => {
          firedRef.current.add(idx);
          try {
            itemsRef.current[idx]!.fn();
          } catch (e) {
            // swallow: animation callbacks must not break the schedule.
            console.error(e);
          }
          // If everything has fired, notify done.
          if (
            !doneFiredRef.current &&
            firedRef.current.size === itemsRef.current.length &&
            onDoneRef.current
          ) {
            doneFiredRef.current = true;
            onDoneRef.current();
          }
        }, remaining),
      );
    }
  }, [paused, clearTimers, currentElapsed]);

  const start = useCallback(
    (items: ScheduledItem[], onAllDone?: () => void) => {
      clearTimers();
      itemsRef.current = items.slice().sort((a, b) => a.at - b.at);
      firedRef.current = new Set();
      elapsedRef.current = 0;
      doneFiredRef.current = false;
      onDoneRef.current = onAllDone ?? null;
      runStartRef.current = paused ? null : performance.now();
      scheduleRemaining();
    },
    [paused, clearTimers, scheduleRemaining],
  );

  const cancel = useCallback(() => {
    clearTimers();
    itemsRef.current = [];
    firedRef.current = new Set();
    elapsedRef.current = 0;
    runStartRef.current = null;
    onDoneRef.current = null;
    doneFiredRef.current = false;
  }, [clearTimers]);

  // React to pause/resume transitions.
  useEffect(() => {
    if (paused) {
      // Freeze: accumulate elapsed and clear pending timers.
      if (runStartRef.current != null) {
        elapsedRef.current += performance.now() - runStartRef.current;
        runStartRef.current = null;
      }
      clearTimers();
    } else {
      // Resume: start a new run period and reschedule.
      if (itemsRef.current.length === 0) return;
      runStartRef.current = performance.now();
      scheduleRemaining();
    }
    // We intentionally exclude scheduleRemaining/clearTimers from deps:
    // they're stable by useCallback; including them re-runs unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return { start, cancel };
}