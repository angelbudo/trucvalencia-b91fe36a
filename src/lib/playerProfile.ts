/**
 * Client wrapper for the adaptive player profile system.
 * Loads/persists per-device player playstyle in Lovable Cloud.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tuningFromProfile, type BotTuning, type PlayerProfile, NEUTRAL_TUNING, type BotDifficulty } from "@/game/profileAdaptation";
import type { BotHonesty } from "@/lib/gameSettings";

export type ProfileEvent =
  | { type: "game_started" }
  | { type: "envit_called"; strength: number; bluff: boolean }
  | { type: "truc_called"; strength: number; bluff: boolean }
  | { type: "envit_response"; accepted: boolean }
  | { type: "truc_response"; accepted: boolean };

async function rpc<T>(fn: string, data: unknown): Promise<T> {
  const { data: result, error } = await supabase.functions.invoke("player-profile", {
    body: { fn, data },
  });
  if (error) throw new Error(error.message ?? "Error");
  if (result && typeof result === "object" && "error" in result && (result as any).error) {
    throw new Error((result as any).error);
  }
  return result as T;
}

export async function fetchPlayerProfile(deviceId: string): Promise<PlayerProfile | null> {
  if (!deviceId) return null;
  try {
    const { profile } = await rpc<{ profile: PlayerProfile }>("get", { deviceId });
    return profile;
  } catch {
    return null;
  }
}

export async function trackPlayerEvents(deviceId: string, events: ProfileEvent[]): Promise<PlayerProfile | null> {
  if (!deviceId || events.length === 0) return null;
  try {
    const { profile } = await rpc<{ profile: PlayerProfile }>("track", { deviceId, events });
    return profile;
  } catch {
    return null;
  }
}

/**
 * Hook used by the local game page. Loads the profile on mount, exposes
 * a `track()` function that batches events and persists them, and exposes
 * the derived `tuning` for bot decisions.
 */
export async function setPlayerDifficulty(deviceId: string, difficulty: BotDifficulty): Promise<void> {
  if (!deviceId) return;
  try {
    await rpc<{ ok: boolean }>("set_difficulty", { deviceId, difficulty });
  } catch {
    /* noop */
  }
}

export async function setPlayerHonesty(deviceId: string, honesty: BotHonesty): Promise<void> {
  if (!deviceId) return;
  try {
    await rpc<{ ok: boolean }>("set_honesty", { deviceId, honesty });
  } catch {
    /* noop */
  }
}

export function usePlayerProfile(
  deviceId: string | null,
  difficulty?: BotDifficulty,
  honesty?: BotHonesty,
) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const queueRef = useRef<ProfileEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const lastDifficultyRef = useRef<BotDifficulty | null>(null);
  const lastHonestyRef = useRef<BotHonesty | null>(null);

  useEffect(() => {
    let alive = true;
    if (!deviceId) return;
    fetchPlayerProfile(deviceId).then((p) => {
      if (alive && p) setProfile(p);
    });
    return () => { alive = false; };
  }, [deviceId]);

  // Push difficulty preference to backend so online bots can use it too.
  useEffect(() => {
    if (!deviceId || !difficulty) return;
    if (lastDifficultyRef.current === difficulty) return;
    lastDifficultyRef.current = difficulty;
    void setPlayerDifficulty(deviceId, difficulty);
  }, [deviceId, difficulty]);

  // Push honesty preference to backend so online bots farolean/lie accordingly.
  useEffect(() => {
    if (!deviceId || !honesty) return;
    if (lastHonestyRef.current === honesty) return;
    lastHonestyRef.current = honesty;
    void setPlayerHonesty(deviceId, honesty);
  }, [deviceId, honesty]);

  const flush = useCallback(async () => {
    if (!deviceId || inflightRef.current) return;
    const events = queueRef.current;
    if (events.length === 0) return;
    queueRef.current = [];
    inflightRef.current = true;
    try {
      const updated = await trackPlayerEvents(deviceId, events);
      if (updated) setProfile(updated);
    } finally {
      inflightRef.current = false;
    }
  }, [deviceId]);

  const track = useCallback((event: ProfileEvent) => {
    queueRef.current.push(event);
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => { void flush(); }, 1500) as unknown as number;
  }, [flush]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      void flush();
    };
  }, [flush]);

  const tuning: BotTuning = profile ? tuningFromProfile(profile) : NEUTRAL_TUNING;
  return { profile, tuning, track, flush };
}