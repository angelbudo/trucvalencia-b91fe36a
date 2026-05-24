import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getRoom, heartbeat } from "./rooms.functions";
import { reportChannel, clearChannel, startLatencySample } from "./diagnostics";
import { backoffDelay } from "./realtimeReconnect";
import type { RoomDTO, RoomFullDTO, RoomPlayerDTO, SeatKind } from "./types";
import type { Action, MatchState, PlayerId } from "@/game/types";
import { applyAction } from "@/game/engine";
import { VISUAL_EVENT_GAP_MS } from "@/game/chatTimings";

/**
 * Masks other players' hands with placeholder cards that are stable across
 * renders. Keeps `state.round` referentially equal when the hands (by count)
 * haven't actually changed for any seat — this lets React.memo and keyed
 * children avoid unnecessary work when a single move arrives.
 */
function maskMatchStateForSeat(state: MatchState, mySeat: PlayerId | null, prev: MatchState | null): MatchState {
  const hands = state.round.hands;
  const prevHands = prev?.round.hands;
  const masked: MatchState["round"]["hands"] = { 0: [], 1: [], 2: [], 3: [] };
  let handsChanged = false;
  for (const p of [0, 1, 2, 3] as PlayerId[]) {
    if (p === mySeat) {
      // Para la mano del propio jugador, comparamos por contenido (longitud
      // + ids de cartas). El snapshot llega del servidor como JSON parseado,
      // así que las referencias siempre son nuevas; comparar por contenido
      // evita reasignar la referencia cuando la mano realmente no cambió,
      // pero garantiza que cualquier cambio (carta jugada) se refleje.
      const prevHand = prevHands?.[p];
      const sameContent =
        prevHand &&
        prevHand.length === hands[p].length &&
        prevHand.every((c, i) => c.id === hands[p][i]!.id);
      if (sameContent) {
        masked[p] = prevHand;
      } else {
        masked[p] = hands[p];
        handsChanged = true;
      }
      continue;
    }
    const len = hands[p].length;
    const prevMasked = prevHands?.[p];
    if (prevMasked && prevMasked.length === len) {
      // Reuse prior placeholder array so references stay stable.
      masked[p] = prevMasked;
    } else {
      masked[p] = Array.from({ length: len }, (_, i) => ({
        id: `hidden-${p}-${i}`,
        suit: "oros" as const,
        rank: 1 as const,
      }));
      handsChanged = true;
    }
  }
  // Si nada cambió y tenemos prev, reutilizamos sus hands para mantener
  // identidad estable; en caso contrario usamos el masked recién construido.
  const round = handsChanged || !prev
    ? { ...state.round, hands: masked }
    : { ...state.round, hands: prev.round.hands };
  return { ...state, round };
}

interface RoomRowPayload {
  id: string;
  code: string;
  status: RoomDTO["status"];
  target_cames: number;
  target_cama?: number;
  turn_timeout_sec?: number;
  initial_mano: number;
  seat_kinds: SeatKind[];
  host_device: string;
  match_state: MatchState | null;
  turn_started_at: string | null;
  paused_at: string | null;
  pending_proposal?: RoomDTO["pendingProposal"] | null;
}

/**
 * Subscribe a la sala via Supabase Realtime. Quan arriba una nova versió de la
 * fila `rooms` apliquem el `match_state` nou directament sobre el DTO actual
 * (mantenint jugadors i mySeat), evitant una crida extra al servidor i deixant
 * que els components animin el moviment en lloc de re-renderitzar-se sencer.
 * Els canvis a `room_players` (unions, noms, presència) sí que disparen
 * `getRoom` perquè cal la llista d'ocupants autoritativa. Les insercions a
 * `room_actions` es descarten: el state final ja arriba pel canvi a `rooms`.
 */
/**
 * Duration (ms) we hold off realtime patches that don't actually advance the
 * authoritative log past our latest optimistic state. Matches the local
 * `play-card` CSS keyframe in `index.css`, so the card-launch animation runs
 * with the exact same timing as solo-vs-bots regardless of the network jitter
 * between the click and the realtime echo of our own move.
 */
const OPTIMISTIC_HOLD_PLAY_MS = 350;
/**
 * For shouts we use the same visual cadence the offline mode produces between
 * staggered table events (`VISUAL_EVENT_GAP_MS = 1000`). The shout cartel/flash
 * is driven by `useShoutFlashes` reading `match.round.log`, so the value here
 * only needs to cover the window where a server echo of the same shout (or a
 * partner's bot-tick batched response) could otherwise re-render the table
 * mid-cartel. With 1000 ms the optimistic state stays authoritative until the
 * next staggered shout slot opens, exactly like solo-vs-bots.
 */
const OPTIMISTIC_HOLD_SHOUT_MS = VISUAL_EVENT_GAP_MS;

