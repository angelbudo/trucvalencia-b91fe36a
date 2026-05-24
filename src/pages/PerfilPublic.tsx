import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "@/lib/router-shim";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Star, Trophy, Flame, WalletCards, ThumbsDown, X, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendFriendRequestByCode } from "@/lib/friends";
import { progressInLevel } from "@/lib/playerStats";
import { useOnlinePresenceLookup } from "@/online/useLobbyPresence";
import { ConnectionStatus } from "@/components/ConnectionStatus";

interface PublicProfile {
  user_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  friend_code: string;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  abandoned: number;
  current_streak: number;
  max_streak: number;
}

interface PublicFriend {
  user_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  level: number;
  wins: number;
  losses: number;
  max_streak: number;
}

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function StatBox({ icon, label, value, accent, valueClassName, labelClassName }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: string; valueClassName?: string; labelClassName?: string }) {
  return (
    <div className="rounded-md border border-primary/25 bg-background/40 p-3 text-center">
      <div className={`flex items-center justify-center gap-1 text-xs mb-1 ${accent ?? "text-muted-foreground"}`}>
        {icon}<span className={labelClassName}>{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueClassName ?? accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function PerfilPublicInner() {
  const navigate = useNavigate();
  const { userId = "" } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { userIds: onlineUsers } = useOnlinePresenceLookup(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friendsList, setFriendsList] = useState<PublicFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setProfile(null);
    setFriendsList([]);
    (async () => {
      const { data, error } = await supabase.rpc("get_public_player_profile_by_user_id", { p_user_id: userId });
      if (!alive) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const publicProfile = row as PublicProfile;
      setProfile(publicProfile);
      const { data: fdata } = await supabase.rpc("get_public_friends_by_user_id", { p_user_id: publicProfile.user_id });
      if (alive && Array.isArray(fdata)) setFriendsList(fdata as PublicFriend[]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  async function handleAddFriend() {
    if (!profile?.friend_code) return;
    if (!user) {
      toast.error("Has d'iniciar sessió per afegir amics");
      return;
    }
    setBusy(true);
    try {
      await sendFriendRequestByCode(profile.friend_code);
      toast.success("Sol·licitud enviada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  if (notFound || !profile) {
    return (
      <main className="menu-screen min-h-screen px-4 py-5 pb-24">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="w-fit">
            <ArrowLeft className="w-4 h-4 mr-1" /> Tornar
          </Button>
          <p className="text-sm text-muted-foreground text-center py-8">Aquest jugador encara no té perfil públic.</p>
        </div>
      </main>
    );
  }

  const displayName = profile.username ?? profile.display_name ?? "Jugador";
  const initial = displayName.trim().charAt(0).toUpperCase();
  const isSelf = !!user && user.id === profile.user_id;
  const total = profile.wins + profile.losses;
  const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;
  const prog = progressInLevel(profile.xp, profile.level);

  return (
    <main className="menu-screen min-h-screen px-4 py-5 pb-24">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Tornar
          </Button>
          {isSelf && <Button size="sm" variant="outline" onClick={() => navigate("/perfil")}>El meu perfil</Button>}
        </div>

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-2xl text-center">Perfil del jugador</h1>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/40 bg-background/50 flex items-center justify-center shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-bold text-2xl text-foreground">{initial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-lg text-foreground truncate">{displayName}</div>
              {!isSelf && <ConnectionStatus online={onlineUsers.has(profile.user_id)} className="mt-0.5" />}
            </div>
            <Badge variant="outline" className="gap-1 border-transparent text-white bg-[#f97415]">
              <Star className="w-3 h-3 text-white" /> Nivell {profile.level}
            </Badge>
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{prog.current} / {prog.max} XP</span>
              <span>Nivell {profile.level + 1}</span>
            </div>
            <div className="h-2 rounded-full bg-muted-foreground/50 border border-primary/20 overflow-hidden">
              <div className="h-full bg-[#f97415] transition-all" style={{ width: `${prog.pct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatBox icon={<WalletCards className="w-4 h-4 text-[#93c572]" />} label="Partides" value={total} accent="text-foreground/30 font-bold text-slate-100" labelClassName="text-[#93c572]" />
            <StatBox icon={<ThumbsDown className="w-4 h-4 text-stone-500" />} label="Abandonades" value={profile.abandoned} accent="text-foreground/30 font-bold text-slate-100 text-[#df2020]" labelClassName="text-stone-500" />
            <StatBox icon={<Trophy className="w-4 h-4 text-[#e6b033]" />} label="Victòries" value={profile.wins} accent="text-primary font-bold text-[#e6b033]" valueClassName="text-slate-100" labelClassName="text-[#e6b033]" />
            <StatBox icon={<X className="w-4 h-4 text-[#df2020]" />} label="Derrotes" value={profile.losses} accent="text-foreground/30 font-bold text-slate-100 text-[#df2020]" labelClassName="text-[#df2020]" />
            <StatBox icon={<Star className="w-4 h-4 text-[#e6b033]" />} label="% Victòries" value={`${winRate}%`} accent="text-foreground/30 font-bold text-slate-100" labelClassName="text-[#e6b033]" />
            <StatBox icon={<Flame className="w-4 h-4 text-[#f97415]" />} label="Ratxa màx." value={profile.max_streak} accent="font-bold text-slate-100" labelClassName="text-[#f97415]" />
          </div>

          {!isSelf && (
            <div className="flex justify-center pt-1">
              <Button onClick={handleAddFriend} disabled={busy || !user} size="sm">
                <UserPlus className="w-4 h-4 mr-1" />
                {user ? "Afegir com a amic" : "Inicia sessió per afegir"}
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 mt-2">
          <div className="text-[10px] font-display tracking-widest uppercase text-primary/85 flex items-center gap-1.5 text-[#e6b033]">
            <Users className="w-4 h-4 text-[#e6b033]" /> <span className="text-[#e6b033]">Amics ({friendsList.length})</span>
          </div>
          {friendsList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Encara no té amics.</p>
          ) : (
            <div className="avatar-scroll max-h-[45vh] overflow-y-auto pr-2 space-y-2">
              {friendsList.map((friend) => {
                const name = friend.username ?? friend.display_name ?? "Jugador";
                const friendInitial = name.trim().charAt(0).toUpperCase();
                return (
                  <PlayerProfileDialog
                    key={friend.user_id}
                    userId={friend.user_id}
                    fallbackName={name}
                    trigger={
                      <button type="button" className="w-full flex items-center gap-3 rounded-md border border-primary/25 bg-stone-200 p-2 py-[2px] pb-[4px] text-left hover:bg-stone-300 transition">
                        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary/40 bg-background/50 flex items-center justify-center shrink-0">
                          {friend.avatar_url ? (
                            <img src={friend.avatar_url} alt={name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-display font-bold text-sm text-foreground">{friendInitial}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-foreground text-neutral-900">{name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold leading-none">
                            <span className="inline-flex items-center gap-0.5 text-[#e6b033]" title="Nivell"><Star className="w-3.5 h-3.5" /> {friend.level}</span>
                            <span className="inline-flex items-center gap-0.5 text-[#93c572]" title="Partides"><WalletCards className="w-3.5 h-3.5" /> {friend.wins + friend.losses}</span>
                            <span className="inline-flex items-center gap-0.5 text-[#e6b033]" title="Victòries"><Trophy className="w-3.5 h-3.5" /> {friend.wins}</span>
                            <span className="inline-flex items-center gap-0.5 text-destructive" title="Derrotes"><X className="w-3.5 h-3.5" /> {friend.losses}</span>
                            <span className="inline-flex items-center gap-0.5 text-[#f97415]" title="Ratxa màx."><Flame className="w-3.5 h-3.5" /> {friend.max_streak}</span>
                          </div>
                        </div>
                      </button>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function PerfilPublic() {
  return <ClientOnly fallback={<Loading />}><PerfilPublicInner /></ClientOnly>;
}