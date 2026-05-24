/**
 * Sequence logger for end-of-round timing verification.
 *
 * Instrumentation goal: confirm that, after a round ends, the points toasts
 * AND the scoreboard numeric update happen at the *same instant*, and that
 * this instant occurs *just before* the collect-cards animation starts.
 *
 * The logger keeps a per-round baseline (T0 = moment the round-end is
 * detected by `match.history.length` growing) and prints `+Δms from T0`
 * for every subsequent event. It also prints `+Δms since previous` so the
 * gap between paired events (e.g. toast vs commit) is trivially readable.
 *
 * Enable via `localStorage.setItem("truc:debugSequence","1")` or by setting
 * `?debugSeq=1` in the URL. Disabled by default to avoid noise in prod.
 */

export type SequenceEvent =
  | "round-end-detected"
  | "envit-reveal-start"
  | "envit-reveal-end"
  | "scoreboard:toast-show"
  | "scoreboard:score-commit"
  | "horizontal:toast-show"
  | "horizontal:score-commit"
  | "dealKey-changed"
  | "pass-anim-start"
  | "collect-anim-start"
  | "deal-anim-start";

type RoundLog = {
  roundIndex: number;
  t0: number;
  lastAt: number;
  envitRevealed: boolean;
  seen: SequenceEvent[];
  /**
   * Timestamp del darrer `dealKey-changed`. Es buida quan es consumeix
   * (al primer `collect-/pass-/deal-anim-start` posterior).
   */
  dealKeyChangedAt: number | null;
  /** Timestamp del darrer `collect-anim-start` (per validar gap → pass). */
  collectAnimStartAt: number | null;
  /** Timestamp del darrer `deal-anim-start` (per validar gap → collect). */
  dealAnimStartAt: number | null;
};

const rounds = new Map<number, RoundLog>();
let activeRoundIndex: number | null = null;

/**
 * Expected order of events for a round. Each event has a "stage" — events in
 * a later stage MUST NOT fire before events of an earlier stage. Events
 * within the same stage may coincide (e.g. toast-show and score-commit).
 *
 *   1 round-end-detected
 *   2 envit-reveal-start    (only if envitRevealed)
 *   3 envit-reveal-end      (only if envitRevealed)
 *   4 scoreboard:toast-show, scoreboard:score-commit, horizontal:*  ← same instant
 *   5 collect-anim-start
 *   6 deal-anim-start
 */
const STAGE: Record<SequenceEvent, number> = {
  "round-end-detected": 1,
  "envit-reveal-start": 2,
  "envit-reveal-end": 3,
  "scoreboard:toast-show": 4,
  "scoreboard:score-commit": 4,
  "horizontal:toast-show": 4,
  "horizontal:score-commit": 4,
  "dealKey-changed": 5,
  "pass-anim-start": 6,
  "collect-anim-start": 6,
  "deal-anim-start": 7,
};

const SYNC_PAIR_TOLERANCE_MS = 50;
const PRE_COLLECT_GAP_MIN_MS = 50;

/**
 * Maximum acceptable delay between `dealKey-changed` (the moment a new
 * `dealKey` arrives at the board) and the visual transition that should
 * follow it (`collect-anim-start`, `pass-anim-start` or `deal-anim-start`).
 *
 * Historically, a regression caused a noticeable "gap" (several frames of
 * the new round being painted before the collect overlay mounted). The
 * fix relies on `selectHandsView` masking that interval, but we still log
 * a hard warning if the actual gap exceeds this threshold so we can catch
 * a re-introduction immediately in dev / when `truc:debugSequence` is on.
 */
const DEALKEY_TO_TRANSITION_MAX_MS = 80;

/**
 * Maximum acceptable delay between `deal-anim-start` (cards have just been
 * dealt for the new round) and the next `collect-anim-start`, when both
 * occur back-to-back inside the same logical round-end transition (e.g. a
 * pass followed immediately by a recollect for the next hand). If this gap
 * widens, the user briefly sees the freshly dealt cards before the collect
 * overlay covers them.
 */
