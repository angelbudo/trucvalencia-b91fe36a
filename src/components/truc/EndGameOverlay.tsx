import { Trophy, RotateCcw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TRUC_Z_INDEX } from "@/components/truc/layers";
import { type PlayerId, type TeamId, teamOf } from "@/game/types";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

export interface EndGameOverlayProps {
  open: boolean;
  /** Equip guanyador. Si no es proporciona, es calcula amb camesWon / jocFora. */
  winnerTeam: TeamId;
  /** Noms per seient (0..3). */
  playerNamesBySeat: Record<PlayerId, string>;
  /** Marcador de cames. */
  camesWon: { nos: number; ells: number };
  /** Si la victòria és per "joc fora" (per mostrar text alternatiu). */
  jocFora?: boolean;
  onNewGame: () => void;
  onAbandon: () => void;
}

/**
 * Finestra flotant que es mostra quan un equip guanya la partida.
 * Mostra el nom dels dos jugadors guanyadors amb el color del seu equip,
 * felicitacions i dos botons: "Nova partida" i "Abandonar".
 */
export function EndGameOverlay({
  open,
  winnerTeam,
  playerNamesBySeat,
  camesWon,
  jocFora,
  onNewGame,
  onAbandon,
}: EndGameOverlayProps) {
  const t = useT();

  // Seients de l'equip guanyador.
  const winnerSeats: PlayerId[] = ([0, 1, 2, 3] as PlayerId[]).filter(
    (p) => teamOf(p) === winnerTeam,
  );
  const teamColorClass =
    winnerTeam === "nos" ? "text-team-nos" : "text-team-ells";

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-xs w-[calc(100%-3rem)] rounded-2xl border-2 border-gold gold-glow gap-2 [&>button]:hidden"
        style={{ zIndex: TRUC_Z_INDEX.endGameOverlay }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-title font-black italic text-gold text-2xl text-center">
            {t("match.end.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 text-center -mt-10">
          <Trophy className="w-14 h-14 text-gold" />

          <p className="text-foreground text-base leading-snug">
            {t("match.end.team_made_by")}
          </p>

          <div className="flex flex-col items-center gap-1">
            {winnerSeats.map((seat, i) => (
              <span
                key={seat}
                className={cn(
                  "font-display font-extrabold text-2xl leading-tight",
                  teamColorClass,
                )}
              >
                {playerNamesBySeat[seat] ?? `Seient ${seat + 1}`}
                {i === 0 && winnerSeats.length > 1 ? (
                  <span className="text-foreground font-normal text-base px-1">
                    {" "}
                    {t("match.end.and")}{" "}
                  </span>
                ) : null}
              </span>
            ))}
          </div>

          <p className="text-foreground text-base">
            {t("match.end.has_won")}
          </p>

          <p className="font-display font-bold text-gold text-xl">
            {t("match.end.congrats")}
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            {jocFora
              ? t("match.joc_fora_excl")
              : t("match.cames_score", { nos: camesWon.nos, ells: camesWon.ells })}
          </p>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            onClick={onNewGame}
            className="justify-center h-auto min-h-[44px] py-2 text-[15px] bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold gold-glow"
          >
            <RotateCcw className="mr-2 shrink-0" />
            {t("match.end.new_match_btn")}
          </Button>
          <Button
            onClick={onAbandon}
            variant="destructive"
            className="justify-center h-auto min-h-[44px] py-2 text-[15px] font-display font-bold"
          >
            <LogOut className="mr-2 shrink-0" />
            {t("match.end.abandon_btn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}