import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerMiniStats {
  level: number;
  wins: number;
  losses: number;
  abandoned: number;
}

export interface PlayerStatsKey {
  deviceId: string;
  userId?: string | null;
}

const cache = new Map<string, PlayerMiniStats | null>();
const inflight = new Map<string, Promise<void>>();
const subscribers = new Set<() => void>();

function notify() {
  for (const s of subscribers) s();
}

function cacheKey(k: PlayerStatsKey): string {
  return k.userId ? `u:${k.userId}` : `d:${k.deviceId}`;
}

async function fetchOne(k: PlayerStatsKey): Promise<void> {
  const key = cacheKey(k);
  if (cache.has(key)) return;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { data, error } = k.userId
        ? await supabase.rpc("get_public_player_profile_by_user_id", { p_user_id: k.userId })
        : await supabase.rpc("get_public_player_profile_by_device", { p_device_id: k.deviceId });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        cache.set(key, null);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as {
          level: number; wins: number; losses: number; abandoned: number;
        };
        cache.set(key, {
          level: row.level ?? 1,
          wins: row.wins ?? 0,
          losses: row.losses ?? 0,
          abandoned: row.abandoned ?? 0,
        });
      }
    } catch {
      cache.set(key, null);
    } finally {
      inflight.delete(key);
      notify();
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Returns a lookup function: getStats(key) → stats or null/undefined while loading. */
export function usePlayerMiniStats(players: PlayerStatsKey[]): {
  getStats: (k: PlayerStatsKey) => PlayerMiniStats | null | undefined;
} {
  const [, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  }, []);

  useEffect(() => {
    for (const p of players) {
      if (!p.deviceId && !p.userId) continue;
      void fetchOne(p);
    }
  }, [players]);

  return {
    getStats: (k: PlayerStatsKey) => cache.get(cacheKey(k)),
  };
}