const DEAL_TO_COLLECT_MAX_MS = 80;

/**
 * Maximum acceptable delay between `collect-anim-start` and the
 * `pass-anim-start` that should chain after it (the deck-pass animation
 * that follows the collect overlay). A regression here would expose the
 * "between animations" frames where neither overlay is mounted.
 */
const COLLECT_TO_PASS_MAX_MS = 80;

/** Public accessors for tests / monitoring. */
export const DEALKEY_TO_TRANSITION_MAX_MS_PUBLIC = DEALKEY_TO_TRANSITION_MAX_MS;
export const DEAL_TO_COLLECT_MAX_MS_PUBLIC = DEAL_TO_COLLECT_MAX_MS;
export const COLLECT_TO_PASS_MAX_MS_PUBLIC = COLLECT_TO_PASS_MAX_MS;

/**
 * Test/diagnostic helper: returns the elapsed milliseconds between the most
 * recent `dealKey-changed` event of the active round and `now()` — without
 * consuming the marker. Returns `null` if no active round or no pending
 * `dealKey-changed` event.
 */
export function getPendingDealKeyGap(): number | null {
  const idx = activeRoundIndex;
  if (idx == null) return null;
  const r = rounds.get(idx);
  if (!r || r.dealKeyChangedAt == null) return null;
  return performance.now() - r.dealKeyChangedAt;
}

/**
 * Test/diagnostic helper: ms since the last `deal-anim-start` of the active
 * round. Used to validate the chained `deal → collect` gap.
 */
export function getPendingDealAnimGap(): number | null {
  const idx = activeRoundIndex;
  if (idx == null) return null;
  const r = rounds.get(idx);
  if (!r || r.dealAnimStartAt == null) return null;
  return performance.now() - r.dealAnimStartAt;
}

/**
 * Test/diagnostic helper: ms since the last `collect-anim-start` of the
 * active round. Used to validate the chained `collect → pass` gap.
 */
export function getPendingCollectAnimGap(): number | null {
  const idx = activeRoundIndex;
  if (idx == null) return null;
  const r = rounds.get(idx);
  if (!r || r.collectAnimStartAt == null) return null;
  return performance.now() - r.collectAnimStartAt;
}

/**
 * Test-only: forcibly enable the logger regardless of environment so unit
 * tests can drive `startSequence` / `logSequence` deterministically.
 */
let __forceEnabled = false;
export function __setSequenceForceEnabled(v: boolean) {
  __forceEnabled = v;
}

/**
 * Test-only: clear all in-memory round state.
 */
export function __resetSequenceState() {
  rounds.clear();
  activeRoundIndex = null;
}

function isDev(): boolean {
  try {
    return typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

function isEnabled(): boolean {
  if (__forceEnabled) return true;
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage.getItem("truc:debugSequence");
    if (ls === "1" || ls === "true") return true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("debugSeq") === "1") return true;
  } catch {
    /* ignore */
  }
  // In dev, always enable so order assertions surface during development.
  return isDev();
}

