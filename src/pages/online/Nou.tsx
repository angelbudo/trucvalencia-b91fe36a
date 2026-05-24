import { useNavigate, useSearchParams } from "@/lib/router-shim";
import { useEffect, useRef, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { createRoom, listLobbyRooms } from "@/online/rooms.functions";
import type { PlayerId } from "@/game/types";
import type { SeatKind } from "@/online/types";
import { Loader2, LogOut, Settings } from "lucide-react";
import { SALA_SLUGS, VISIBLE_TABLES_PER_SALA, isRoomVisibleInSala, placeholderRoomCode, placeholderSlotIndex, salaForRoom } from "@/online/salaAssignment";
import { useT } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function OnlineNouPage() {
  return (
    <ClientOnly fallback={<Loading />}>
      <NovaSala />
    </ClientOnly>
  );
}

// Valors per defecte de la mesa creada des del menú principal.
const DEFAULT_HOST_SEAT: PlayerId = 0;
const DEFAULT_SEAT_KINDS: SeatKind[] = ["human", "human", "human", "human"];
const DEFAULT_TARGET_CAMES = 2;
const DEFAULT_TARGET_CAMA: 9 | 12 = 12;
const DEFAULT_TURN_TIMEOUT_SEC = 30;

function NovaSala() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const t = useT();
  const { deviceId, name, hasName, ready } = usePlayerIdentity();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!hasName) return;
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const explicitCode = (searchParams.get("code") || "").trim().toUpperCase();
        const explicitSala = (searchParams.get("sala") || "").trim() || undefined;

        // Construïm la llista de candidats (codi + sala) en l'ordre fix de
        // sales i slots. Mai cap codi aleatori: només codis "Taula XXXXXX"
        // predefinits. Si el servidor ens diu que el primer està ocupat
        // (`code_in_use`), provem el següent.
        type Candidate = { code: string; sala: string };
        const candidates: Candidate[] = [];
        if (explicitCode) {
          candidates.push({ code: explicitCode, sala: explicitSala ?? salaForRoom({ code: explicitCode }) });
        } else {
          const { rooms } = await listLobbyRooms({ data: {} });
          for (const slug of SALA_SLUGS) {
            const occupied = new Set<number>();
            for (const room of rooms) {
              const sIdx = placeholderSlotIndex(slug, room.code);
              if (sIdx != null && isRoomVisibleInSala(room, slug)) {
                occupied.add(sIdx);
              }
            }
            for (let i = 0; i < VISIBLE_TABLES_PER_SALA; i++) {
              if (!occupied.has(i)) candidates.push({ code: placeholderRoomCode(slug, i), sala: slug });
            }
          }
        }

        if (candidates.length === 0) {
          throw new Error(t("nou.no_free_tables") || "No hi ha mesures lliures a cap sala.");
        }

        const randomMano = Math.floor(Math.random() * 4) as PlayerId;
        let lastErr: unknown = null;
        for (const cand of candidates) {
          try {
            const res = await createRoom({
              data: {
                hostDevice: deviceId,
                hostName: name,
                targetCames: DEFAULT_TARGET_CAMES,
                targetCama: DEFAULT_TARGET_CAMA,
                turnTimeoutSec: DEFAULT_TURN_TIMEOUT_SEC,
                initialMano: randomMano,
                seatKinds: DEFAULT_SEAT_KINDS,
                hostSeat: DEFAULT_HOST_SEAT,
                salaSlug: cand.sala,
                requestedCode: cand.code,
              },
            });
            navigate(`/online/sala/${res.code}`);
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastErr = e;
            if (msg.includes("code_in_use")) continue;
            throw e;
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error(t("nou.no_free_tables") || "No hi ha mesures lliures a cap sala.");
      } catch (e) {
        setError(e instanceof Error ? e.message : t("nou.unexpected_error"));
        startedRef.current = false;
      }
    })();
  }, [ready, hasName, deviceId, name, navigate]);

  if (!ready) return <Loading />;

  if (!hasName) {
    return (
      <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-md flex flex-col gap-5">
          <div className="flex items-center justify-between">
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
          <header className="text-center">
            <h1 className="font-title font-black italic text-gold text-3xl pr-2 text-center">{t("nou.create_online")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("nou.need_name_create")}</p>
          </header>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate("/ajustes")}
            className="border-primary/40"
          >
            <Settings className="w-4 h-4 mr-2" /> {t("nou.go_to_settings")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-8">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("nou.creating")}</p>
        {error && (
          <>
            <p className="text-xs text-destructive text-center max-w-xs">{error}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/")}>{t("common.back_home")}</Button>
          </>
        )}
      </div>
    </main>
  );
}

export default OnlineNouPage;