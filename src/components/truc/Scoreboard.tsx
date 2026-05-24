import { useEffect, useRef, useState } from "react";
import { MatchState, RoundSummary, TeamId } from "@/game/types";
import { cn } from "@/lib/utils";
import { logSequence } from "@/game/sequenceLog";
import { translate, useT } from "@/i18n/useT";

const POINT_TOAST_DURATION_MS = 3000;

export type ToastKind =
  // Envit guanyat (querit)
  | "envit" | "renvit" | "falta-envit"
  // Envit no querit
  | "envit-nq" | "renvit-nq" | "falta-envit-nq"
  // Truc guanyat (querit)
  | "truc" | "retruc" | "quatre" | "joc-fora"
  // Truc no querit
  | "truc-nq" | "retruc-nq" | "quatre-nq" | "joc-fora-nq";

export interface PointToast {
  id: string | number;
  team: TeamId;
  points: number;
  label: string;
  kind: ToastKind;
}

let toastIdCounter = 0;
export function nextToastId() { return ++toastIdCounter; }

const TOAST_KEY: Record<ToastKind, string> = {
  envit: "toast.envit",
  renvit: "toast.renvit",
  "falta-envit": "toast.falta_envit",
  "envit-nq": "toast.envit_nq",
  "renvit-nq": "toast.renvit_nq",
  "falta-envit-nq": "toast.falta_envit_nq",
  truc: "toast.truc",
  retruc: "toast.retruc",
  quatre: "toast.quatre",
  "joc-fora": "toast.joc_fora",
  "truc-nq": "toast.truc_nq",
  "retruc-nq": "toast.retruc_nq",
  "quatre-nq": "toast.quatre_nq",
  "joc-fora-nq": "toast.joc_fora_nq",
};

export const TOAST_LABEL = new Proxy({} as Record<ToastKind, string>, {
  get: (_t, key: string) => translate(TOAST_KEY[key as ToastKind]),
});

// Estils inspirats en ShoutBubble: fons saturats, vora gruixuda i animació shout.
export const TOAST_STYLE: Record<ToastKind, string> = {
  envit: "bg-accent text-accent-foreground border-accent",
  renvit: "bg-accent text-accent-foreground border-accent",
  "falta-envit": "bg-destructive text-destructive-foreground border-destructive",
  "envit-nq": "bg-accent/70 text-accent-foreground border-accent/80 border-dashed",
  "renvit-nq": "bg-accent/70 text-accent-foreground border-accent/80 border-dashed",
  "falta-envit-nq": "bg-destructive/70 text-destructive-foreground border-destructive/80 border-dashed",
  truc: "bg-secondary text-secondary-foreground border-secondary",
  retruc: "bg-secondary text-secondary-foreground border-secondary",
  quatre: "bg-secondary text-secondary-foreground border-secondary",
  "joc-fora": "bg-destructive text-destructive-foreground border-destructive",
  "truc-nq": "bg-secondary/70 text-secondary-foreground border-secondary/80 border-dashed",
  "retruc-nq": "bg-secondary/70 text-secondary-foreground border-secondary/80 border-dashed",
  "quatre-nq": "bg-secondary/70 text-secondary-foreground border-secondary/80 border-dashed",
  "joc-fora-nq": "bg-destructive/70 text-destructive-foreground border-destructive/80 border-dashed",
};

export function toastFamily(kind: ToastKind): "envit" | "truc" {
  return kind.includes("envit") ? "envit" : "truc";
}

export function pointToastKey(roundIndex: number, toast: Pick<PointToast, "kind">): string {
  return `${roundIndex}-${toastFamily(toast.kind)}`;
}

function envitKind(level: 2 | 4 | "falta" | undefined, rejected: boolean): ToastKind {
  if (level === 4) return rejected ? "renvit-nq" : "renvit";
  if (level === "falta") return rejected ? "falta-envit-nq" : "falta-envit";
  return rejected ? "envit-nq" : "envit";
}

function trucKind(level: 0 | 2 | 3 | 4 | 24 | undefined, rejected: boolean): ToastKind {
  if (level === 24) return rejected ? "joc-fora-nq" : "joc-fora";
  if (level === 4) return rejected ? "quatre-nq" : "quatre";
  if (level === 3) return rejected ? "retruc-nq" : "retruc";
  if (level === 2) return rejected ? "truc-nq" : "truc";
  // Sense cant: 1 punt "natural"
  return "truc";
}