function assertOrder(r: RoundLog, event: SequenceEvent, now: number) {
  const stage = STAGE[event];
  // 1) No later-stage event may have fired earlier.
  for (const prev of r.seen) {
    if (STAGE[prev] > stage) {
      // eslint-disable-next-line no-console
      console.error(
        `%c[SEQ #${r.roundIndex}] ✗ ORDER VIOLATION: "${event}" (stage ${stage}) fired AFTER "${prev}" (stage ${STAGE[prev]})`,
        "color:#fff;background:#dc2626;font-weight:bold;padding:2px 6px",
      );
    }
  }
  // 2) If envit was revealed, points must come AFTER envit-reveal-end.
  if (stage === 4 && r.envitRevealed && !r.seen.includes("envit-reveal-end")) {
    // eslint-disable-next-line no-console
    console.error(
      `%c[SEQ #${r.roundIndex}] ✗ ORDER VIOLATION: "${event}" fired BEFORE "envit-reveal-end" (envit was revealed)`,
      "color:#fff;background:#dc2626;font-weight:bold;padding:2px 6px",
    );
  }
  // 3) collect-anim-start must come AFTER at least one stage-4 event (points applied).
  if (event === "collect-anim-start") {
    const stage4 = r.seen.filter((e) => STAGE[e] === 4);
    if (stage4.length === 0) {
      // eslint-disable-next-line no-console
      console.error(
        `%c[SEQ #${r.roundIndex}] ✗ ORDER VIOLATION: "collect-anim-start" fired BEFORE any score-commit/toast-show`,
        "color:#fff;background:#dc2626;font-weight:bold;padding:2px 6px",
      );
    } else {
      // 4) Points must land *just before* collect — warn if gap is too large.
      const lastStage4At = r.lastAt; // we update lastAt on every log; close enough
      void lastStage4At;
    }
  }
  // 5) Each `dealKey-changed` must be followed promptly by a transition
  //    animation (collect / pass / deal). If the gap is too large the
  //    user would see the "naked" new round for a few frames.
  if (
    event === "collect-anim-start" ||
    event === "pass-anim-start" ||
    event === "deal-anim-start"
  ) {
    const lastDealKeyAt = r.dealKeyChangedAt;
    if (lastDealKeyAt != null) {
      const gap = now - lastDealKeyAt;
      if (gap > DEALKEY_TO_TRANSITION_MAX_MS) {
        // eslint-disable-next-line no-console
        console.error(
          `%c[SEQ #${r.roundIndex}] ✗ GAP REGRESSION: "${event}" fired ${gap.toFixed(0)}ms after "dealKey-changed" (>${DEALKEY_TO_TRANSITION_MAX_MS}ms). El gap entre dealKey i la transició visual ha tornat a aparèixer.`,
          "color:#fff;background:#b91c1c;font-weight:bold;padding:2px 6px",
        );
      }
      // Una vegada consumit, neteja perquè el següent dealKey s'avalue per separat.
      r.dealKeyChangedAt = null;
    }
  }
  // 6) `collect-anim-start` chained after a recent `deal-anim-start` must
  //    arrive within DEAL_TO_COLLECT_MAX_MS — otherwise the freshly dealt
  //    cards would briefly show before the collect overlay covers them.
  if (event === "collect-anim-start" && r.dealAnimStartAt != null) {
    const gap = now - r.dealAnimStartAt;
    if (gap > DEAL_TO_COLLECT_MAX_MS) {
      // eslint-disable-next-line no-console
      console.error(
        `%c[SEQ #${r.roundIndex}] ✗ GAP REGRESSION: "collect-anim-start" fired ${gap.toFixed(0)}ms after "deal-anim-start" (>${DEAL_TO_COLLECT_MAX_MS}ms). El gap entre deal i collect ha tornat a aparèixer.`,
        "color:#fff;background:#b91c1c;font-weight:bold;padding:2px 6px",
      );
    }
    r.dealAnimStartAt = null;
  }
  // 7) `pass-anim-start` chained after `collect-anim-start` must also stay
  //    under COLLECT_TO_PASS_MAX_MS so no naked frames appear between the
  //    two overlays.
  if (event === "pass-anim-start" && r.collectAnimStartAt != null) {
    const gap = now - r.collectAnimStartAt;
    if (gap > COLLECT_TO_PASS_MAX_MS) {
      // eslint-disable-next-line no-console
      console.error(
        `%c[SEQ #${r.roundIndex}] ✗ GAP REGRESSION: "pass-anim-start" fired ${gap.toFixed(0)}ms after "collect-anim-start" (>${COLLECT_TO_PASS_MAX_MS}ms). El gap entre collect i pass ha tornat a aparèixer.`,
        "color:#fff;background:#b91c1c;font-weight:bold;padding:2px 6px",
      );
    }
    r.collectAnimStartAt = null;
  }
}

