// Canal de presència global per a jugadors online.
// Usa Supabase Realtime Presence: cada client publica la seua identitat i
// veu la resta de jugadors connectats. La neteja és automàtica en desconnectar.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { salaForRoom } from "@/online/salaAssignment";
import {
  DEV_MOCK_PRESENCE,
  DEV_MOCK_ONLINE_PLAYERS,
  DEV_MOCK_ONLINE_DEVICE_IDS,
  DEV_MOCK_ONLINE_USER_IDS,
} from "@/online/devSeededPresence";

export interface OnlinePlayer {
  deviceId: string;
  name: string;
  /** Codi de la taula on està assegut, si n'hi ha. */
  roomCode: string | null;
  /** Slug de la sala a la qual pertany (derivat del roomCode o explícit). */
  salaSlug: string | null;
  /** Identificador d'usuari autenticat, si està vinculat. */
  userId?: string | null;
}

interface PresenceState {
  deviceId: string;
  name: string;
  roomCode: string | null;
  salaSlug: string | null;
  userId?: string | null;
  joinedAt: number;
}

const CHANNEL_NAME = "lobby:presence";

// ----------------------------------------------------------------------------
// Singleton compartit del canal `lobby:presence`.
//
// supabase-js deduplica `supabase.channel(name)` per topic dins d'un mateix
// client: dues crides amb el mateix nom retornen la MATEIXA instància. Si dos
// hooks (per exemple `useLobbyPresence` al lobby i `useOnlinePresenceLookup`
// dins del diàleg de perfil) intenten registrar callbacks `on('presence', …)`
// sobre aquest canal compartit, el segon callback s'afegeix DESPRÉS del
// `subscribe()` del primer i Supabase llança l'error
// "cannot add `presence` callbacks for realtime:lobby:presence after
// `subscribe()`".
//
// Per evitar-ho, mantenim una sola subscripció a nivell de mòdul i
// multiplexem l'estat de presència via un petit EventEmitter intern.
// ----------------------------------------------------------------------------

type SharedPresenceSnapshot = {
  states: Record<string, PresenceState[]>;
};

type SharedPresenceListener = (snap: SharedPresenceSnapshot) => void;

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedRefCount = 0;
let sharedSnapshot: SharedPresenceSnapshot = { states: {} };
const sharedListeners = new Set<SharedPresenceListener>();
const sharedTrackers = new Map<string, PresenceState>(); // key -> meta to track
let sharedSubscribed = false;

function emitSharedSnapshot() {
  sharedListeners.forEach((l) => {
    try { l(sharedSnapshot); } catch { /* ignore */ }
  });
}

function ensureSharedChannel(): ReturnType<typeof supabase.channel> {
  if (sharedChannel) return sharedChannel;
  const ch = supabase.channel(CHANNEL_NAME, {
    config: { presence: { key: `shared:${Math.random().toString(36).slice(2)}` } },
  });
  sharedChannel = ch;
  sharedSubscribed = false;

  const sync = () => {
    sharedSnapshot = { states: ch.presenceState<PresenceState>() };
    emitSharedSnapshot();
  };

  ch.on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        sharedSubscribed = true;
        // Re-track every active tracker (publishers) on this shared channel.
        for (const meta of sharedTrackers.values()) {
          try { await ch.track(meta); } catch { /* ignore */ }
        }
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        sharedSubscribed = false;
      }
    });

  return ch;
}

function acquireSharedChannel(): ReturnType<typeof supabase.channel> {
  sharedRefCount++;
  return ensureSharedChannel();
}

function releaseSharedChannel() {
  sharedRefCount = Math.max(0, sharedRefCount - 1);
  if (sharedRefCount === 0 && sharedChannel) {
    try { supabase.removeChannel(sharedChannel); } catch { /* ignore */ }
    sharedChannel = null;
    sharedSubscribed = false;
    sharedSnapshot = { states: {} };
    sharedTrackers.clear();
  }
}

async function publishSharedPresence(key: string, meta: PresenceState) {
  sharedTrackers.set(key, meta);
  const ch = sharedChannel;
  if (ch && sharedSubscribed) {
    try { await ch.track(meta); } catch { /* ignore */ }
  }
}

function unpublishSharedPresence(key: string) {
  sharedTrackers.delete(key);
  const ch = sharedChannel;
  if (ch && sharedSubscribed) {
    try { ch.untrack(); } catch { /* ignore */ }
  }
}

