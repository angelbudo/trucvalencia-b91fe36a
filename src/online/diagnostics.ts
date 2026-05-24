// Lightweight global diagnostics store for online play.
// Tracks: Supabase REST/Functions health, realtime channel states,
// and recent errors. Subscribers (the diagnostics panel) get notified
// on every change. Designed to be importable from anywhere without
// pulling React.

import { supabase } from "@/integrations/supabase/client";

export type ChannelStatus =
  | "idle"
  | "subscribing"
  | "joined"
  | "closed"
  | "error"
  | "timeout";

export interface ChannelInfo {
  /** Human-readable label, e.g. "room-ABC123" or "lobby-rooms" */
  name: string;
  /** Logical scope: "room", "lobby", "chat", "text-chat", "presence", "invites", "active-rooms" */
  scope: string;
  status: ChannelStatus;
  /** Last status change timestamp (ms). */
  updatedAt: number;
}

export interface DiagError {
  id: number;
  /** Where it happened: "rpc:fn", "channel:scope", "fetch", … */
  source: string;
  message: string;
  at: number;
}

export type ConnectionHealth = "unknown" | "ok" | "degraded" | "down";

/** A single play-card / shout latency sample. */
export interface LatencySample {
  id: number;
  /** Short label for the action (e.g. "play", "envit", "truc"). */
  kind: string;
  /** ms between optimistic apply and HTTP submitAction response. */
  httpMs: number | null;
  /** ms between optimistic apply and realtime echo of our own move. */
  realtimeMs: number | null;
  /** ms between HTTP response and realtime echo (gap = realtime lag). */
  echoGapMs: number | null;
  /** Wall-clock when the sample was first opened. */
  startedAt: number;
  /** True when both http + realtime have completed (or timed out). */
  closed: boolean;
}

export interface LatencyStats {
  count: number;
  httpAvg: number | null;
  httpP95: number | null;
  realtimeAvg: number | null;
  realtimeP95: number | null;
  echoGapAvg: number | null;
  echoGapP95: number | null;
}

export interface DiagnosticsState {
  health: ConnectionHealth;
  /** Last successful round-trip to the edge function (ms). */
  lastOkAt: number | null;
  /** Last failure timestamp (ms). */
  lastErrorAt: number | null;
  /** Current realtime websocket state, derived from supabase.realtime. */
  realtime: "connecting" | "open" | "closing" | "closed" | "unknown";
  channels: Record<string, ChannelInfo>; // keyed by `${scope}:${name}`
  errors: DiagError[]; // newest-first, capped
  latency: LatencySample[]; // newest-first, capped
  latencyStats: LatencyStats;
}

const MAX_ERRORS = 30;
const MAX_LATENCY = 50;
const LATENCY_TIMEOUT_MS = 5000;

const emptyLatencyStats: LatencyStats = {
  count: 0,
  httpAvg: null,
  httpP95: null,
  realtimeAvg: null,
  realtimeP95: null,
  echoGapAvg: null,
  echoGapP95: null,
};

const state: DiagnosticsState = {
  health: "unknown",
  lastOkAt: null,
  lastErrorAt: null,
  realtime: "unknown",
  channels: {},
  errors: [],
  latency: [],
  latencyStats: emptyLatencyStats,
};

type Listener = (s: DiagnosticsState) => void;
const listeners = new Set<Listener>();
let nextErrorId = 1;
let nextLatencyId = 1;

function emit() {
  for (const l of listeners) l(state);
}

export function subscribeDiagnostics(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
}

export function getDiagnostics(): DiagnosticsState {
  return state;
}

// ─── Channel tracking ──────────────────────────────────────────────
function chanKey(scope: string, name: string) {
  return `${scope}:${name}`;
}

export function reportChannel(scope: string, name: string, status: ChannelStatus) {
  state.channels = {
    ...state.channels,
    [chanKey(scope, name)]: { scope, name, status, updatedAt: Date.now() },
  };
  if (status === "error" || status === "timeout") {
    pushError(`channel:${scope}`, `${name} → ${status}`);
  }
  emit();
}

export function clearChannel(scope: string, name: string) {
  const key = chanKey(scope, name);
  if (!(key in state.channels)) return;
  const next = { ...state.channels };
  delete next[key];
  state.channels = next;
  emit();
}

// ─── RPC / fetch tracking ──────────────────────────────────────────
export function reportRpcOk() {
  state.lastOkAt = Date.now();
  // Health: ok unless we had a very recent error (<5s ago).
  if (!state.lastErrorAt || Date.now() - state.lastErrorAt > 5000) {
    state.health = "ok";
  } else {
    state.health = "degraded";
  }
  emit();
}

export function reportRpcError(source: string, message: string) {
  pushError(source, message);
  state.lastErrorAt = Date.now();
  state.health = "degraded";
  emit();
}

export function pushError(source: string, message: string) {
  state.errors = [
    { id: nextErrorId++, source, message, at: Date.now() },
    ...state.errors,
  ].slice(0, MAX_ERRORS);
  emit();
}

export function clearErrors() {
  state.errors = [];
  emit();
}