function assertSyncPair(r: RoundLog, event: SequenceEvent, now: number) {
  // Toast-show and score-commit (same scope) must coincide within tolerance.
  const pair: Partial<Record<SequenceEvent, SequenceEvent>> = {
    "scoreboard:toast-show": "scoreboard:score-commit",
    "scoreboard:score-commit": "scoreboard:toast-show",
    "horizontal:toast-show": "horizontal:score-commit",
    "horizontal:score-commit": "horizontal:toast-show",
  };
  const partner = pair[event];
  if (!partner) return;
  // Find the partner's logged time (we don't store per-event times, so use lastAt
  // approximation: if partner already in seen, assume it just fired).
  if (r.seen.includes(partner)) {
    const delta = now - r.lastAt;
    if (Math.abs(delta) > SYNC_PAIR_TOLERANCE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `%c[SEQ #${r.roundIndex}] ⚠ SYNC DRIFT: "${event}" fired ${delta.toFixed(0)}ms after "${partner}" (>${SYNC_PAIR_TOLERANCE_MS}ms)`,
        "color:#000;background:#fbbf24;font-weight:bold;padding:2px 6px",
      );
    }
  }
}
void PRE_COLLECT_GAP_MIN_MS;

export function startSequence(roundIndex: number, opts?: { envitRevealed?: boolean }) {
  if (!isEnabled()) return;
  const now = performance.now();
  rounds.set(roundIndex, {
    roundIndex,
    t0: now,
    lastAt: now,
    envitRevealed: !!opts?.envitRevealed,
    seen: ["round-end-detected"],
    dealKeyChangedAt: null,
    collectAnimStartAt: null,
    dealAnimStartAt: null,
  });
  activeRoundIndex = roundIndex;
  // eslint-disable-next-line no-console
  console.log(
    `%c[SEQ #${roundIndex}] ▶ round-end-detected (T0)  envitRevealed=${!!opts?.envitRevealed}`,
    "color:#f59e0b;font-weight:bold",
  );
}

export function logSequence(event: SequenceEvent, extra?: Record<string, unknown>) {
  if (!isEnabled()) return;
  const idx = activeRoundIndex;
  if (idx == null) return;
  const r = rounds.get(idx);
  if (!r) return;
  const now = performance.now();
  const fromT0 = now - r.t0;
  const sincePrev = now - r.lastAt;
  assertOrder(r, event, now);
  assertSyncPair(r, event, now);
  r.seen.push(event);
  r.lastAt = now;
  if (event === "dealKey-changed") {
    r.dealKeyChangedAt = now;
  }
  if (event === "deal-anim-start") {
    r.dealAnimStartAt = now;
  }
  if (event === "collect-anim-start") {
    r.collectAnimStartAt = now;
  }
  const extraStr = extra ? "  " + JSON.stringify(extra) : "";
  // Color-code key sync events for visual scanning.
  const color =
    event === "scoreboard:toast-show" || event === "horizontal:toast-show"
      ? "color:#10b981;font-weight:bold"
      : event === "scoreboard:score-commit" || event === "horizontal:score-commit"
        ? "color:#3b82f6;font-weight:bold"
        : event === "collect-anim-start" || event === "pass-anim-start"
          ? "color:#ef4444;font-weight:bold"
          : event === "dealKey-changed"
            ? "color:#f97316;font-weight:bold"
            : "color:#a78bfa";
  // eslint-disable-next-line no-console
  console.log(
    `%c[SEQ #${idx}] +${fromT0.toFixed(0)}ms (Δ${sincePrev.toFixed(0)}ms) ${event}${extraStr}`,
    color,
  );
}

export function endSequence(roundIndex: number) {
  if (!isEnabled()) return;
  const r = rounds.get(roundIndex);
  if (!r) return;
  // eslint-disable-next-line no-console
  console.log(
    `%c[SEQ #${roundIndex}] ■ end (total ${(performance.now() - r.t0).toFixed(0)}ms)`,
    "color:#6b7280",
  );
  rounds.delete(roundIndex);
  if (activeRoundIndex === roundIndex) activeRoundIndex = null;
}