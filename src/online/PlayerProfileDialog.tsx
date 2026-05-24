import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, Trophy, Flame, Gamepad2, X, ThumbsDown, UserPlus, Users, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendFriendRequestByCode } from "@/lib/friends";
import { progressInLevel } from "@/lib/playerStats";
import { useOnlinePresenceLookup } from "@/online/useLobbyPresence";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { toast } from "sonner";

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

function StatBox({ icon, label, value, accent, valueClassName, labelClassName }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: string; valueClassName?: string; labelClassName?: string }) {
  return (
    <div className="rounded-md border border-primary/25 bg-background/40 p-3 text-center">
      <div className={`flex items-center justify-center gap-1 text-xs font-bold mb-1 ${accent ?? "text-muted-foreground"}`}>
        {icon}<span className={labelClassName}>{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueClassName ?? accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

export function PlayerProfileDialog({
  deviceId,
  userId,
  fallbackName,
  trigger,
}: {
  deviceId?: string;
  userId?: string;
  fallbackName: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [friendsList, setFriendsList] = useState<PublicFriend[]>([]);
  const { user } = useAuth();
  const { deviceIds: onlineDevices, userIds: onlineUsers } = useOnlinePresenceLookup(open);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setProfile(null);
    setFriendsList([]);
    (async () => {
      const { data, error } = userId
        ? await supabase.rpc("get_public_player_profile_by_user_id", { p_user_id: userId })
        : await supabase.rpc("get_public_player_profile_by_device", { p_device_id: deviceId! });
      if (!alive) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setProfile(row as PublicProfile);
        const { data: fdata } = await supabase.rpc("get_public_friends_by_user_id", { p_user_id: (row as PublicProfile).user_id });
        if (alive && Array.isArray(fdata)) setFriendsList(fdata as PublicFriend[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, deviceId, userId]);

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

  const isSelf = !!(user && profile && profile.user_id === user.id);
  const total = profile ? profile.wins + profile.losses : 0;
  const winRate = total > 0 ? Math.round(((profile?.wins ?? 0) / total) * 100) : 0;
  const prog = profile ? progressInLevel(profile.xp, profile.level) : null;
  const displayName = profile?.username ?? profile?.display_name ?? fallbackName;
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[90vw] sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-gold font-title font-black italic">Perfil del jugador</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : notFound || !profile ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aquest jugador encara no té perfil públic.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/40 bg-background/50 flex items-center justify-center shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-xl text-foreground">{initial}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-foreground truncate normal-case">{displayName}</div>
                {!isSelf && (
                  <ConnectionStatus
                    online={
                      (!!profile.user_id && onlineUsers.has(profile.user_id)) ||
                      (!!deviceId && onlineDevices.has(deviceId))
                    }
                    className="mt-0.5"
                  />
                )}
              </div>
              <Badge variant="outline" className="gap-1 border-transparent text-white bg-[#f97415]">
                <Star className="w-3 h-3 text-white" /> Nivell {profile.level}
              </Badge>
            </div>

            {prog && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{prog.current} / {prog.max} XP</span>
                  <span>Nivell {profile.level + 1}</span>
                </div>
                <div className="h-2 rounded-full bg-muted-foreground/50 border border-primary/20 overflow-hidden">
                  <div className="h-full bg-[#f97415] transition-all" style={{ width: `${prog.pct}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatBox icon={<Gamepad2 className="w-3 h-3 text-[#93c572]" />} label="Partides" value={total} accent="text-foreground/30 font-bold text-slate-100" labelClassName="text-[#93c572]" />
              <StatBox icon={<ThumbsDown className="w-3 h-3 text-stone-500" />} label="Abandonades" value={profile.abandoned} accent="text-foreground/30 font-bold text-slate-100 text-[#df2020]" labelClassName="text-stone-500" />
              <StatBox icon={<Trophy className="w-3 h-3 text-[#ef8e39]" />} label="Victòries" value={profile.wins} accent="text-primary font-bold text-[#ef8e39]" valueClassName="text-slate-100" labelClassName="text-[#ef8e39]" />
              <StatBox icon={<X className="w-3 h-3 text-[#df2020]" />} label="Derrotes" value={profile.losses} accent="text-foreground/30 font-bold text-slate-100 text-[#df2020]" labelClassName="text-[#df2020]" />
              <StatBox icon={<Trophy className="w-3 h-3 text-[#e6b033]" />} label="% Victòries" value={`${winRate}%`} accent="text-foreground/30 font-bold text-slate-100" labelClassName="text-[#e6b033]" />
              <StatBox icon={<Flame className="w-3 h-3 text-[#66a50d]" />} label="Ratxa màx." value={profile.max_streak} accent="font-bold text-slate-100" labelClassName="text-[#66a50d]" />
            </div>

            {!isSelf && (
              <div className="flex justify-center pt-1">
                <Button onClick={handleAddFriend} disabled={busy || !user} size="sm">
                  <UserPlus className="w-4 h-4 mr-1" />
                  {user ? "Afegir com a amic" : "Inicia sessió per afegir"}
                </Button>
              </div>
            )}

            <div className="mt-2">
              <div className="text-[10px] font-display tracking-widest uppercase text-primary/85 flex items-center gap-1.5 text-[#e6b033]">
                <Users className="w-4 h-4 text-[#e6b033]" /> <span className="text-[#e6b033]">Amics ({friendsList.length})</span>
              </div>
              {friendsList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Encara no té amics.</p>
              ) : (
                <div className="avatar-scroll max-h-[35vh] overflow-y-auto pr-2 space-y-2">
                  {friendsList.map((f) => {
                    const fname = f.username ?? f.display_name ?? "Jugador";
                    const finit = (fname || "?").trim().charAt(0).toUpperCase();
                    return (
                      <PlayerProfileDialog
                        key={f.user_id}
                        userId={f.user_id}
                        fallbackName={fname}
                        trigger={
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 rounded-md border border-primary/25 bg-stone-200 p-2 text-left hover:bg-stone-300 transition"
                          >
                            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary/40 bg-background/50 flex items-center justify-center shrink-0">
                              {f.avatar_url ? (
                                <img src={f.avatar_url} alt={fname} className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-display font-bold text-sm text-foreground">{finit}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-foreground text-neutral-900 normal-case">{fname}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold leading-none">
                                <span className="inline-flex items-center gap-0.5 text-[#f97415]" title="Nivell"><Star className="w-3.5 h-3.5" /> {f.level}</span>
                                <span className="inline-flex items-center gap-0.5 text-[#93c572]" title="Partides"><Gamepad2 className="w-3.5 h-3.5" /> {f.wins + f.losses}</span>
                                <span className="inline-flex items-center gap-0.5 text-[#ef8e39]" title="Victòries"><Trophy className="w-3.5 h-3.5" /> {f.wins}</span>
                                <span className="inline-flex items-center gap-0.5 text-destructive" title="Derrotes"><X className="w-3.5 h-3.5" /> {f.losses}</span>
                                <span className="inline-flex items-center gap-0.5 text-[#66a50d]" title="Ratxa màx."><Flame className="w-3.5 h-3.5" /> {f.max_streak}</span>
                              </div>
                            </div>
                          </button>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}