// ─── Realtime socket state ─────────────────────────────────────────
// Poll the underlying socket every second; cheap and avoids depending
// on private SDK events.
let socketTimer: number | null = null;
function startSocketWatcher() {
  if (typeof window === "undefined" || socketTimer !== null) return;
  const map: Record<number, DiagnosticsState["realtime"]> = {
    0: "connecting",
    1: "open",
    2: "closing",
    3: "closed",
  };
  const tick = () => {
    try {
      // @ts-expect-error - private but stable enough for diagnostics
      const ws = supabase.realtime?.conn as WebSocket | undefined;
      const next = ws ? (map[ws.readyState] ?? "unknown") : "unknown";
      if (next !== state.realtime) {
        state.realtime = next;
        emit();
      }
    } catch {
      /* ignore */
    }
  };
  tick();
  socketTimer = window.setInterval(tick, 1000);
}

if (typeof window !== "undefined") startSocketWatcher();

// ─── Active health probe ───────────────────────────────────────────
/** Pings the edge function with a cheap noop call. */
export async function probeHealth(): Promise<void> {
  const t0 = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke("rooms-rpc", {
      body: { fn: "ping", data: {} },
    });
    if (error) throw error;
    void data;
    void t0;
    reportRpcOk();
  } catch (e) {
    reportRpcError("probe", e instanceof Error ? e.message : String(e));
  }
}

// ─── Latency tracking ──────────────────────────────────────────────
//
// We open a sample the moment we apply an action optimistically (t0).
// Two future events close it:
//   - HTTP response from `submitAction` (t1)  → httpMs   = t1 - t0
//   - Realtime echo of our own move (t2)      → realtimeMs = t2 - t0
//                                              echoGapMs = t2 - t1
// The combination tells us where fluidity is lost: a high httpMs means the
// edge function (DB write + bot tick) is slow; a high echoGapMs means the
// realtime broadcast lags behind the commit; a low httpMs but a high
// realtimeMs points at network/websocket jitter.
const pendingSamples = new Map<number, { timer: number }>();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function recomputeLatencyStats() {
  const closed = state.latency.filter((s) => s.closed);
  if (closed.length === 0) {
    state.latencyStats = emptyLatencyStats;
    return;
  }
  const collect = (key: "httpMs" | "realtimeMs" | "echoGapMs") => {
    const vals = closed
      .map((s) => s[key])
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
    if (vals.length === 0) return { avg: null as number | null, p95: null as number | null };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { avg: Math.round(avg), p95: Math.round(percentile(vals, 95)) };
  };
  const http = collect("httpMs");
  const rt = collect("realtimeMs");
  const gap = collect("echoGapMs");
  state.latencyStats = {
    count: closed.length,
    httpAvg: http.avg,
    httpP95: http.p95,
    realtimeAvg: rt.avg,
    realtimeP95: rt.p95,
    echoGapAvg: gap.avg,
    echoGapP95: gap.p95,
  };
}

function updateLatencySample(id: number, patch: Partial<LatencySample>) {
  const idx = state.latency.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const next = { ...state.latency[idx]!, ...patch };
  state.latency = [...state.latency.slice(0, idx), next, ...state.latency.slice(idx + 1)];
  if (next.closed) {
    const pending = pendingSamples.get(id);
    if (pending && typeof window !== "undefined") {
      window.clearTimeout(pending.timer);
    }
    pendingSamples.delete(id);
    recomputeLatencyStats();
  }
  emit();
}

function maybeClose(id: number) {
  const s = state.latency.find((x) => x.id === id);
  if (!s) return;
  if (s.httpMs != null && s.realtimeMs != null && !s.closed) {
    updateLatencySample(id, { closed: true });
  }
}

/**
 * Open a new latency sample. Returns a token with two callbacks: one for the
 * HTTP response and one for the realtime echo. Each may be called at most
 * once; whichever arrives second closes the sample.
 */
export function startLatencySample(kind: string): {
  id: number;
  markHttp: (ok: boolean) => void;
  markRealtime: () => void;
} {
  const id = nextLatencyId++;
  const startedAt = Date.now();
  const sample: LatencySample = {
    id,
    kind,
    httpMs: null,
    realtimeMs: null,
    echoGapMs: null,
    startedAt,
    closed: false,
  };
  state.latency = [sample, ...state.latency].slice(0, MAX_LATENCY);
  const timer = typeof window !== "undefined"
    ? window.setTimeout(() => {
        const cur = state.latency.find((x) => x.id === id);
        if (cur && !cur.closed) updateLatencySample(id, { closed: true });
      }, LATENCY_TIMEOUT_MS)
    : 0;
  pendingSamples.set(id, { timer });
  emit();
  return {
    id,
    markHttp: (_ok: boolean) => {
      const cur = state.latency.find((x) => x.id === id);
      if (!cur || cur.httpMs != null) return;
      const t = Date.now() - cur.startedAt;
      const patch: Partial<LatencySample> = { httpMs: t };
      if (cur.realtimeMs != null) patch.echoGapMs = cur.realtimeMs - t;
      updateLatencySample(id, patch);
      maybeClose(id);
    },
    markRealtime: () => {
      const cur = state.latency.find((x) => x.id === id);
      if (!cur || cur.realtimeMs != null) return;
      const t = Date.now() - cur.startedAt;
      const patch: Partial<LatencySample> = { realtimeMs: t };
      if (cur.httpMs != null) patch.echoGapMs = t - cur.httpMs;
      updateLatencySample(id, patch);
      maybeClose(id);
    },
  };
}

export function clearLatency() {
  for (const { timer } of pendingSamples.values()) {
    if (typeof window !== "undefined") window.clearTimeout(timer);
  }
  pendingSamples.clear();
  state.latency = [];
  state.latencyStats = emptyLatencyStats;
  emit();
}