export function buildToastsFromSummary(summary: RoundSummary): Omit<PointToast, "id">[] {
  const out: Omit<PointToast, "id">[] = [];
  const addToast = (toast: Omit<PointToast, "id">) => {
    const family = toastFamily(toast.kind);
    if (out.some((existing) => toastFamily(existing.kind) === family)) return;
    out.push(toast);
  };
  if (summary.envitWinner && summary.envitPoints > 0) {
    const kind = envitKind(summary.envitLevel, !!summary.envitRejected);
    addToast({
      team: summary.envitWinner,
      points: summary.envitPoints,
      label: TOAST_LABEL[kind],
      kind,
    });
  }
  if (summary.trucWinner && summary.trucPoints > 0) {
    // Sempre mostrem cartell del truc al final de la mà, hi haja hagut cant
    // o no (punt natural). Si no hi va haver cant, usem el "truc" base com
    // a etiqueta amb el text "+1 Truc" perquè es vegen els punts sumats.
    const kind = trucKind(summary.trucLevel ?? 2, !!summary.trucRejected);
    addToast({
      team: summary.trucWinner,
      points: summary.trucPoints,
      label: TOAST_LABEL[kind],
      kind,
    });
  }
  return out;
}

type ScoreSnapshot = Pick<MatchState, "scores" | "camesWon" | "targetCama" | "targetCames">;

export function normalizedScoreDisplay(males: number, bones: number, target: number) {
  const safeTarget = Math.max(1, target);
  const safeMales = Math.max(0, males);
  const safeBones = Math.max(0, bones);
  const inBones = safeMales >= safeTarget;
  return {
    inBones,
    displayValue: inBones ? Math.min(safeBones, safeTarget) : Math.min(safeMales, safeTarget),
    stateLabel: inBones ? translate("match.bones") : translate("match.males"),
  };
}

function snapshotScores(match: MatchState): ScoreSnapshot {
  return {
    scores: {
      nos: { ...match.scores.nos },
      ells: { ...match.scores.ells },
    },
    camesWon: { ...match.camesWon },
    targetCama: match.targetCama,
    targetCames: match.targetCames,
  };
}

function crossedToBones(prev: ScoreSnapshot, next: ScoreSnapshot, team: TeamId): boolean {
  const target = Math.max(1, next.targetCama);
  return prev.scores[team].males < target && next.scores[team].males >= target;
}

