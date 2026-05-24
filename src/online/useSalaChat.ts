import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { backoffDelay } from "./realtimeReconnect";

export interface SalaChatMessage {
  id: number;
  salaSlug: string;
  deviceId: string;
  name: string;
  text: string;
  createdAt: number;
}

interface Row {
  id: number;
  sala_slug: string;
  device_id: string;
  name: string;
  text: string;
  created_at: string;
}

const MAX_MESSAGES = 80;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

function toMsg(r: Row): SalaChatMessage {
  return {
    id: r.id,
    salaSlug: r.sala_slug,
    deviceId: r.device_id,
    name: r.name,
    text: r.text,
    createdAt: new Date(r.created_at).getTime(),
  };
}

/** Subscriu-se als missatges del xat d'una sala (lobby de sala). */
export function useSalaChat(salaSlug: string | null) {
  const [messages, setMessages] = useState<SalaChatMessage[]>([]);

  useEffect(() => {
    if (!salaSlug) { setMessages([]); return; }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let reconnectTimer: number | null = null;

    const loadRecent = () => {
      const sinceIso = new Date(Date.now() - MAX_AGE_MS).toISOString();
      return supabase
        .from("sala_chat")
        .select("*")
        .eq("sala_slug", salaSlug)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(MAX_MESSAGES)
        .then(({ data }) => {
          if (cancelled || !data) return;
          const rows = (data as Row[]).slice().reverse();
          const cutoff = Date.now() - MAX_AGE_MS;
          setMessages((prev) => {
            const byId = new Map<number, SalaChatMessage>();
            for (const m of prev) byId.set(m.id, m);
            for (const r of rows) byId.set(r.id, toMsg(r));
            return Array.from(byId.values())
              .filter((m) => m.createdAt >= cutoff)
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(-MAX_MESSAGES);
          });
        });
    };

    void loadRecent();

    const teardown = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
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
      const ch = supabase
        .channel(`sala-chat-${salaSlug}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "sala_chat", filter: `sala_slug=eq.${salaSlug}` },
          (payload) => {
            if (cancelled) return;
            const msg = toMsg(payload.new as Row);
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
            void loadRecent();
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
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
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      teardown();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [salaSlug]);

  return messages;
}

export async function sendSalaChat(input: {
  salaSlug: string;
  deviceId: string;
  name: string;
  text: string;
}): Promise<void> {
  const { error, data } = await supabase.functions.invoke("sala-chat-send", { body: input });
  if (error) {
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) throw new Error(j.error);
      } catch (e) {
        if (e instanceof Error && e.message && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
    throw new Error(error.message || "No s'ha pogut enviar");
  }
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error((data as any).error);
  }
}