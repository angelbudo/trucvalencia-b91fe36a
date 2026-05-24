import type React from "react";
import { ShoutKind } from "@/game/types";
import { cn } from "@/lib/utils";
import { TRUC_Z_INDEX } from "@/components/truc/layers";
import { translate } from "@/i18n/useT";


const KEY: Record<ShoutKind, string> = {
  envit: "shout.envit",
  renvit: "shout.renvit",
  "falta-envit": "shout.falta_envit",
  vull: "shout.vull_excl",
  "no-vull": "shout.no_vull",
  truc: "shout.truc",
  retruc: "shout.retruc",
  quatre: "shout.quatre",
  "joc-fora": "shout.joc_fora",
  passe: "shout.passe",
  "so-meues": "shout.so_meues",
};

function labelFor(what: ShoutKind): string {
  const base = translate(KEY[what]);
  // Add exclamation mark for shouts that traditionally end with one
  const needsExcl: ShoutKind[] = ["envit", "renvit", "falta-envit", "truc", "retruc", "quatre", "joc-fora"];
  if (needsExcl.includes(what) && !base.endsWith("!") && !base.endsWith("¡")) {
    return base + "!";
  }
  return base;
}

const LABEL = new Proxy({} as Record<ShoutKind, string>, {
  get: (_t, key: string) => labelFor(key as ShoutKind),
});

const STYLE: Record<ShoutKind, string> = {
  envit: "bg-accent text-accent-foreground border-accent/60",
  renvit: "bg-accent text-accent-foreground border-accent/60",
  "falta-envit": "bg-destructive text-destructive-foreground border-destructive/60",
  vull: "bg-primary text-primary-foreground border-primary/60",
  // "No vull" sense vora — petició explícita per a botó i bocadillo central.
  "no-vull": "bg-muted-foreground text-muted border-transparent",
  truc: "bg-secondary text-secondary-foreground border-secondary/60",
  retruc: "bg-secondary text-secondary-foreground border-secondary/60",
  quatre: "bg-secondary text-secondary-foreground border-secondary/60",
  "joc-fora": "bg-destructive text-destructive-foreground border-destructive/60",
  passe: "bg-muted text-muted-foreground border-border",
  "so-meues": "bg-muted text-muted-foreground border-border",
};

export function ShoutLabel({ what }: { what: ShoutKind }) {
  return LABEL[what];
}

interface ShoutButtonProps {
  what: ShoutKind;
  onClick: () => void;
  size?: "sm" | "md";
  labelOverride?: string;
  highlight?: boolean;
}

export function ShoutButton({ what, onClick, size = "md", labelOverride, highlight }: ShoutButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "font-display font-bold rounded-lg border-2 transition-all active:scale-95 shadow-md",
        size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
        STYLE[what],
        "hover:scale-105 hover:gold-glow",
        highlight && "animate-pulse-gold ring-2 ring-primary border-primary"
      )}
    >
      {labelOverride ?? LABEL[what]}
    </button>
  );
}

interface ShoutBubbleProps {
  what: ShoutKind;
  className?: string;
  labelOverride?: string;
  /** Direcció cap a on apunta la cua del bocadillo (qui ha cantat). */
  tailDirection?: "top" | "bottom" | "left" | "right";
  /** Estils inline addicionals (e.g. desplaçaments per a múltiples
   *  bocadillos al centre alhora). Es fusionen amb els defectes del
   *  component (z-index, etc.). */
  style?: React.CSSProperties;
}

export function ShoutBubble({ what, className, labelOverride, tailDirection, style }: ShoutBubbleProps) {
  const text = labelOverride ?? LABEL[what];
  // Per a "renvit" (Torne a envidar / ¡Vuelvo a envidar!) i "falta-envit"
  // (Envide la Falta / ¡Envido la Falta!) el cartel és massa llarg en una
  // sola línia, així que el partim en dues. La resta d'avisos es mantenen
  // en una línia única.
  const wrapTwoLines = !labelOverride && (what === "renvit" || what === "falta-envit");
  let content: React.ReactNode = text;
  if (wrapTwoLines) {
    const words = text.split(" ");
    const splitIdx = what === "renvit" ? 2 : 1;
    const first = words.slice(0, splitIdx).join(" ");
    const rest = words.slice(splitIdx).join(" ");
    if (rest) {
      content = (
        <>
          <span className="block">{first}</span>
          <span className="block">{rest}</span>
        </>
      );
    }
  }
  return (
    <div
      className={cn(
        "absolute pointer-events-none px-4 py-2 rounded-2xl",
        !tailDirection && "rounded-bl-sm",
        "font-display font-black text-lg border-2 animate-shout origin-bottom-left",
        wrapTwoLines && "text-center leading-tight",
        STYLE[what],
        className
      )}
      style={{ zIndex: TRUC_Z_INDEX.shout, ...style }}
    >
      {content}
      {tailDirection && <ShoutBubbleTail what={what} direction={tailDirection} />}
    </div>
  );
}

