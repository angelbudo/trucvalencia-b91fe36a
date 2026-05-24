import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserStats {
  user_id: string;
  wins: number;
  losses: number;
  abandoned: number;
  current_streak: number;
  max_streak: number;
  xp: number;
  level: number;
}

export interface ProfileRow {
  user_id: string;
  display_name: string;
  friend_code: string;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
}

/** XP necessària per pujar de `level` a `level+1` (acumulada des de l'inici de level). */
export function xpForNextLevel(level: number): number {
  return level * 100;
}

/** XP acumulada total per arribar a un determinat nivell des de zero. */
export function xpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  // suma 1*100 + 2*100 + ... + (level-1)*100
  return (100 * (level - 1) * level) / 2;
}

export function progressInLevel(xp: number, level: number): { current: number; max: number; pct: number } {
  const base = xpThresholdForLevel(level);
  const max = xpForNextLevel(level);
  const current = Math.max(0, xp - base);
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return { current, max, pct };
}

/** Crida la RPC del backend per registrar el resultat d'una partida. */
export async function recordMatchResult(
  won: boolean,
  humanOpponents: number,
  botOpponents: number,
): Promise<UserStats | null> {
  try {
    const { data, error } = await supabase.rpc("record_match_result", {
      p_won: won,
      p_human_opponents: humanOpponents,
      p_bot_opponents: botOpponents,
    });
    if (error) {
      console.warn("[recordMatchResult]", error.message);
      return null;
    }
    return data as UserStats;
  } catch (e) {
    console.warn("[recordMatchResult]", e);
    return null;
  }
}

export function useMyProfile() {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setProfile(null); setStats(null); return; }
    setLoading(true);
    try {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      setProfile(p as ProfileRow | null);
      setStats(s as UserStats | null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (ready) void reload(); }, [ready, reload]);

  return { profile, stats, loading, reload, user, ready };
}