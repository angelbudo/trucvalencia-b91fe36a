import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "@/lib/router-shim";
import { ClientOnly } from "@/components/ClientOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Trophy, Star, Flame, WalletCards, X } from "lucide-react";
import { fetchLeaderboard, type LeaderboardEntry, type LeaderboardKind } from "@/lib/leaderboards";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";

function Loading() {
  return <main className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>;
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
    <div className="space-y-1.5">
      {entries.map((e) => {
    const label = e.profile.username
      ? e.profile.username
      : "Jugador anònim";
    const games = e.stats.wins + e.stats.losses;
    const kindMeta = {
      level: { icon: <Star className="w-4 h-4 text-[#f97415]" />, value: e.stats.level, className: "text-[#f97415]", style: undefined as CSSProperties | undefined },
      games: { icon: <WalletCards className="w-4 h-4 text-[#93c572]" />, value: games, className: "text-[#93c572]", style: undefined },
      wins: { icon: <Trophy className="w-4 h-4 text-[#ef8e39]" />, value: e.stats.wins, className: "text-[#ef8e39]", style: undefined },
      streak: { icon: <Flame className="w-4 h-4 text-[#66a50d]" />, value: e.stats.max_streak, className: "text-[#66a50d]", style: undefined },
    }[kind];
        return (
          <PlayerProfileDialog
            key={e.profile.user_id}
            userId={e.profile.user_id}
            fallbackName={label}
            trigger={
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-background/60 transition"
              >
                <div className="flex items-center min-w-0 flex-1 -ml-[10px] -my-[5px] -mt-[10px] gap-[5px]">
                  <span className="w-7 text-center font-bold text-muted-foreground">{e.rank}</span>
                  <div className="min-w-0">
                    <div className={`font-medium truncate ${e.profile.username ? "" : "italic text-muted-foreground"}`}>{label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold leading-none">
                      <span className="inline-flex items-center gap-0.5 text-[#f97415]" title="Nivell">
                        <Star className="w-3.5 h-3.5" /> {e.stats.level}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[#93c572]" title="Partides">
                        <WalletCards className="w-3.5 h-3.5" /> {games}
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
                <span className={`inline-flex items-center gap-1 font-bold text-sm shrink-0 ${kindMeta.className}`} style={kindMeta.style}>
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

function Inner() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto pb-24">
      <header className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/perfil")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Tornar
        </Button>
        <h1 className="text-xl font-bold">Classificacions</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top jugadors</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="wins">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="wins" className="text-[#ef8e39] data-[state=active]:text-[#ef8e39]"><Trophy className="w-4 h-4 mr-1" />Victòries</TabsTrigger>
              <TabsTrigger value="level" className="text-[#f97415] data-[state=active]:text-[#f97415]"><Star className="w-4 h-4 mr-1" />Nivell</TabsTrigger>
              <TabsTrigger value="streak" className="text-[#66a50d] data-[state=active]:text-[#66a50d]"><Flame className="w-4 h-4 mr-1" />Ratxa</TabsTrigger>
            </TabsList>
            <TabsContent value="wins" className="mt-3"><Board kind="wins" /></TabsContent>
            <TabsContent value="level" className="mt-3"><Board kind="level" /></TabsContent>
            <TabsContent value="streak" className="mt-3"><Board kind="streak" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}

export default function Classificacions() {
  return <ClientOnly fallback={<Loading />}><Inner /></ClientOnly>;
}