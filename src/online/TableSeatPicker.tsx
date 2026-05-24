import { Bot, User, UserPlus, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayerId } from "@/game/types";
import type { SeatKind } from "./types";
import { PresenceDot } from "./PresenceDot";
import { getPresenceStatus, type PresenceStatus } from "./presence";
import { useT } from "@/i18n/useT";

/**
 * Vista d'una taula ovalada amb 4 muñequitos al voltant per triar
 * seient (estil Messenger). Sud i Nord queden enfrontats; Oest i Est
 * són els companys creuats.
 */

export type SeatOccupant =
  | { kind: "me"; name: string }
  | {
      kind: "human";
      name: string;
      online?: boolean;
      /** Timestamp ISO del darrer heartbeat — permet derivar away/offline. */
      lastSeen?: string | null;
    }
  | { kind: "bot" }
  | { kind: "empty" };

export interface SeatInfo {
  seat: PlayerId;
  kind: SeatKind;
  occupant: SeatOccupant;
  /** Si és l'amfitrió (s'hi pinta una corona). */
  isHost?: boolean;
  /** Es pot clicar per accionar la callback (triar / alternar). */
  selectable?: boolean;
}

interface TableSeatPickerProps {
  seats: SeatInfo[]; // exactament 4, indexats per PlayerId
  onSeatClick?: (seat: PlayerId) => void;
  /** Marca el seient amb halo de "el teu". */
  highlightSeat?: PlayerId | null;
  /** Mostra etiquetes de teams (Nosaltres / Ells) sota cada seient. */
  showTeams?: boolean;
}

// Mapatge de seient lògic (0 sud, 1 oest, 2 nord, 3 est) a posició a la mesa.
// Volem 2 enfrontats (sud-nord) i 2 creuats als laterals (oest-est),
// igual que la taula real de la partida.
const POSITION_CLASSES: Record<PlayerId, string> = {
  0: "absolute left-1/2 -translate-x-1/2 bottom-0",
  1: "absolute left-0 top-1/2 -translate-y-1/2",
  2: "absolute left-1/2 -translate-x-1/2 top-0",
  3: "absolute right-0 top-1/2 -translate-y-1/2",
};

const TEAM_LABEL: Record<PlayerId, string> = {
  0: "Nosaltres",
  1: "Ells",
  2: "Nosaltres",
  3: "Ells",
};

export function TableSeatPicker({
  seats,
  onSeatClick,
  highlightSeat = null,
  showTeams = true,
}: TableSeatPickerProps) {
  return (
    <div className="relative w-full aspect-[4/3] max-w-sm mx-auto">
      {/* Taula ovalada */}
      <div className="absolute inset-x-[18%] inset-y-[22%] rounded-[50%] wood-surface border-2 border-primary/40 card-shadow" />
      <div className="absolute inset-x-[24%] inset-y-[28%] rounded-[50%] felt-surface border border-primary/25 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display font-black italic text-primary/25 text-2xl uppercase tracking-widest select-none">
            Truc
          </span>
        </div>
      </div>

      {/* Seients */}
      {seats.map((s) => (
        <SeatBubble
          key={s.seat}
          info={s}
          highlighted={highlightSeat === s.seat}
          onClick={s.selectable ? () => onSeatClick?.(s.seat) : undefined}
          showTeam={showTeams}
        />
      ))}
    </div>
  );
}

function SeatBubble({
  info,
  highlighted,
  onClick,
  showTeam,
}: {
  info: SeatInfo;
  highlighted: boolean;
  onClick?: () => void;
  showTeam: boolean;
}) {
  const { occupant, seat } = info;
  const team = seat % 2 === 0 ? "nos" : "ells";

  const ring =
    occupant.kind === "me"
      ? "border-primary bg-primary/20 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.45)]"
      : occupant.kind === "human"
        ? "border-team-nos/70 bg-team-nos/15 text-team-nos"
        : occupant.kind === "bot"
          ? "border-primary/40 bg-background/60 text-foreground/80"
          : "border-dashed border-primary/40 bg-background/30 text-muted-foreground";

  const Icon =
    occupant.kind === "bot"
      ? Bot
      : occupant.kind === "empty"
        ? UserPlus
        : User;

  const t = useT();
  const label =
    occupant.kind === "me"
      ? `${occupant.name} ${t("seat.me_suffix")}`
      : occupant.kind === "human"
        ? occupant.name
        : occupant.kind === "bot"
          ? t("seat.bot")
          : t("seat.free");

  const Tag = onClick ? "button" : "div";

  // Estat de presència derivat (només per a humans amb dades de seguiment).
  let presence: PresenceStatus | null = null;
  let presenceLastSeen: string | null = null;
  if (occupant.kind === "human") {
    const isOnline = occupant.online !== false;
    presenceLastSeen = occupant.lastSeen ?? null;
    presence = getPresenceStatus(isOnline, presenceLastSeen);
  } else if (occupant.kind === "me") {
    presence = "online";
  }

  return (
    <div className={cn(POSITION_CLASSES[seat], "flex flex-col items-center gap-1")}>
      <Tag
        type={onClick ? "button" : undefined}
        onClick={onClick}
        disabled={onClick ? false : undefined}
        className={cn(
          "relative w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all",
          ring,
          highlighted && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
          onClick && "hover:scale-105 hover:border-primary cursor-pointer active:scale-95",
          !onClick && "cursor-default",
          // Atenuació visual quan el jugador no està en línia.
          presence === "offline" && "opacity-50 grayscale",
          presence === "away" && "opacity-80",
        )}
        aria-label={t("seat.aria", { n: seat, label })}
      >
        <Icon className="w-7 h-7" strokeWidth={2.2} />
        {info.isHost && (
          <Crown
            className="absolute -top-2 -right-2 w-4 h-4 drop-shadow"
            style={{ color: "hsl(45 90% 60%)", fill: "hsl(45 90% 60%)" }}
          />
        )}
        {presence && (
          <PresenceDot
            status={presence}
            lastSeen={presenceLastSeen}
            size={12}
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </Tag>
      <span
        className={cn(
          "text-[11px] font-display font-bold leading-tight max-w-[88px] text-center truncate",
          occupant.kind === "me" && "text-primary",
          occupant.kind === "human" && "text-team-nos",
          occupant.kind === "bot" && "text-foreground/80",
          occupant.kind === "empty" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {showTeam && (
        <span
          className={cn(
            "text-[8px] uppercase tracking-widest leading-none",
            team === "nos" ? "text-team-nos/80" : "text-team-ells/80",
          )}
        >
          {team === "nos" ? t("common.us") : t("common.them")}
        </span>
      )}
    </div>
  );
}