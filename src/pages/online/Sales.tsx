import { Link, useNavigate } from "@/lib/router-shim";
import { useCallback, useEffect, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { LogOut, Users, Table2, UserRound } from "lucide-react";
import { listLobbyRooms, type LobbyRoomDTO } from "@/online/rooms.functions";
import { supabase } from "@/integrations/supabase/client";
import { useLobbyPresence } from "@/online/useLobbyPresence";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useAuth } from "@/hooks/useAuth";
import { summarizeLobbyView, type SalaSlug as SalaSlugT } from "@/online/salaAssignment";
import { useT } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

/**
 * Pantalla d'índex de Sales. Cada sala mostra 12 taules en la pantalla
 * "/online/lobby/:sala" (mateixa distribució que el lobby actual).
 */

export const SALES = [
  { slug: "la-falta", name: "Sala La Falta" },
  { slug: "truquers", name: "Sala Truquers" },
  { slug: "joc-fora", name: "Sala Joc Fora" },
  { slug: "9-bones", name: "Sala 9 Bones" },
] as const;

export type SalaSlug = (typeof SALES)[number]["slug"];

export function getSalaName(slug: string | undefined | null): string | null {
  const s = SALES.find((x) => x.slug === slug);
  return s ? s.name : null;
}

function SalesPage() {
  return (
    <ClientOnly>
      <Sales />
    </ClientOnly>
  );
}

function Sales() {
  const navigate = useNavigate();
  const t = useT();
  const { deviceId, name, hasName, ready } = usePlayerIdentity();
  const [rooms, setRooms] = useState<LobbyRoomDTO[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { rooms } = await listLobbyRooms({ data: {} });
      setRooms(rooms);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("sales-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players" }, () => refresh())
      .subscribe();
    // Sense polling: rooms/room_players via Realtime, presència via useLobbyPresence.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const { user } = useAuth();
  const onlinePlayers = useLobbyPresence({
    deviceId,
    name,
    roomCode: null,
    enabled: ready && hasName,
    userId: user?.id ?? null,
  });

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-8">
      <div className="fixed top-4 inset-x-4 z-50 flex items-center justify-between">
        <ShareAppButton />
        <Button
          onClick={() => navigate("/")}
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
          aria-label={t("common.back_home")}
          title={t("common.back_home")}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      <div className="w-full max-w-3xl flex flex-col gap-5">

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-3xl pr-2 text-center">{t("sales.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sales.subtitle")}
          </p>
        </header>

        <div className="border-t border-gold/60" />

        <section className="w-full max-w-md mx-auto flex flex-col gap-3">
          {SALES.map((s) => {
            const view = summarizeLobbyView({
              rooms,
              salaSlug: s.slug as SalaSlugT,
              onlinePlayers,
            });
            const avail = view.availableCount;
            const present = view.presentPlayers;
            const salaBtnClass =
              s.slug === "truquers"
                ? "bg-orange-500 text-background hover:bg-orange-500/90 shadow-[0_4px_16px_-2px_hsl(28_85%_55%/0.55),0_0_24px_hsl(28_85%_60%/0.3)]"
                : s.slug === "joc-fora"
                  ? "bg-team-nos text-background hover:bg-team-nos/90"
                  : s.slug === "9-bones"
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 gold-glow";
            return (
              <div key={s.slug} className="flex flex-col gap-2">
                <Button
                  asChild
                  size="lg"
                  className={`w-full min-h-14 h-auto py-2 font-display font-bold text-lg whitespace-normal ${salaBtnClass}`}
                >
                  <Link to={`/online/lobby/${s.slug}`}>
                    <Users className="w-5 h-5 mr-2 shrink-0" />
                    <span className="line-clamp-2 text-center leading-tight">{s.name}</span>
                  </Link>
                </Button>
                <div className="px-1 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Table2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                    <span>
                      <span className="text-foreground/80 font-medium">{avail}</span>{" "}
                      {avail === 1 ? t("sales.tables_available_one") : t("sales.tables_available_other")}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <UserRound className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                    {present.length === 0 ? (
                      <span>{t("sales.persons_connected_zero")}</span>
                    ) : (
                      <span className="truncate">
                        <span className="text-foreground/80 font-medium">{present.length}</span>{" "}
                        {present.length === 1 ? t("sales.persons_connected_one") : t("sales.persons_connected_other")}:{" "}
                        <span className="text-foreground/80">
                          {present.slice(0, 4).map((p) => p.name).join(", ")}
                          {present.length > 4 ? `, +${present.length - 4}` : ""}
                        </span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <div className="border-t border-gold/60" />
      </div>
    </main>
  );
}

export default SalesPage;