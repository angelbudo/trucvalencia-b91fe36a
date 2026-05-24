import { MatchState, PlayerId, nextPlayer, teamOf } from "@/game/types";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import { PresenceDot } from "@/online/PresenceDot";
import type { PresenceStatus } from "@/online/presence";
import { useT } from "@/i18n/useT";

const POSITION_KEY: Record<PlayerId, string> = {
  0: "common.you",
  1: "seat.right_rival",
  2: "common.partner",
  3: "seat.left_rival",
};

interface PlayerSeatProps {
  player: PlayerId;
  match: MatchState;
  position: "bottom" | "top" | "left" | "right";
  name?: string;
  cardCount?: number;
  isPendingResponder?: boolean;
  /** Estat de presència (online/away/offline) per a l'indicador. Si és
   *  `null`/`undefined`, no es mostra cap punt (típicament per a bots o
   *  partides offline). */
  presence?: PresenceStatus | null;
  /** Timestamp ISO del darrer heartbeat (per al tooltip "fa Xs"). */
  presenceLastSeen?: string | null;
  /** URL de la imatge d'avatar del jugador (només humans). Si està definida,
   *  es mostra en lloc del cercle de color amb la inicial. */
  avatarUrl?: string | null;
}

export function PlayerSeat({
  player,
  match,
  position,
  name,
  isPendingResponder,
  presence,
  presenceLastSeen,
  avatarUrl,
}: PlayerSeatProps) {
  const t = useT();
  const isTurn = match.round.turn === player;
  const team = teamOf(player);
  const cards = match.round.hands[player].length;
  const isMa = nextPlayer(match.dealer) === player;
  // Posició de l'icona "mà" relativa al seient visual:
  //   - seient `right` (jugador que tira DESPRÉS del nostre)  → icona a l'ESQUERRA
  //   - seient `left`  (jugador que tira ABANS del nostre)    → icona a la DRETA
  //   - seients `bottom` (nosaltres) i `top` (company)         → icona a la DRETA
  // Aquesta regla es basa en `position` (no en l'id del seient) per a que
  // siga correcta des de qualsevol perspectiva en partides online.
  const maIconSide: "left" | "right" = position === "right" ? "left" : "right";
  const maIcon = isMa ? (
    <span
      className={cn(
        "absolute top-1/2 -translate-y-1/2 text-base leading-none pointer-events-none z-20",
        maIconSide === "left"
          ? "right-full translate-x-[10px]"
          : "left-full -translate-x-[10px]",
      )}
      aria-label="Mà"
      role="img"
    >
      ✋
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-all",
        "bg-background/70 backdrop-blur-sm",
        team === "nos" ? "border-team-nos/50" : "border-team-ells/50",
        isTurn && "animate-pulse-gold border-primary",
        isPendingResponder && "border-primary ring-2 ring-primary/60 shadow-[0_0_18px_hsl(var(--primary)/0.55)]",
        position === "left" && "flex-col gap-0.5 px-2 py-2",
        position === "right" && "flex-col gap-0.5 px-2 py-2",
        // Atenuació visual quan el jugador no està en línia.
        presence === "offline" && "opacity-60",
      )}
    >
      {maIcon}
      {isPendingResponder && (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md animate-bounce z-10"
          title="Pendent de respondre"
          aria-label="Pendent de respondre"
        >
          <HelpCircle className="w-4 h-4" strokeWidth={2.5} />
        </div>
      )}
      <div
        className={cn(
          "relative w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm overflow-hidden border-2",
          team === "nos" ? "border-team-nos" : "border-team-ells",
          avatarUrl ? "bg-background/30" : team === "nos" ? "bg-team-nos text-white" : "bg-team-ells text-white",
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          (name ?? t(POSITION_KEY[player]))[0]
        )}
        {presence && (
          <PresenceDot
            status={presence}
            lastSeen={presenceLastSeen ?? null}
            size={10}
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>
      <div className="flex flex-col items-start min-w-0">
        <span className="text-xs font-semibold text-foreground truncate max-w-[90px]">
          {name ?? t(POSITION_KEY[player])}
        </span>
        <span className="text-[10px] text-muted-foreground">{cards} {t("seat.cards")}</span>
      </div>
    </div>
  );
}