import { memo } from "react";
import { Suit, Rank } from "@/game/types";
import { cn } from "@/lib/utils";

interface PlayingCardProps {
  suit?: Suit;
  rank?: Rank;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
  className?: string;
}

const SIZE = {
  sm: { w: 44, h: 64, fs: 12, sym: 18 },
  md: { w: 64, h: 92, fs: 16, sym: 26 },
  lg: { w: 84, h: 120, fs: 20, sym: 36 },
};

const SUIT_COLOR: Record<Suit, string> = {
  oros: "hsl(var(--suit-oros))",
  copes: "hsl(var(--suit-copes))",
  espases: "hsl(var(--suit-espases))",
  bastos: "hsl(var(--suit-bastos))",
};

const RANK_LABEL: Record<Rank, string> = {
  1: "AS", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
};

const FACE_BACKGROUND =
  "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(42 45% 98%) 55%, hsl(38 30% 88%) 100%)";

const BACK_BACKGROUND =
  "linear-gradient(135deg, hsl(28 40% 28%) 0%, hsl(25 35% 18%) 50%, hsl(22 40% 22%) 100%)";

function SuitGlyph({ suit, size }: { suit: Suit; size: number }) {
  const color = SUIT_COLOR[suit];
  const s = size;
  switch (suit) {
    case "oros":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill={color} stroke="hsl(38 70% 35%)" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="9" fill="none" stroke="hsl(38 70% 35%)" strokeWidth="1" />
          <text x="16" y="21" textAnchor="middle" fontSize="12" fill="hsl(38 70% 25%)" fontWeight="bold">★</text>
        </svg>
      );
    case "copes":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32">
          <path d="M8 6 Q8 18 16 20 Q24 18 24 6 Z" fill={color} stroke="hsl(8 70% 30%)" strokeWidth="1.5" />
          <rect x="14" y="20" width="4" height="6" fill={color} stroke="hsl(8 70% 30%)" strokeWidth="1.5" />
          <rect x="10" y="25" width="12" height="3" rx="1" fill={color} stroke="hsl(8 70% 30%)" strokeWidth="1.5" />
        </svg>
      );
    case "espases":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32">
          <line x1="16" y1="3" x2="16" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <line x1="10" y1="20" x2="22" y2="20" stroke={color} strokeWidth="2" />
          <circle cx="16" cy="25" r="3" fill={color} />
          <polygon points="16,3 14,7 18,7" fill={color} />
        </svg>
      );
    case "bastos":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32">
          {/* Garrot de cavernícola: mànec estret a dalt amb el final
              tallat en diagonal (estil Fournier), cap ample a baix */}
          <path
            d="M14 6.2 L13.6 10 Q14.1 14 12.3 19 Q10 25 10.5 27.5 Q11.5 30 16 30 Q20.5 30 21.5 27.5 Q22 25 19.7 19 Q17.9 14 18.1 10 L17.6 4 Z"
            fill={color}
            stroke="hsl(130 70% 18%)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Superfície del tall en diagonal (fusta interior, més clara) */}
          <path
            d="M14 6.2 L17.6 4 Q17.5 4.7 17.6 5.5 Q15.7 6.5 14.1 7.3 Q13.95 6.8 14 6.2 Z"
            fill="hsl(40 60% 78%)"
            stroke="hsl(130 70% 18%)"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          {/* Nusos / berrugues del garrot */}
          <circle cx="13" cy="22" r="1.4" fill="hsl(130 70% 18%)" opacity="0.55" />
          <circle cx="19" cy="25" r="1.6" fill="hsl(130 70% 18%)" opacity="0.55" />
          <circle cx="14.5" cy="27" r="1.1" fill="hsl(130 70% 18%)" opacity="0.55" />
        </svg>
      );
  }
}

function PlayingCardComponent({
  suit, rank, faceDown, size = "md", selected, playable, onClick, className,
}: PlayingCardProps) {
  const { w, h, fs, sym } = SIZE[size];

  if (faceDown || !suit || !rank) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded-card card-shadow relative overflow-hidden border-2 border-primary-deep/50 flex items-center justify-center",
          onClick && "cursor-pointer transition-transform hover:scale-105",
          className,
        )}
        style={{ width: w, height: h, background: BACK_BACKGROUND }}
      >
        <span className="text-primary/75 font-display text-xs tracking-widest -rotate-12">TRUC</span>
      </div>
    );
  }

  const color = SUIT_COLOR[suit];
  const strokeColor = suit === "oros" ? "transparent" : "#ffffff";

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-card card-shadow relative overflow-hidden border-2 transition-all",
        selected ? "border-primary -translate-y-3 card-shadow-hover" : "border-card-foreground/20",
        playable && onClick && "cursor-pointer hover:-translate-y-2 hover:card-shadow-hover",
        !playable && onClick && "cursor-pointer opacity-60",
        className
      )}
      style={{ width: w, height: h }}
    >
      <div className="absolute inset-0" style={{ background: FACE_BACKGROUND }} />
      <div className="absolute inset-[3px] rounded-[calc(var(--radius-card-token)-2px)] border border-card-foreground/15" />
      <div className="absolute top-1 left-1.5 z-10 flex flex-col items-center leading-none">
        <span
          style={{
            color,
            fontSize: fs,
            fontWeight: 800,
            WebkitTextStroke: `1px ${strokeColor}`,
            paintOrder: "stroke fill",
          }}
          className="font-display"
        >
          {RANK_LABEL[rank]}
        </span>
        <SuitGlyph suit={suit} size={fs} />
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <SuitGlyph suit={suit} size={sym} />
      </div>
      <div className="absolute bottom-1 right-1.5 z-10 flex flex-col items-center leading-none rotate-180">
        <span
          style={{
            color,
            fontSize: fs,
            fontWeight: 800,
            WebkitTextStroke: `1px ${strokeColor}`,
            paintOrder: "stroke fill",
          }}
          className="font-display"
        >
          {RANK_LABEL[rank]}
        </span>
        <SuitGlyph suit={suit} size={fs} />
      </div>
    </div>
  );
}

export const PlayingCard = memo(PlayingCardComponent);