/**
 * Mapa de tokens de color per a la cua del bocadillo. Reflecteix les
 * mateixes parelles bg/border que `STYLE`, però en valors directes
 * perquè SVG no pot llegir classes Tailwind.
 */
const TAIL_COLORS: Record<ShoutKind, { fill: string; stroke: string }> = {
  envit:        { fill: "hsl(var(--accent))",      stroke: "hsl(var(--accent) / 0.6)" },
  renvit:       { fill: "hsl(var(--accent))",      stroke: "hsl(var(--accent) / 0.6)" },
  "falta-envit":{ fill: "hsl(var(--destructive))", stroke: "hsl(var(--destructive) / 0.6)" },
  vull:         { fill: "hsl(var(--primary))",     stroke: "hsl(var(--primary) / 0.6)" },
  "no-vull":    { fill: "hsl(var(--muted-foreground))", stroke: "transparent" },
  truc:         { fill: "hsl(var(--secondary))",   stroke: "hsl(var(--secondary) / 0.6)" },
  retruc:       { fill: "hsl(var(--secondary))",   stroke: "hsl(var(--secondary) / 0.6)" },
  quatre:       { fill: "hsl(var(--secondary))",   stroke: "hsl(var(--secondary) / 0.6)" },
  "joc-fora":   { fill: "hsl(var(--destructive))", stroke: "hsl(var(--destructive) / 0.6)" },
  passe:        { fill: "hsl(var(--muted))",       stroke: "hsl(var(--border))" },
  "so-meues":   { fill: "hsl(var(--muted))",       stroke: "hsl(var(--border))" },
};

/**
 * Cua del bocadillo dibuixada com a triangle isòsceles amb SVG.
 * La base reposa plana contra la vora del bocadillo i les dues vores
 * laterals són línies rectes que convergeixen en el vèrtex (el "tip").
 * El truc per ocultar la línia de vora del bocadillo just darrere la
 * base del triangle: dibuixem els dos costats laterals amb stroke i
 * deixem la base sense stroke (amb un petit solapament d'1px contra
 * el bocadillo).
 */
