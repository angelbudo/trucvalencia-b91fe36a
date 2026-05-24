import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reportChannel, clearChannel } from "./diagnostics";
import { backoffDelay } from "./realtimeReconnect";
import type { PlayerId } from "@/game/types";

export interface RoomTextMessage {
  id: number;
  seat: PlayerId;
  text: string;
  createdAt: number;
}

interface Row {
  id: number;
  room_id: string;
  seat: number;
  text: string;
  created_at: string;
}

const MAX_MESSAGES = 50;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** Subscriu-se als missatges de text lliure d'una sala. Manté un buffer
 *  acumulatiu (no com el de frases, que es buida amb temporitzador). */
export function useRoomTextChat(roomId: string | null) {
  const [messages, setMessages] = useState<RoomTextMessage[]>([]);

  useEffect(() => {
    if (!roomId) { setMessages([]); return; }
    let cancelled = false;
    const timers: number[] = [];
    

    const toMsg = (r: Row): RoomTextMessage => ({
      id: r.id,
      seat: r.seat as PlayerId,
      text: r.text,
      createdAt: new Date(r.created_at).getTime(),
    });

    const loadRecent = () => {
      const sinceIso = new Date(Date.now() - MAX_AGE_MS).toISOString();
      return (supabase as any)
        .from("room_text_chat")
        .select("*")
        .eq("room_id", roomId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES)
        .then(({ data }: { data: Row[] | null }) => {
          if (cancelled || !data) return;
          const cutoff = Date.now() - MAX_AGE_MS;
          setMessages((prev) => {
            const byId = new Map<number, RoomTextMessage>();
            for (const m of prev) byId.set(m.id, m);
            for (const r of data) byId.set(r.id, toMsg(r));
            return Array.from(byId.values())
              .filter((m) => m.createdAt >= cutoff)
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(-MAX_MESSAGES);
          });
        });
    };

    void loadRecent();

    const chanName = `room-text-chat-${roomId}-${Math.random().toString(36).slice(2, 10)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let reconnectTimer: number | null = null;

    const teardown = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
      clearChannel("text-chat", chanName);
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
      reportChannel("text-chat", chanName, "subscribing");
      const ch = supabase
        .channel(chanName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "room_text_chat", filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (cancelled) return;
            const msg = toMsg(payload.new as Row);
            // Mostra el missatge instantàniament: les partides online no
            // han de tenir cap retard de cua entre missatges humans.
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const next = [...prev, msg];
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            attempts = 0;
            reportChannel("text-chat", chanName, "joined");
            void loadRecent();
          } else if (status === "CLOSED") {
            reportChannel("text-chat", chanName, "closed");
            scheduleReconnect();
          } else if (status === "CHANNEL_ERROR") {
            reportChannel("text-chat", chanName, "error");
            scheduleReconnect();
          } else if (status === "TIMED_OUT") {
            reportChannel("text-chat", chanName, "timeout");
            scheduleReconnect();
          }
        });
      channel = ch;
    };

    connect();

    const onWake = () => {
      if (cancelled) return;
      void loadRecent();
      teardown();
      attempts = 0;
      if (reconnectTimer !== null) { window.clearTimeout(reconnectTimer); reconnectTimer = null; }
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

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      teardown();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [roomId]);

  return messages;
}