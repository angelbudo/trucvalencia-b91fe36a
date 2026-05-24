import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ProfileRow, UserStats } from "@/lib/playerStats";

export interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface FriendEntry {
  friendship: FriendshipRow;
  /** L'altre usuari (no jo) */
  other: ProfileRow;
  stats: UserStats | null;
  online: boolean;
}

const ONLINE_CHANNEL = "app:online-users";

/** Hook que es subscriu a un canal de presència global per saber quins users estan connectats. */
export function useOnlineUsers(): { isOnline: (userId: string) => boolean; onlineSet: Set<string> } {
  const { user } = useAuth();
  const [onlineSet, setOnlineSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setOnlineSet(new Set()); return; }
    const channel = supabase.channel(ONLINE_CHANNEL, {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineSet(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, t: Date.now() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return {
    onlineSet,
    isOnline: (uid: string) => onlineSet.has(uid),
  };
}

export function useFriends() {
  const { user, ready } = useAuth();
  const [accepted, setAccepted] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { onlineSet } = useOnlineUsers();
  const reloadRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    if (!user) {
      setAccepted([]); setIncoming([]); setOutgoing([]); return;
    }
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      const friendships = (rows ?? []) as FriendshipRow[];
      const otherIds = Array.from(new Set(friendships.map((f) => f.user_a === user.id ? f.user_b : f.user_a)));
      let profiles: ProfileRow[] = [];
      let stats: UserStats[] = [];
      if (otherIds.length > 0) {
        const [pRes, sRes] = await Promise.all([
          supabase.from("profiles").select("*").in("user_id", otherIds),
          supabase.from("user_stats").select("*").in("user_id", otherIds),
        ]);
        profiles = (pRes.data ?? []) as ProfileRow[];
        stats = (sRes.data ?? []) as UserStats[];
      }
      const byUser = new Map(profiles.map((p) => [p.user_id, p]));
      const statsByUser = new Map(stats.map((s) => [s.user_id, s]));

      const buildEntry = (f: FriendshipRow): FriendEntry | null => {
        const otherId = f.user_a === user.id ? f.user_b : f.user_a;
        const other = byUser.get(otherId);
        if (!other) return null;
        return {
          friendship: f,
          other,
          stats: statsByUser.get(otherId) ?? null,
          online: onlineSet.has(otherId),
        };
      };
      const entries = friendships.map(buildEntry).filter(Boolean) as FriendEntry[];
      setAccepted(entries.filter((e) => e.friendship.status === "accepted"));
      setIncoming(entries.filter((e) => e.friendship.status === "pending" && e.friendship.requested_by !== user.id));
      setOutgoing(entries.filter((e) => e.friendship.status === "pending" && e.friendship.requested_by === user.id));
    } finally {
      setLoading(false);
    }
  }, [user, onlineSet]);

  reloadRef.current = reload;

  useEffect(() => { if (ready) void reload(); }, [ready, reload]);

  // Realtime: refresca quan hi ha canvis a friendships
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`friendships:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        reloadRef.current?.();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return { accepted, incoming, outgoing, loading, reload };
}

export async function sendFriendRequestByCode(code: string) {
  const { data, error } = await supabase.rpc("send_friend_request_by_code", { p_code: code });
  if (error) throw new Error(translateFriendError(error.message));
  return data;
}

export async function sendFriendRequestByEmail(email: string) {
  const { data, error } = await supabase.rpc("send_friend_request_by_email", { p_email: email });
  if (error) throw new Error(translateFriendError(error.message));
  return data;
}

export async function sendFriendRequestByUsername(username: string) {
  const { data, error } = await supabase.rpc("send_friend_request_by_username", { p_username: username });
  if (error) throw new Error(translateFriendError(error.message));
  return data;
}

export async function respondFriendRequest(friendshipId: string, accept: boolean) {
  const { error } = await supabase.rpc("respond_friend_request", { p_friendship_id: friendshipId, p_accept: accept });
  if (error) throw new Error(translateFriendError(error.message));
}

export async function removeFriend(friendUserId: string) {
  const { error } = await supabase.rpc("remove_friend", { p_friend_user_id: friendUserId });
  if (error) throw new Error(translateFriendError(error.message));
}

function translateFriendError(msg: string): string {
  if (msg.includes("user_not_found")) return "Usuari no trobat";
  if (msg.includes("cannot_friend_self")) return "No pots afegir-te a tu mateix";
  if (msg.includes("not_authenticated")) return "Has d'iniciar sessió";
  if (msg.includes("invalid_code")) return "Codi no vàlid";
  if (msg.includes("forbidden")) return "No tens permís";
  if (msg.includes("cannot_self_respond")) return "No pots respondre a la teua pròpia sol·licitud";
  return msg;
}