function ShoutBubbleTail({
  what,
  direction,
}: {
  what: ShoutKind;
  direction: "top" | "bottom" | "left" | "right";
}) {
  const BASE = 12;        // amplada de la base (mateix gruix visual que abans)
  const LENGTH = 18;      // longitud del triangle (tip ↔ base)
  const STROKE = 2;       // gruix de la vora (igual que `border-2`)
  const OVERLAP = 1;      // px que es solapen amb el bocadillo per amagar-ne la vora
  const { fill, stroke } = TAIL_COLORS[what];

  // Dibuixem sempre el triangle apuntant cap avall en coordenades SVG
  // (base a dalt, tip a baix). Després rotem/posicionem segons la direcció.
  const w = BASE;
  const h = LENGTH;
  // Dos costats laterals com a polyline oberta (sense la base):
  // (0,0) → (w/2, h) → (w,0). La base queda sense stroke.
  const points = `0,0 ${w / 2},${h} ${w},0`;

  // Posicionament i rotació del wrapper segons la direcció.
  // El wrapper té dimensions BASE × LENGTH amb la base "ancorada" a la
  // vora del bocadillo (amb -OVERLAP perquè no es vegi la línia darrere).
  const wrapperStyle: React.CSSProperties = (() => {
    switch (direction) {
      case "bottom":
        return {
          left: "50%", top: "100%",
          marginLeft: -BASE / 2, marginTop: -OVERLAP,
          width: BASE, height: LENGTH,
        };
      case "top":
        return {
          left: "50%", bottom: "100%",
          marginLeft: -BASE / 2, marginBottom: -OVERLAP,
          width: BASE, height: LENGTH,
          transform: "rotate(180deg)",
        };
      case "right":
        return {
          top: "50%", left: "100%",
          marginTop: -BASE / 2, marginLeft: -OVERLAP,
          width: LENGTH, height: BASE,
          transform: "rotate(-90deg)", transformOrigin: "0 50%",
          // After rotate(-90deg) around left-center the rendered box
          // moves; compensate with translate so it sits to the right.
        };
      case "left":
        return {
          top: "50%", right: "100%",
          marginTop: -BASE / 2, marginRight: -OVERLAP,
          width: LENGTH, height: BASE,
          transform: "rotate(90deg)", transformOrigin: "100% 50%",
        };
    }
  })();

  // Per simplicitat i robustesa visual (evitar problemes de transform
  // origin amb left/right), usem sempre orientació vertical i ajustem
  // amb rotacions de 90/180/270.
  const isHorizontal = direction === "left" || direction === "right";
  const svgWidth = isHorizontal ? LENGTH : BASE;
  const svgHeight = isHorizontal ? BASE : LENGTH;

  // Reescrivim wrapperStyle de manera més senzilla: fixem la mida del
  // wrapper i deixem que el SVG dibuixi el triangle amb l'orientació
  // correcta directament (sense rotacions CSS).
  const simpleWrapperStyle: React.CSSProperties = (() => {
    switch (direction) {
      case "bottom":
        return { left: "50%", top: "100%", marginLeft: -BASE / 2, marginTop: -OVERLAP };
      case "top":
        return { left: "50%", bottom: "100%", marginLeft: -BASE / 2, marginBottom: -OVERLAP };
      case "right":
        return { top: "50%", left: "100%", marginTop: -BASE / 2, marginLeft: -OVERLAP };
      case "left":
        return { top: "50%", right: "100%", marginTop: -BASE / 2, marginRight: -OVERLAP };
    }
  })();

  // Punts del triangle segons direcció (sempre base contra el bocadillo,
  // tip apuntant en la direcció demanada).
  const trianglePoints = (() => {
    switch (direction) {
      case "bottom": return `0,0 ${BASE},0 ${BASE / 2},${LENGTH}`;
      case "top":    return `0,${LENGTH} ${BASE},${LENGTH} ${BASE / 2},0`;
      case "right":  return `0,0 0,${BASE} ${LENGTH},${BASE / 2}`;
      case "left":   return `${LENGTH},0 ${LENGTH},${BASE} 0,${BASE / 2}`;
    }
  })();

  // Polyline dels dos costats laterals (sense la base), per pintar
  // només les dues línies rectes que convergeixen al tip.
  const sidesPoints = (() => {
    switch (direction) {
      case "bottom": return `0,0 ${BASE / 2},${LENGTH} ${BASE},0`;
      case "top":    return `0,${LENGTH} ${BASE / 2},0 ${BASE},${LENGTH}`;
      case "right":  return `0,0 ${LENGTH},${BASE / 2} 0,${BASE}`;
      case "left":   return `${LENGTH},0 0,${BASE / 2} ${LENGTH},${BASE}`;
    }
  })();

  void wrapperStyle; void points; void w; void h; void svgWidth; void svgHeight;

  return (
    <span
      className="absolute pointer-events-none block"
      style={{ ...simpleWrapperStyle, width: isHorizontal ? LENGTH : BASE, height: isHorizontal ? BASE : LENGTH }}
      aria-hidden
    >
      <svg
        width={isHorizontal ? LENGTH : BASE}
        height={isHorizontal ? BASE : LENGTH}
        viewBox={`0 0 ${isHorizontal ? LENGTH : BASE} ${isHorizontal ? BASE : LENGTH}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Farciment del triangle (mateix color de fons que el bocadillo). */}
        <polygon points={trianglePoints} fill={fill} stroke="none" />
        {/* Dues vores laterals rectes des de la base fins al tip. */}
        <polyline
          points={sidesPoints}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinejoin="miter"
          strokeLinecap="butt"
        />
      </svg>
    </span>
  );
}



interface ShoutBadgeProps {
  what: ShoutKind;
  className?: string;
  labelOverride?: string;
  /** Si està a true, no anima el pulse daurat (usat quan ja s'ha respost al cant). */
  quiet?: boolean;
}

export function ShoutBadge({ what, className, labelOverride, quiet }: ShoutBadgeProps) {
  return (
    <div
      className={cn(
        "pointer-events-none px-2 py-0.5 rounded-md",
        "font-display font-bold text-[10px] uppercase tracking-wider border shadow-md",
        !quiet && "animate-pulse-gold",
        STYLE[what],
        className
      )}
      style={{ zIndex: TRUC_Z_INDEX.shout }}
    >
      {labelOverride ?? LABEL[what]}
    </div>
  );
}