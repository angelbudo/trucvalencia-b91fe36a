import { supabase } from "@/integrations/supabase/client";
import type { ProfileRow, UserStats } from "@/lib/playerStats";

export type LeaderboardKind = "wins" | "level" | "streak" | "games";

export interface LeaderboardEntry {
  rank: number;
  profile: ProfileRow;
  stats: UserStats;
}

export async function fetchLeaderboard(kind: LeaderboardKind, limit = 50): Promise<LeaderboardEntry[]> {
  // For "games" we sort client-side by wins+losses since there's no combined column.
  const orderCol = kind === "wins" ? "wins" : kind === "level" ? "level" : kind === "streak" ? "max_streak" : "wins";
  const { data: stats, error } = await supabase
    .from("user_stats")
    .select("*")
    .order(orderCol, { ascending: false })
    .order("xp", { ascending: false })
    .limit(limit);
  if (error || !stats) return [];
  const ids = stats.map((s) => s.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", ids);
  const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p as ProfileRow]));
  const filtered = stats.filter((s) => byUser.has(s.user_id)) as UserStats[];
  if (kind === "games") {
    filtered.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses) || b.xp - a.xp);
  }
  return filtered.map((s, i) => ({ rank: i + 1, stats: s, profile: byUser.get(s.user_id) as ProfileRow }));
}