export function useRoomRealtime(code: string | null, deviceId: string) {
  const [data, setData] = useState<RoomFullDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<RoomFullDTO | null>(null);
  const suppressRoomPatchesRef = useRef(false);
  /** Wall-clock ms when the current optimistic hold window expires. */
  const optimisticHoldUntilRef = useRef(0);
  /** Length of `match.round.log` after the latest optimistic apply. We only
   *  honour an incoming realtime row during the hold window if it strictly
   *  advances past this value (i.e. it represents new state from another
   *  player or a bot, not the server echoing our own move back). */
  const optimisticLogLenRef = useRef(0);
  /** Pending latency samples awaiting their realtime echo. Key = the log
   *  length we expect the authoritative state to reach (or surpass). When a
   *  realtime row arrives with `log.length >= key`, we close the sample. */
  const pendingEchoesRef = useRef<Array<{ minLen: number; markRealtime: () => void }>>([]);
  dataRef.current = data;

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const dto = await getRoom({ data: { code, deviceId: deviceId || null } });
      setData(dto);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [code, deviceId]);

  // Apply a server-pushed `rooms` row without re-fetching. Keeps `players`
  // and `mySeat` as-is (they live on the other table) so downstream memoised
  // components see identity-stable references for unchanged branches.
  const applyRoomRow = useCallback((row: RoomRowPayload) => {
    if (suppressRoomPatchesRef.current) return;
    const prev = dataRef.current;
    if (!prev) return;
    if (row.id !== prev.room.id) return;
    const prevState = prev.room.matchState;

    // Optimistic-animation guard: if we just applied a local action (and the
    // play-card / shout CSS animation is still in flight), ignore incoming
    // realtime rows that don't strictly advance the authoritative log past
    // our optimistic state. The server will echo our own move back almost
    // immediately; without this guard, that echo would re-trigger React
    // reconciliation mid-animation and the card-throw would feel jittery
    // compared to solo-vs-bots (where the engine state is fully local).
    const incomingLogLen = row.match_state?.round?.log?.length ?? 0;
    const now = Date.now();
    // Resolve any pending latency samples whose expected log length has now
    // been reached/passed by the authoritative state. This works for both
    // the suppressed branch (echo of our own move) and the apply branch.
    if (pendingEchoesRef.current.length > 0) {
      const remaining: typeof pendingEchoesRef.current = [];
      for (const p of pendingEchoesRef.current) {
        if (incomingLogLen >= p.minLen) {
          try { p.markRealtime(); } catch { /* ignore */ }
        } else {
          remaining.push(p);
        }
      }
      pendingEchoesRef.current = remaining;
    }
    if (
      now < optimisticHoldUntilRef.current &&
      incomingLogLen <= optimisticLogLenRef.current
    ) {
      // Still apply non-match-state fields (status, paused_at, etc.) but
      // keep the optimistic matchState intact so the animation finishes
      // with the same timing as the offline mode.
      const nextRoom: RoomDTO = {
        ...prev.room,
        status: row.status,
        turnStartedAt: row.turn_started_at ?? null,
        pausedAt: row.paused_at ?? null,
        pendingProposal: row.pending_proposal ?? null,
      };
      setData({ ...prev, room: nextRoom });
      return;
    }

    const nextState = row.match_state
      ? maskMatchStateForSeat(row.match_state, prev.mySeat, prevState)
      : null;
    const seatKindsChanged =
      row.seat_kinds.length !== prev.room.seatKinds.length ||
      row.seat_kinds.some((k, i) => k !== prev.room.seatKinds[i]);
    const nextRoom: RoomDTO = {
      id: row.id,
      code: row.code,
      status: row.status,
      targetCames: row.target_cames,
      targetCama: row.target_cama ?? prev.room.targetCama ?? 12,
      turnTimeoutSec: row.turn_timeout_sec ?? prev.room.turnTimeoutSec ?? 30,
      initialMano: row.initial_mano as PlayerId,
      seatKinds: seatKindsChanged ? row.seat_kinds : prev.room.seatKinds,
      hostDevice: row.host_device,
      matchState: nextState,
      turnStartedAt: row.turn_started_at ?? null,
      pausedAt: row.paused_at ?? null,
      pendingProposal: row.pending_proposal ?? null,
    };
    const nextDTO: RoomFullDTO = {
      room: nextRoom,
      players: prev.players,
      mySeat: prev.mySeat,
    };
    setData(nextDTO);
  }, []);

  const runWithExplicitRefresh = useCallback(async (submit: () => Promise<unknown>) => {
    suppressRoomPatchesRef.current = true;
    try {
      await submit();
      await refresh();
    } finally {
      window.setTimeout(() => {
        suppressRoomPatchesRef.current = false;
      }, 0);
    }
  }, [refresh]);

  /**
   * Optimistic update: apply the action locally on top of the current
   * matchState without waiting for the server round-trip. The next realtime
   * UPDATE / refresh will overwrite this with the authoritative state.
   * Makes card plays / shouts feel as snappy as the offline mode.
   *
   * Returns:
   *  - `rollback()`  → restores previous matchState if the server rejects.
   *  - `markHttp(ok)` → call when the submitAction HTTP response arrives.
   *  The realtime echo is detected automatically inside `applyRoomRow` by
   *  matching the expected log length, so callers only need to wire HTTP.
   */
  const applyOptimistic = useCallback((player: PlayerId, action: Action): {
    rollback: () => void;
    markHttp: (ok: boolean) => void;
  } => {
    const noop = { rollback: () => {}, markHttp: () => {} };
    const prev = dataRef.current;
    if (!prev || !prev.room.matchState) return noop;
    const prevMatchState = prev.room.matchState;
    const prevHoldUntil = optimisticHoldUntilRef.current;
    const prevLogLen = optimisticLogLenRef.current;
    let nextMatch: MatchState;
    try {
      nextMatch = applyAction(prevMatchState, player, action);
    } catch {
      return noop;
    }
    const masked = maskMatchStateForSeat(nextMatch, prev.mySeat, prevMatchState);
    const holdMs = action.type === "shout" ? OPTIMISTIC_HOLD_SHOUT_MS : OPTIMISTIC_HOLD_PLAY_MS;
    optimisticLogLenRef.current = nextMatch.round.log.length;
    optimisticHoldUntilRef.current = Date.now() + holdMs;
    setData({
      ...prev,
      room: { ...prev.room, matchState: masked },
    });

    // Latency sample: t0 is now; markHttp is wired in the returned object,
    // markRealtime is fired by `applyRoomRow` when an authoritative row
    // arrives whose log length reaches our expected length.
    const kind = action.type === "play-card" ? "play" : `shout:${action.what}`;
    const sample = startLatencySample(kind);
    const expectedLen = nextMatch.round.log.length;
    pendingEchoesRef.current = [
      ...pendingEchoesRef.current,
      { minLen: expectedLen, markRealtime: sample.markRealtime },
    ];

    let rolledBack = false;
    return {
      markHttp: sample.markHttp,
      rollback: () => {
        if (rolledBack) return;
        rolledBack = true;
        // Drop our pending echo so a future row doesn't mark a sample we
        // already abandoned (the action never made it to the server).
        pendingEchoesRef.current = pendingEchoesRef.current.filter(
          (p) => p.markRealtime !== sample.markRealtime,
        );
        optimisticHoldUntilRef.current = prevHoldUntil;
        optimisticLogLenRef.current = prevLogLen;
        const cur = dataRef.current;
        if (!cur) return;
        const curLogLen = cur.room.matchState?.round?.log?.length ?? 0;
        if (curLogLen >= nextMatch.round.log.length) {
          const remasked = maskMatchStateForSeat(prevMatchState, cur.mySeat, cur.room.matchState);
          setData({
            ...cur,
            room: { ...cur.room, matchState: remasked },
          });
        }
      },
    };
  }, []);

  useEffect(() => {
    if (!code) { setLoading(false); return; }
    let cancelled = false;
    refresh();

    const chanName = `room-${code}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      const delay = backoffDelay(attempts++);
      reconnectTimer = window.setTimeout(() => {
        if (cancelled) return;
        teardown();
        connect();
      }, delay) as unknown as number;
    };

    const teardown = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      clearChannel("room", chanName);
    };

    const connect = () => {
      if (cancelled) return;
      reportChannel("room", chanName, "subscribing");
      const ch = supabase.channel(chanName);
      channel = ch;
      ch
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rooms" },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as RoomRowPayload | null;
            if (!row) return;
            applyRoomRow(row);
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "rooms" },
          () => { if (!cancelled) refresh(); },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_players" },
          () => { if (!cancelled) refresh(); },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            attempts = 0;
            reportChannel("room", chanName, "joined");
            // Resync authoritative state on (re)connect to recover any
            // events missed while the channel was down.
            refresh();
          } else if (status === "CLOSED") {
            reportChannel("room", chanName, "closed");
            scheduleReconnect();
          } else if (status === "CHANNEL_ERROR") {
            reportChannel("room", chanName, "error");
            scheduleReconnect();
          } else if (status === "TIMED_OUT") {
            reportChannel("room", chanName, "timeout");
            scheduleReconnect();
          }
        });
    };

    connect();

    // Force resync + reconnect when network comes back or tab refocuses.
    const onWake = () => {
      if (cancelled) return;
      refresh();
      // If channel is in a bad state, force a fresh connect now.
      teardown();
      attempts = 0;
      clearReconnectTimer();
      connect();
    };
    const onOnline = () => onWake();
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") onWake();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      document.addEventListener("visibilitychange", onVisible);
    }

    const heartbeatTimer = window.setInterval(() => {
      const roomId = dataRef.current?.room.id;
      if (roomId && deviceId) heartbeat({ data: { roomId, deviceId } }).catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      teardown();
      window.clearInterval(heartbeatTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, deviceId]);

  return { data, error, loading, refresh, runWithExplicitRefresh, applyOptimistic };
}

// re-export to avoid circular util usage above
export type { RoomFullDTO, RoomPlayerDTO };