export function Scoreboard({ match }: { match: MatchState }) {
  const t = useT();
  const [toasts, setToasts] = useState<PointToast[]>([]);
  const [bonesToasts, setBonesToasts] = useState<Record<TeamId, boolean>>({ nos: false, ells: false });
  const [bonesPulseKeys, setBonesPulseKeys] = useState<Record<TeamId, number>>({ nos: 0, ells: 0 });
  const [displayed, setDisplayed] = useState<ScoreSnapshot>(() => snapshotScores(match));
  const displayedRef = useRef<ScoreSnapshot>(displayed);
  const bonesToastKeysRef = useRef<Set<string>>(new Set());
  const lastHistoryLenRef = useRef(match.history.length);
  const lockActiveRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const commitDisplayed = (next: ScoreSnapshot) => {
    const prev = displayedRef.current;
    if (
      prev.scores.nos.males === next.scores.nos.males &&
      prev.scores.nos.bones === next.scores.nos.bones &&
      prev.scores.ells.males === next.scores.ells.males &&
      prev.scores.ells.bones === next.scores.ells.bones &&
      prev.camesWon.nos === next.camesWon.nos &&
      prev.camesWon.ells === next.camesWon.ells &&
      prev.targetCama === next.targetCama
    ) {
      return; // No-op: evita re-render innecessari del marcador.
    }
    displayedRef.current = next;
    setDisplayed(next);
  };

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  useEffect(() => {
    const prevLen = lastHistoryLenRef.current;
    const curLen = match.history.length;
    if (curLen <= prevLen) {
      lastHistoryLenRef.current = curLen;
      if (curLen < prevLen) bonesToastKeysRef.current.clear();
      if (!lockActiveRef.current) commitDisplayed(snapshotScores(match));
      return;
    }
    const newSummaries = match.history.slice(prevLen);
    lastHistoryLenRef.current = curLen;

    const incoming: PointToast[] = [];
    const incomingFamilies = new Set<"envit" | "truc">();
    newSummaries.forEach((s, offset) => {
      const roundIndex = prevLen + offset;
      for (const t of buildToastsFromSummary(s)) {
        const id = pointToastKey(roundIndex, t);
        const family = toastFamily(t.kind);
        if (!incomingFamilies.has(family) && !incoming.some((existing) => existing.id === id)) {
          incomingFamilies.add(family);
          incoming.push({ id, ...t });
        }
      }
    });
    if (incoming.length === 0) {
      commitDisplayed(snapshotScores(match));
      return;
    }

    const nextDisplayed = snapshotScores(match);
    const prevDisplayed = displayedRef.current;
    clearTimers();
    lockActiveRef.current = true;
    setToasts([]);
    setBonesToasts({ nos: false, ells: false });

    // Calcula el retard inicial abans d'engegar la seqüència de cartells:
    // - 3000 ms de cartes quietes a la mesa.
    // - +3000 ms si l'envit ha estat acceptat (per a la revelació visual).
    // Després d'aquest offset, mostrem TOTS els cartells alhora i commitejem
    // el marcador SIMULTÀNIAMENT, just abans que comence la recollida.
    const lastSummary = newSummaries[newSummaries.length - 1];
    const envitRevealed =
      !!lastSummary &&
      !!lastSummary.envitWinner &&
      !lastSummary.envitRejected &&
      (lastSummary.envitPoints ?? 0) > 0;
    const PRE_REVEAL_HOLD_MS = 3000;
    const ENVIT_REVEAL_HOLD_MS = envitRevealed ? 3000 : 0;
    const initialOffsetMs = PRE_REVEAL_HOLD_MS + ENVIT_REVEAL_HOLD_MS;

    // Mostra TOTS els cartells (envit i/o truc) alhora i commiteja el
    // marcador en el mateix instant. Així el jugador veu el cartell aparéixer
    // i el número canviar exactament al mateix temps, just abans de la
    // recollida de cartes.
    const showTimer = window.setTimeout(() => {
      // Calculem totes les dades abans dels setStates perquè React 18
      // els batchegi en un sol commit (suma de punts + cartells +
      // ressalt de bones, tot al mateix frame). Després forcem una
      // pintura amb requestAnimationFrame perquè el navegador presente
      // el canvi abans de qualsevol treball pesat posterior (recollida).
      logSequence("scoreboard:toast-show", { count: incoming.length });
      const crossedTeams = (["nos", "ells"] as TeamId[]).filter((team) => {
        const key = `${team}-${nextDisplayed.camesWon[team]}-${nextDisplayed.targetCama}`;
        if (bonesToastKeysRef.current.has(key)) return false;
        if (!crossedToBones(prevDisplayed, nextDisplayed, team)) return false;
        bonesToastKeysRef.current.add(key);
        return true;
      });
      const hasCrossed = crossedTeams.length > 0;
      logSequence("scoreboard:score-commit", {
        nos: nextDisplayed.scores.nos,
        ells: nextDisplayed.scores.ells,
      });
      // Tots els setStates en seqüència → React 18 els batcheja.
      setToasts(incoming);
      if (hasCrossed) {
        setBonesToasts({
          nos: crossedTeams.includes("nos"),
          ells: crossedTeams.includes("ells"),
        });
        setBonesPulseKeys((prev) => ({
          nos: crossedTeams.includes("nos") ? prev.nos + 1 : prev.nos,
          ells: crossedTeams.includes("ells") ? prev.ells + 1 : prev.ells,
        }));
      }
      commitDisplayed(nextDisplayed);
    }, initialOffsetMs) as unknown as number;
    timersRef.current.push(showTimer);

    const finishTimer = window.setTimeout(() => {
      setToasts([]);
      setBonesToasts((prev) =>
        prev.nos || prev.ells ? { nos: false, ells: false } : prev,
      );
      lockActiveRef.current = false;
    }, initialOffsetMs + POINT_TOAST_DURATION_MS) as unknown as number;
    timersRef.current.push(finishTimer);

    return clearTimers;
  }, [match.history.length]);

  const { scores, camesWon, targetCama, targetCames } = displayed;

  const toastsByTeam: Record<TeamId, PointToast[]> = {
    nos: toasts.filter((t) => t.team === "nos"),
    ells: toasts.filter((t) => t.team === "ells"),
  };

  return (
    <div className="inline-flex items-stretch gap-0 px-3 py-2 rounded-xl wood-surface border-2 border-primary-deep/40 card-shadow">
      <ScoreCol
        label={t("common.us")}
        males={scores.nos.males}
        bones={scores.nos.bones}
        target={targetCama}
        team="nos"
        toasts={toastsByTeam.nos}
        showBonesToast={bonesToasts.nos}
        bonesPulseKey={bonesPulseKeys.nos}
      />
      <CamesCol
        nosWon={camesWon.nos}
        ellsWon={camesWon.ells}
        target={targetCames}
      />
      <ScoreCol
        label={t("common.them")}
        males={scores.ells.males}
        bones={scores.ells.bones}
        target={targetCama}
        team="ells"
        toasts={toastsByTeam.ells}
        showBonesToast={bonesToasts.ells}
        bonesPulseKey={bonesPulseKeys.ells}
      />
    </div>
  );
}

