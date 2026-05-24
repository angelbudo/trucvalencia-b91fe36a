import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Trophy, Star, Flame, Gamepad2, X } from "lucide-react";
import { fetchLeaderboard, type LeaderboardEntry, type LeaderboardKind } from "@/lib/leaderboards";

function Loading() {
  return <div className="py-10 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
}

function Board({ kind }: { kind: LeaderboardKind }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchLeaderboard(kind).then((e) => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [kind]);
  if (!entries) return <Loading />;
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Encara no hi ha jugadors classificats.</p>;
  }
  return (
    <div className="avatar-scroll max-h-[55vh] overflow-y-auto pr-2 space-y-1.5">
      {entries.map((e) => {
        const label = e.profile.username ?? "Jugador anònim";
        const games = e.stats.wins + e.stats.losses;
        const kindMeta = {
          level: { icon: <Star className="w-4 h-4 mt-[2px] text-[#f97415]" />, value: e.stats.level, className: "text-[#f97415] text-base -mt-[2px]", style: undefined as CSSProperties | undefined },
          games: { icon: <Gamepad2 className="w-4 h-4 text-[#93c572]" />, value: games, className: "text-[#93c572]", style: undefined },
          wins: { icon: <Trophy className="w-4 h-4 text-[#ef8e39]" />, value: e.stats.wins, className: "text-[#ef8e39]", style: undefined },
          streak: { icon: <Flame className="w-4 h-4 text-[#66a50d]" />, value: e.stats.max_streak, className: "text-[#66a50d]", style: undefined },
        }[kind];
        return (
          <PlayerProfileDialog
            key={e.profile.user_id}
            userId={e.profile.user_id}
            fallbackName={label}
            trigger={
              <button type="button" className="w-full flex items-center gap-2 border border-primary/25 p-2 text-neutral-900 bg-stone-200 hover:bg-stone-300 transition mx-0 rounded-xl ml-0 -mr-[6px] text-left">
                <div className="flex items-center min-w-0 flex-1 -my-[5px] -mt-[10px] gap-[5px] mx-0 -ml-[5px]">
                  <span className="w-7 text-center font-bold text-neutral-900 mt-[4px]">{e.rank}</span>
                  <div className="min-w-0">
                    <div className={`font-medium truncate ${e.profile.username ? "" : "italic"}`}>{label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold leading-none">
                      <span className="inline-flex items-center gap-0.5 text-[#f97415]" title="Nivell">
                        <Star className="w-3.5 h-3.5" /> {e.stats.level}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[#93c572]" title="Partides">
                        <Gamepad2 className="w-3.5 h-3.5" /> {games}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[#ef8e39]" title="Victòries">
                        <Trophy className="w-3.5 h-3.5" /> {e.stats.wins}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[#df2020]" title="Derrotes">
                        <X className="w-3.5 h-3.5" /> {e.stats.losses}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[#66a50d]" title="Ratxa màx.">
                        <Flame className="w-3.5 h-3.5" /> {e.stats.max_streak}
                      </span>
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 font-bold shrink-0 ${kindMeta.className} mr-[5px]`} style={kindMeta.style}>
                  {kindMeta.icon} {kindMeta.value}
                </span>
              </button>
            }
          />
        );
      })}
    </div>
  );
}

export function ClassificacionsDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[90vw] sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-gold font-title font-black italic">Classificacions</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="level">
          <TabsList className="inline-flex w-auto h-auto gap-1 mx-0 -mx-px -ml-px rounded-xl">
            <TabsTrigger value="level" className="text-[#f97415] data-[state=active]:text-[#f97415] py-1.5 text-xs gap-1 px-[6px] mx-0"><Star className="w-3.5 h-3.5 shrink-0" />Nivell</TabsTrigger>
            <TabsTrigger value="games" className="text-[#93c572] data-[state=active]:text-[#93c572] py-1.5 text-xs gap-1 px-[6px] mx-0"><Gamepad2 className="w-3.5 h-3.5 shrink-0" />Partides</TabsTrigger>
            <TabsTrigger value="wins" className="text-[#ef8e39] data-[state=active]:text-[#ef8e39] py-1.5 text-xs gap-1 px-[6px] mx-0"><Trophy className="w-3.5 h-3.5 shrink-0" />Victòries</TabsTrigger>
            <TabsTrigger value="streak" className="text-[#66a50d] data-[state=active]:text-[#66a50d] py-1.5 text-xs gap-1 px-[6px] mx-0"><Flame className="w-3.5 h-3.5 shrink-0" />Ratxa</TabsTrigger>
          </TabsList>
          <TabsContent value="level" className="mt-3"><Board kind="level" /></TabsContent>
          <TabsContent value="games" className="mt-3"><Board kind="games" /></TabsContent>
          <TabsContent value="wins" className="mt-3"><Board kind="wins" /></TabsContent>
          <TabsContent value="streak" className="mt-3"><Board kind="streak" /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}