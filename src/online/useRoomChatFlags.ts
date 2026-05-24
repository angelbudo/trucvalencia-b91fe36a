import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reportChannel, clearChannel } from "./diagnostics";
import { backoffDelay } from "./realtimeReconnect";
import type { PlayerId } from "@/game/types";

export interface RoomChatFlagRow {
  id: number;
  roomId: string;
  targetSeat: PlayerId;
  targetDeviceId: string;
  reporterDeviceId: string;
  reason: string | null;
  status: "pending" | "approved" | "dismissed";
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

interface DbRow {
  id: number;
  room_id: string;
  target_seat: number;
  target_device_id: string;
  reporter_device_id: string;
  reason: string | null;
  status: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

const TICK_MS = 1000;

function toFlag(r: DbRow): RoomChatFlagRow {
  return {
    id: r.id,
    roomId: r.room_id,
    targetSeat: r.target_seat as PlayerId,
    targetDeviceId: r.target_device_id,
    reporterDeviceId: r.reporter_device_id,
    reason: r.reason,
    status: (r.status === "approved" || r.status === "dismissed" ? r.status : "pending"),
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: new Date(r.expires_at).getTime(),
    decidedAt: r.decided_at ? new Date(r.decided_at).getTime() : null,
    decidedBy: r.decided_by ?? null,
  };
}

export interface RoomChatFlagsState {
  /** All flag rows (active + expired in the last cycle). */
  flags: RoomChatFlagRow[];
  /** Map seat -> latest expiry (ms epoch) of any active flag against that seat. */
  mutedSeatsExpiry: Map<PlayerId, number>;
  /** Map seat -> distinct reporter count currently active. */
  reporterCountBySeat: Map<PlayerId, number>;
  /** ms epoch when MY device's mute expires, or null if not muted. */
  myMuteExpiresAt: number | null;
  /** True if my device is currently silenced in this room. */
  isMeMuted: boolean;
  /** Whether THIS device has already flagged a given seat (active). */
  iAlreadyFlagged: (seat: PlayerId) => boolean;
}

/** Subscribes to room_chat_flags and exposes derived mute state. */
export function useRoomChatFlags(
  roomId: string | null,
  myDeviceId: string | null,
): RoomChatFlagsState {
  const [flags, setFlags] = useState<RoomChatFlagRow[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!roomId) {
      setFlags([]);
      return;
    }
    let cancelled = false;

    const loadAll = () =>
      supabase
        .from("room_chat_flags")
        .select("*")
        .eq("room_id", roomId)
        .then(({ data }) => {
          if (cancelled || !data) return;
          setFlags((data as DbRow[]).map(toFlag));
        });

    void loadAll();

    const chanName = `room-chat-flags-${roomId}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let reconnectTimer: number | null = null;

    const teardown = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      clearChannel("chat-flags", chanName);
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      const delay = backoffDelay(attempts++);
      reconnectTimer = window.setTimeout(() => {
        if (cancelled) return;
        teardown();
        connect();
      }, delay) as unknown as number;
    };

    const connect = () => {
      if (cancelled) return;
      reportChannel("chat-flags", chanName, "subscribing");
      const ch = supabase
        .channel(chanName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_chat_flags", filter: `room_id=eq.${roomId}` },
          () => {
            if (cancelled) return;
            void loadAll();
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            attempts = 0;
            reportChannel("chat-flags", chanName, "joined");
            void loadAll();
          } else if (status === "CLOSED") {
            reportChannel("chat-flags", chanName, "closed");
            scheduleReconnect();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reportChannel("chat-flags", chanName, "error");
            scheduleReconnect();
          }
        });
      channel = ch;
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      teardown();
    };
  }, [roomId]);

  // Tick clock to refresh expiry-derived state.
  useEffect(() => {
    if (!roomId) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [roomId]);

  return useMemo<RoomChatFlagsState>(() => {
    const active = flags.filter((f) => f.expiresAt > now && f.status !== "dismissed");
    const mutedSeatsExpiry = new Map<PlayerId, number>();
    const reportersBySeat = new Map<PlayerId, Set<string>>();
    for (const f of active) {
      const prev = mutedSeatsExpiry.get(f.targetSeat) ?? 0;
      if (f.expiresAt > prev) mutedSeatsExpiry.set(f.targetSeat, f.expiresAt);
      const set = reportersBySeat.get(f.targetSeat) ?? new Set<string>();
      set.add(f.reporterDeviceId);
      reportersBySeat.set(f.targetSeat, set);
    }
    const reporterCountBySeat = new Map<PlayerId, number>();
    for (const [seat, set] of reportersBySeat) reporterCountBySeat.set(seat, set.size);

    let myMuteExpiresAt: number | null = null;
    if (myDeviceId) {
      const mine = active.filter((f) => f.targetDeviceId === myDeviceId);
      if (mine.length > 0) {
        myMuteExpiresAt = Math.max(...mine.map((f) => f.expiresAt));
      }
    }

    const myActiveFlags = myDeviceId
      ? active.filter((f) => f.reporterDeviceId === myDeviceId)
      : [];
    const flaggedSeatsByMe = new Set<PlayerId>(myActiveFlags.map((f) => f.targetSeat));

    return {
      flags,
      mutedSeatsExpiry,
      reporterCountBySeat,
      myMuteExpiresAt,
      isMeMuted: myMuteExpiresAt !== null,
      iAlreadyFlagged: (seat: PlayerId) => flaggedSeatsByMe.has(seat),
    };
  }, [flags, now, myDeviceId]);
}