/** Columna central CAMES amb la mateixa estructura de 3 files que ScoreCol
 *  per garantir que les tipografies i alçades queden alineades. */
function CamesCol({
  nosWon, ellsWon, target,
}: { nosWon: number; ellsWon: number; target: number }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-between px-2 py-0">
      {/* Fila 1 */}
      <span className="text-[10px] font-display tracking-widest uppercase leading-none invisible">
        ·
      </span>
      <div className="flex items-center justify-center gap-1.5 leading-none">
        <Dots won={nosWon} target={target} team="nos" />
        <span
          className="text-[10px] text-primary/70 font-display tracking-widest leading-none"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {t("match.cames")}
        </span>
        <Dots won={ellsWon} target={target} team="ells" />
      </div>
      <span className="text-[9px] font-display tracking-widest uppercase mt-0.5 leading-none invisible">
        ·
      </span>
    </div>
  );
}

function Dots({ won, target, team }: { won: number; target: number; team: "nos" | "ells" }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: target }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full border",
            i < won
              ? team === "nos" ? "bg-team-nos border-team-nos" : "bg-team-ells border-team-ells"
              : "border-primary/40",
          )}
        />
      ))}
    </div>
  );
}

function ScoreCol({
  label, males, bones, target, team, toasts, showBonesToast, bonesPulseKey,
}: {
  label: string;
  males: number;
  bones: number;
  target: number;
  team: "nos" | "ells";
  toasts: PointToast[];
  showBonesToast: boolean;
  bonesPulseKey: number;
}) {
  const { inBones, displayValue, stateLabel } = normalizedScoreDisplay(males, bones, target);

  const prevInBones = useRef(inBones);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if ((!prevInBones.current && inBones) || bonesPulseKey > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 900);
      prevInBones.current = inBones;
      return () => clearTimeout(t);
    }
    prevInBones.current = inBones;
  }, [inBones, bonesPulseKey]);

  return (
    <div className="relative flex flex-col items-center justify-between w-[88px]">
      {/* Cartells flotants tipus crit (envit/truc) sobre el marcador */}
      <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center gap-1.5 z-30">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "px-3 py-1.5 rounded-2xl rounded-bl-sm whitespace-nowrap",
              "font-display font-black text-xs border-2 shadow-lg",
              "animate-shout origin-bottom",
              TOAST_STYLE[t.kind],
            )}
          >
            <span className="mr-1 text-sm">+{t.points}</span>
            <span className="uppercase tracking-wider">{t.label}</span>
          </div>
        ))}
        {showBonesToast && (
          <div
            className={cn(
              "px-3 py-1.5 rounded-2xl rounded-bl-sm whitespace-nowrap",
              "font-display font-black text-xs border-2 shadow-lg",
              "animate-shout origin-bottom bg-primary text-primary-foreground border-primary",
            )}
          >
            <span className="uppercase tracking-wider">{translate("match.bones")}</span>
          </div>
        )}
      </div>

      {/* Fila 1: nom equip */}
      <span
        className={cn(
          "text-[10px] font-display tracking-widest uppercase leading-none",
          team === "nos" ? "text-team-nos" : "text-team-ells",
        )}
      >
        {label}
      </span>
      {/* Fila 2: número */}
      <div className={cn("flex items-baseline justify-center gap-1 leading-none", pulse && "animate-bones-pulse")}>
        <span
          className={cn(
            "text-xl font-display font-bold leading-none transition-colors duration-500",
            inBones ? "text-primary" : "text-gold",
          )}
        >
          {displayValue}
          <span className="text-[9px] text-muted-foreground ml-0.5">/{target}</span>
        </span>
      </div>
      {/* Fila 3: estat MALES/BONES */}
      <span
        className={cn(
          "text-[9px] font-display tracking-widest uppercase mt-0.5 leading-none transition-colors duration-500",
          inBones ? "text-primary/80" : "text-muted-foreground",
        )}
      >
        {stateLabel}
      </span>
    </div>
  );
}