export function useLobbyPresence({
  deviceId,
  name,
  roomCode = null,
  salaSlug: salaSlugProp = null,
  enabled = true,
  userId = null,
  /** Si es passa, filtra els jugadors que pertanyen a aquesta sala. */
  filterBySala,
}: {
  deviceId: string;
  name: string;
  roomCode?: string | null;
  salaSlug?: string | null;
  enabled?: boolean;
  userId?: string | null;
  filterBySala?: string | null;
}): OnlinePlayer[] {
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);

  // Derive salaSlug from roomCode if not explicitly provided
  const salaSlug = salaSlugProp ?? (roomCode ? salaForRoom({ code: roomCode }) : null);

  // Effect 1: subscribe to the shared lobby:presence channel and publish our meta
  useEffect(() => {
    if (!enabled || !deviceId || !name) {
      setPlayers([]);
      return;
    }
    acquireSharedChannel();

    const update = (snap: SharedPresenceSnapshot) => {
      const seen = new Map<string, OnlinePlayer>();
      for (const [key, metas] of Object.entries(snap.states)) {
        const meta = metas[0];
        if (!meta || !meta.name) continue;
        seen.set(key, {
          deviceId: meta.deviceId ?? key,
          name: meta.name,
          roomCode: meta.roomCode ?? null,
          salaSlug: meta.salaSlug ?? null,
          userId: meta.userId ?? null,
        });
      }
      setPlayers(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)));
    };
    sharedListeners.add(update);
    update(sharedSnapshot);

    void publishSharedPresence(deviceId, {
      deviceId,
      name,
      roomCode,
      salaSlug,
      userId,
      joinedAt: Date.now(),
    });

    return () => {
      sharedListeners.delete(update);
      unpublishSharedPresence(deviceId);
      releaseSharedChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, enabled]);

  // Effect 2: re-track when name, roomCode or salaSlug changes WITHOUT recreating the channel
  useEffect(() => {
    if (!enabled || !deviceId || !name) return;
    void publishSharedPresence(deviceId, {
      deviceId,
      name,
      roomCode,
      salaSlug,
      userId,
      joinedAt: Date.now(),
    });
  }, [deviceId, name, roomCode, salaSlug, userId, enabled]);

  // Inject dev mock players (and apply filterBySala client-side)
  const filtered = useMemo(() => {
    const merged = DEV_MOCK_PRESENCE
      ? [
          ...players,
          ...DEV_MOCK_ONLINE_PLAYERS.map((p) =>
            // Override salaSlug so mocks appear in the current sala view too.
            ({ ...p, salaSlug: filterBySala ?? p.salaSlug })
          ),
        ]
      : players;
    if (!filterBySala) return merged;
    return merged.filter((p) => p.salaSlug === filterBySala);
  }, [players, filterBySala]);

  return filtered;
}
/**
 * Hook passiu (read-only): es subscriu al canal de presència global sense
 * publicar res, i exposa els conjunts de `deviceId` i `userId` connectats.
 * Útil per a indicadors d'estat "Connectat / Desconnectat" en perfils.
 */
export function useOnlinePresenceLookup(enabled = true): {
  deviceIds: Set<string>;
  userIds: Set<string>;
} {
  const [state, setState] = useState<{ deviceIds: Set<string>; userIds: Set<string> }>(
    () => ({
      deviceIds: DEV_MOCK_PRESENCE ? new Set(DEV_MOCK_ONLINE_DEVICE_IDS) : new Set(),
      userIds: DEV_MOCK_PRESENCE ? new Set(DEV_MOCK_ONLINE_USER_IDS) : new Set(),
    }),
  );

  useEffect(() => {
    if (!enabled) return;
    acquireSharedChannel();

    const update = (snap: SharedPresenceSnapshot) => {
      const deviceIds = new Set<string>(
        DEV_MOCK_PRESENCE ? DEV_MOCK_ONLINE_DEVICE_IDS : [],
      );
      const userIds = new Set<string>(
        DEV_MOCK_PRESENCE ? DEV_MOCK_ONLINE_USER_IDS : [],
      );
      for (const metas of Object.values(snap.states)) {
        const meta = metas[0];
        if (!meta) continue;
        if (meta.deviceId) deviceIds.add(meta.deviceId);
        if (meta.userId) userIds.add(meta.userId);
      }
      setState({ deviceIds, userIds });
    };
    sharedListeners.add(update);
    update(sharedSnapshot);

    return () => {
      sharedListeners.delete(update);
      releaseSharedChannel();
    };
  }, [enabled]);

  return state;
}