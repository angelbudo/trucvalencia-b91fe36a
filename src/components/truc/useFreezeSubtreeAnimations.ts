/**
 * Freezes every CSS animation and CSS transition inside `rootRef`'s subtree
 * while `paused` is true. Uses the Web Animations API
 * (`Element.getAnimations({ subtree: true })`) which returns Animation
 * objects for both keyframe animations and in-flight transitions, so calling
 * `.pause()` on each freezes them mid-flight; `.play()` resumes them from
 * exactly the same point.
 *
 * A short polling loop (every 100 ms) is kept while paused so any animation
 * that gets created AFTER the initial pause (e.g. a React re-render that
 * spawns a new transition) is also frozen.
 */
import { useEffect, type RefObject } from "react";

export function useFreezeSubtreeAnimations(
  rootRef: RefObject<HTMLElement | null>,
  paused: boolean,
) {
  useEffect(() => {
    if (!paused) return;
    const root = rootRef.current;
    if (!root) return;
    const getAll = (): Animation[] => {
      // getAnimations is not in the older lib types — guard at runtime.
      const fn = (root as unknown as {
        getAnimations?: (opts: { subtree: boolean }) => Animation[];
      }).getAnimations;
      if (!fn) return [];
      try {
        return fn.call(root, { subtree: true });
      } catch {
        return [];
      }
    };
    const pausedSet = new WeakSet<Animation>();
    const pauseAll = () => {
      for (const a of getAll()) {
        if (pausedSet.has(a)) continue;
        try {
          a.pause();
          pausedSet.add(a);
        } catch {
          /* noop */
        }
      }
    };
    pauseAll();
    const interval = window.setInterval(pauseAll, 100);
    return () => {
      window.clearInterval(interval);
      // Resume everything still running on this subtree.
      for (const a of getAll()) {
        try {
          a.play();
        } catch {
          /* noop */
        }
      }
    };
  }, [paused, rootRef]);
}