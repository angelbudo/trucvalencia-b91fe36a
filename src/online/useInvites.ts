// Canal d'invitacions 1:1. Cada jugador escolta un canal nomenat pel seu
// deviceId. Qualsevol amfitrió pot enviar-hi un broadcast amb el codi de taula.
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-shim";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface InvitePayload {
  fromName: string;
  fromDeviceId: string;
  code: string;
}

const EVENT = "invite";

function channelName(deviceId: string) {
  return `invite:${deviceId}`;
}

/** Escolta invitacions dirigides al meu deviceId i mostra toast amb acció. */
export function useIncomingInvites({
  deviceId,
  enabled = true,
}: {
  deviceId: string;
  enabled?: boolean;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !deviceId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempts = 0;
    let reconnectTimer: number | null = null;

    const teardown = () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
        channel = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      const exp = Math.min(15_000, 500 * 2 ** Math.min(attempts, 6));
      attempts++;
      const delay = Math.floor(Math.random() * exp);
      reconnectTimer = window.setTimeout(() => {
        if (cancelled) return;
        teardown();
        connect();
      }, delay) as unknown as number;
    };

    const connect = () => {
      if (cancelled) return;
      const ch = supabase.channel(channelName(deviceId));
      channel = ch;
      ch.on("broadcast", { event: EVENT }, ({ payload }) => {
        const p = payload as InvitePayload;
        if (!p?.code || !p?.fromName) return;
        toast(`${p.fromName} t'invita a jugar`, {
          description: `Taula ${p.code}`,
          duration: 15000,
          action: {
            label: "Acceptar",
            onClick: () => navigate(`/online/sala/${p.code}`),
          },
        });
      }).subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") attempts = 0;
        else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleReconnect();
        }
      });
    };

    connect();

    const onWake = () => {
      if (cancelled) return;
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
  }, [deviceId, enabled, navigate]);
}

/** Retorna una funció per enviar invitacions a altres jugadors pel seu deviceId. */
export function useSendInvite({
  fromDeviceId,
  fromName,
  code,
}: {
  fromDeviceId: string;
  fromName: string;
  code: string;
}) {
  const pendingRef = useRef<Set<string>>(new Set());

  const send = useCallback(
    async (targetDeviceId: string) => {
      if (!targetDeviceId || !code || !fromName) return;
      if (pendingRef.current.has(targetDeviceId)) return;
      pendingRef.current.add(targetDeviceId);
      const channel: RealtimeChannel = supabase.channel(channelName(targetDeviceId));
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("timeout")), 4000);
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              window.clearTimeout(timeout);
              resolve();
            }
          });
        });
        await channel.send({
          type: "broadcast",
          event: EVENT,
          payload: {
            fromName,
            fromDeviceId,
            code,
          } satisfies InvitePayload,
        });
        toast.success("Invitació enviada");
      } catch {
        toast.error("No s'ha pogut enviar la invitació");
      } finally {
        // Mantenim el canal uns segons perquè el broadcast arribe, després netegem.
        window.setTimeout(() => {
          supabase.removeChannel(channel);
          pendingRef.current.delete(targetDeviceId);
        }, 1000);
      }
    },
    [fromDeviceId, fromName, code],
  );

  return send;
}