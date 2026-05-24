import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/truc/PlayingCard";
import { TableSurface } from "@/components/truc/TableSurface";
import { PlayerSeat } from "@/components/truc/PlayerSeat";
import { ShoutBubble, ShoutBadge, ShoutButton } from "@/components/truc/ShoutButton";
import { ChatPanel, ChatBubble } from "@/components/truc/ChatPanel";
import { DealAnimation } from "@/components/truc/DealAnimation";
import { CollectAnimation, type CollectedCard } from "@/components/truc/CollectAnimation";
import { PassDeckAnimation } from "@/components/truc/PassDeckAnimation";
import { EnvitReveal } from "@/components/truc/EnvitReveal";
import { EndGameOverlay } from "@/components/truc/EndGameOverlay";
import { useFreezeSubtreeAnimations } from "@/components/truc/useFreezeSubtreeAnimations";

import { startSequence, logSequence, endSequence } from "@/game/sequenceLog";
import {
  Action,
  MatchState,
  PlayerId,
  Rank,
  ShoutKind,
  Suit,
  TeamId,
  Trick,
  teamOf,
  partnerOf,
} from "@/game/types";
import {
  buildToastsFromSummary,
  pointToastKey,
  TOAST_STYLE,
  type PointToast,
} from "@/components/truc/Scoreboard";
import { bestEnvit, cardStrength, playerTotalEnvit, RANK_NAME, SUIT_NAME, SUIT_SYMBOL } from "@/game/deck";
import { botDecide } from "@/game/bot";
import { isCamaMatchPoint } from "@/game/engine";
import { selectHandsView } from "@/game/handsViewSelector";
import { toast } from "sonner";
import { ChatMessage, ChatPhraseId, PHRASES } from "@/game/phrases";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trophy,
  RotateCcw,
  Volume2,
  VolumeOff,
  LogOut,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/online/presence";
import { TRUC_Z_INDEX } from "@/components/truc/layers";
import { useT, translate, getLanguage } from "@/i18n/useT";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const gameTopButtonBaseClass =
  "h-8 w-8 p-0 hover:!bg-transparent active:!bg-transparent focus:!bg-transparent focus-visible:!bg-transparent focus-visible:!ring-0 focus-visible:!ring-offset-0";
const gameTopButtonPrimaryClass =
  "border-primary/60 text-primary hover:!text-primary active:!text-primary focus:!text-primary focus-visible:!text-primary";
const gameTopButtonDestructiveClass =
  "border-destructive/60 text-destructive hover:!text-destructive active:!text-destructive focus:!text-destructive focus-visible:!text-destructive";

function blurAfterPress(event: MouseEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  requestAnimationFrame(() => button.blur());
}

/**
 * Cartell persistent que indica que un jugador ha cantat envit en aquesta
 * mà. Es manté visible fins que comença la mà següent. Si l'envit ha estat
 * resolt mostra a sota una segona insígnia "Volgut" o "No volgut".
 */
/**
 * Símbol (✓/✗) que es col·loca al costat del ShoutBadge "Envit!" un cop
 * l'envit s'ha resolt. El cartell d'envit en si el dibuixa el ShoutBadge
 * original (que es manté visible fins al final de la mà).
 */
function EnvitOutcomeMark({
  outcome,
  className,
}: {
  outcome: "pending" | "volgut" | "no-volgut";
  className?: string;
}) {
  if (outcome === "pending") return null;
  return (
    <span
      className={cn(
        "pointer-events-none font-display font-black text-2xl leading-none drop-shadow-md",
        outcome === "volgut"
          ? "text-green-500 [text-shadow:_0_0_6px_rgba(34,197,94,0.6),_0_2px_2px_rgba(0,0,0,0.6)]"
          : "text-red-500 [text-shadow:_0_0_6px_rgba(239,68,68,0.6),_0_2px_2px_rgba(0,0,0,0.6)]",
        className
      )}
      style={{ zIndex: TRUC_Z_INDEX.shout }}
      aria-label={outcome === "volgut" ? "Volgut" : "No volgut"}
    >
      {outcome === "volgut" ? "✓" : "✗"}
    </span>
  );
}

/** Frases relacionades amb l'envit que s'amaguen del ChatPanel un cop l'envit
 *  s'ha resolt o ja s'ha passat de la primera baza. */
const ENVIT_PHRASE_IDS: ReadonlySet<ChatPhraseId> = new Set<ChatPhraseId>([
  "tens-envit",
  "vols-envide",
  "vols-tornar-envidar",
  "quant-envit",
  "si-tinc-n",
  "envida",
  "tira-falta",
]);


/**
 * Component visual del tauler de Truc. No té estat de joc propi: rep
 * `match`, accions humanes i callbacks. S'utilitza tant per a la partida
 * solo (`/partida`) com per a la versió online.
 *
 * Sempre mostra el seient `HUMAN = 0` a baix (perspectiva del jugador local
 * en mode solo). En el mode online, el wrapper ha de rotar el `match` o
 * passar les dades amb el seient propi a la posició 0 abans de cridar açò.
 */

export interface TrucBoardProps {
  match: MatchState;
  /** Accions legals per al jugador humà (seient 0). */
  humanActions: Action[];
  /** Despatxa una acció del jugador humà. */
  dispatch: (player: PlayerId, action: Action) => void;

  /** Crit instantani per a l'animació flotant central. */
  shoutFlash: { what: string; labelOverride?: string; player?: PlayerId } | null;
  /** Llista de crits actius alhora (per a respostes "vull"/"no-vull" de
   *  diversos jugadors mostrades simultàniament). Si es proporciona, es
   *  pinta com a font preferent; si no, s'usa `shoutFlash`. */
  shoutFlashes?: Array<{ what: string; labelOverride?: string; player?: PlayerId }>;
  lastShoutByPlayer: Record<PlayerId, ShoutKind | null>;
  shoutLabelByPlayer: Record<PlayerId, string | null>;
  acceptedShoutByPlayer: Record<PlayerId, boolean>;
  /** Família del darrer cant per jugador: "envit" (cartell amunt) o "truc"
   *  (cartell avall). Si no es proporciona, s'infereix del shout actual. */
  shoutFamilyByPlayer?: Record<PlayerId, "envit" | "truc" | null>;
  /** Cartell persistent d'envit per jugador (independent del cartell de truc). */
  envitShoutByPlayer?: Record<PlayerId, ShoutKind | null>;
  envitShoutLabelByPlayer?: Record<PlayerId, string | null>;
  /** Estat persistent del cartell d'envit per jugador (visible fins la nova mà). */
  envitOutcomeByPlayer?: Record<PlayerId, { outcome: "pending" | "volgut" | "no-volgut" } | null>;

  /** Missatges de xat per jugador (l'últim emès recentment). */
  messages: ChatMessage[];
  /** L'humà parla. */
  onSay: (phraseId: ChatPhraseId) => void;

  /** Callbacks de hint al bot company i nova partida. */
  onNewGame: () => void;
  onAbandon: () => void;

  /** Etiquetes dels seients (perspectiva des del jugador). */
  seatNames?: { bottom?: string; left?: string; top?: string; right?: string };

  /**
   * Si està definit, s'usa per disparar l'animació de reparteix. Quan canvia
   * el valor s'inicia una nova animació. Si és `null` mai es reparteix
   * (útil per a forçar UI sense animació).
   */
  dealKey?: string | null;

  /**
   * Seient (0..3) que ha de mostrar-se a la posició inferior. Per defecte 0
   * (mode solo). En mode online es passa el seient del propi jugador per a
   * que sempre es vegi a sí mateix avall.
   */
  perspectiveSeat?: PlayerId;

  /** Contingut opcional inserit entre la mà del jugador i el ChatPanel
   *  (utilitzat pel mode online per al xat lliure de la mesa). */
  belowHandSlot?: React.ReactNode;

  /** Temps màxim per torn (segons). Si l'humà no juga, es tira automàticament. */
  turnTimeoutSec?: 15 | 30 | 45 | 60;
  /** Callback per canviar el temps màxim per torn des del propi tauler. */
  onChangeTurnTimeoutSec?: (sec: 15 | 30 | 45 | 60) => void;
  /**
   * Timestamp ISO o ms epoch del moment en què el servidor va anclar el torn
   * actual. Si es defineix, el comptador s'ancora a aquest valor en lloc del
   * `Date.now()` local — així tots els clients online queden sincronitzats
   * encara que hi haja latència. Si és null/undefined, s'usa l'ancoratge
   * local (mode offline).
   */
  turnAnchorAt?: string | number | null;

  /**
   * Estat de presència per seient (només mode online). Si no es proporciona,
   * els seients no mostren cap indicador de connexió (mode offline / vs bots).
   */
  seatPresence?: Record<PlayerId, PresenceStatus | null>;
  /** Timestamp ISO de l'últim heartbeat per seient (per al tooltip "fa Xs"). */
  seatPresenceLastSeen?: Record<PlayerId, string | null>;

  /** URL d'avatar per seient (només jugadors humans amb perfil). Quan està
   *  definit, l'indicador del seient mostra la imatge en lloc de la inicial. */
  seatAvatars?: Record<PlayerId, string | null>;

  /** Si es proporciona, mostra un botó de pausa sota el d'abandonar. */
  onPauseToggle?: (next: boolean) => void;
  /** Si la partida està actualment pausada (només mode online). */
  paused?: boolean;

  /**
   * Últim `dealKey` ja consumit (animació ja reproduïda) en una instància
   * anterior d'aquest component. Permet que el pare persistisca aquest valor
   * a través de re-munts del `TrucBoard` (per exemple, en mode online quan
   * la pàgina re-renderitza i el board es desmunta i munta) per evitar que
   * la nova instància torne a disparar l'animació de repartir.
   */
  initialConsumedDealKey?: string | null;
  /**
   * Notifica al pare que un `dealKey` s'ha "consumit" (ja s'ha decidit què
   * fer amb ell: animar o ignorar). El pare hauria de persistir-lo per a
   * passar-lo com a `initialConsumedDealKey` en futurs re-munts.
   */
  onDealKeyConsumed?: (dealKey: string) => void;
  /**
   * Notifica al pare que l'animació de repartir d'un `dealKey` ha acabat,
   * per a que puga alliberar qualsevol throttle/lock que tinguera associat
   * sense haver d'esperar un timeout fix.
   */
  onDealAnimationEnd?: (dealKey: string) => void;
  /**
   * Es dispara cada vegada que canvia l'estat d'alguna animació de
   * transició entre mans (recollida, pase del mazo o repartiment). El pare
   * pot utilitzar aquesta senyal per pausar el motor del joc mentre es
   * reprodueix la seqüència d'animacions, evitant que els bots juguen la
   * mà nova abans que l'usuari haja vist el repartiment.
   */
  onTransitionActiveChange?: (active: boolean) => void;
  /**
   * Notifica al pare quan la partida acaba (es mostra l'overlay final).
   * Es dispara una sola vegada per cada partida acabada (per `match` instance).
   * El pare l'utilitza per a registrar el resultat al backend (estadístiques,
   * XP, ratxes, etc.).
   */
  onMatchEnd?: (winnerTeam: TeamId) => void;
}

/**
 * Tauler del Truc. Conté:
 *  - Capçalera amb so / nova partida / marcador horitzontal / abandonar.
 *  - Superfície de joc (TableSurface) amb seients, mans ocultes i animació.
 *  - Zona inferior amb la mà del jugador, envit, crits i ChatPanel.
 */
export function TrucBoard(props: TrucBoardProps) {
  const {
    match,
    humanActions,
    dispatch,
    shoutFlash,
    shoutFlashes,
    lastShoutByPlayer,
    shoutLabelByPlayer,
    acceptedShoutByPlayer,
    
    envitShoutByPlayer,
    envitShoutLabelByPlayer,
    envitOutcomeByPlayer,
    messages,
    onSay,
    onNewGame,
    onAbandon,
    seatNames,
    dealKey: providedDealKey,
    
    perspectiveSeat = 0 as PlayerId,
    belowHandSlot,
    turnTimeoutSec = 30,
    onChangeTurnTimeoutSec: _onChangeTurnTimeoutSec,
    turnAnchorAt,
    seatPresence,
    seatPresenceLastSeen,
    seatAvatars,
    onPauseToggle,
    paused = false,
    initialConsumedDealKey,
    onDealKeyConsumed,
    onDealAnimationEnd,
    onTransitionActiveChange,
    onMatchEnd,
  } = props;
  const t = useT();

  const presenceFor = (p: PlayerId) => seatPresence?.[p] ?? null;
  const presenceLastSeenFor = (p: PlayerId) => seatPresenceLastSeen?.[p] ?? null;
  const avatarFor = (p: PlayerId) => seatAvatars?.[p] ?? null;


  // Seients lògics derivats de la perspectiva. El jugador "HUMAN" és sempre
  // qui mira el tauler des de baix.
  const HUMAN: PlayerId = perspectiveSeat;
  const RIGHT: PlayerId = ((perspectiveSeat + 1) % 4) as PlayerId;
  const PARTNER: PlayerId = ((perspectiveSeat + 2) % 4) as PlayerId;
  const LEFT: PlayerId = ((perspectiveSeat + 3) % 4) as PlayerId;

  const r = match.round;
  const [muted, setMuted] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [scoreToasts, setScoreToasts] = useState<PointToast[]>([]);
  // IDs de les cartes de la mà del jugador local que estan visualment
  // "girades" (mostrant el dors). Si l'usuari clica sobre una carta girada,
  // es jugarà tapada (boca avall) — sense valor per a la baza ni per a
  // l'envit.
  const [flippedHumanIds, setFlippedHumanIds] = useState<Set<string>>(() => new Set());
  const [displayedScores, setDisplayedScores] = useState(() => ({
    nos: { ...match.scores.nos },
    ells: { ...match.scores.ells },
  }));
  const [displayedCames, setDisplayedCames] = useState(() => ({ ...match.camesWon }));
  // Set de jugadors que han mostrat el bocadillo "Vull" o "No vull" en la
  // ronda actual. S'usa per retardar la V verda / X roja dels carteles de
  // truc i envit fins que la resposta del rival és visible al tauler.
  const [respondersSeen, setRespondersSeen] = useState<Record<PlayerId, "vull" | "no-vull" | null>>({
    0: null, 1: null, 2: null, 3: null,
  });
  const respondersRoundRef = useRef<number>(match.history.length);
  useEffect(() => {
    // Important: només resetegem quan la nova mà s'inicia de veritat
    // (fase distinta de "round-end"). Si resetem mentre encara estem en
    // la pausa de "round-end", les marques V/X desapareixerien abans que
    // els carteles d'envit/truc (que persisteixen via snapshot fins que
    // comença la nova mà). Així V/X i cartell s'esborren alhora.
    if (r.phase === "round-end") return;
    if (respondersRoundRef.current !== match.history.length) {
      respondersRoundRef.current = match.history.length;
      setRespondersSeen({ 0: null, 1: null, 2: null, 3: null });
    }
  }, [match.history.length, r.phase]);
  useEffect(() => {
    const list = (shoutFlashes && shoutFlashes.length > 0)
      ? shoutFlashes
      : (shoutFlash ? [shoutFlash] : []);
    let next: Record<PlayerId, "vull" | "no-vull" | null> | null = null;
    for (const f of list) {
      if ((f.what === "vull" || f.what === "no-vull") && f.player !== undefined) {
        const w = f.what as "vull" | "no-vull";
        if (respondersSeen[f.player] !== w) {
          if (!next) next = { ...respondersSeen };
          next[f.player] = w;
        }
      }
    }
    if (next) setRespondersSeen(next);
  }, [shoutFlash, shoutFlashes, respondersSeen]);
  // Saber si podem mostrar la marca V/X d'un cantador:
  //  · "volgut" (V verda) → cal haver vist almenys un "Vull" d'un rival.
  //  · "no-volgut" (X roja) → cal haver vist el "No vull" de TOTS els
  //    rivals (els dos jugadors de l'equip rival), per evitar pintar la
  //    marca abans que tots els rebuigs siguen visibles a la mesa.
  const opponentResponseComplete = (
    caller: PlayerId,
    outcome: "volgut" | "no-volgut",
  ): boolean => {
    const callerTeam = teamOf(caller);
    const opponents = ([0, 1, 2, 3] as PlayerId[]).filter(
      (p) => teamOf(p) !== callerTeam,
    );
    if (outcome === "volgut") {
      return opponents.some((p) => respondersSeen[p] === "vull");
    }
    return opponents.every((p) => respondersSeen[p] === "no-vull");
  };
  const scoreToastHideTimerRef = useRef<number | null>(null);
  const lastHistoryLenForScoreRef = useRef(match.history.length);
  const pendingRoundResolutionRef = useRef<{
    scores: typeof match.scores;
    camesWon: typeof match.camesWon;
    toasts: PointToast[];
  } | null>(null);

  const clearScoreToastHideTimer = () => {
    if (scoreToastHideTimerRef.current != null) {
      window.clearTimeout(scoreToastHideTimerRef.current);
      scoreToastHideTimerRef.current = null;
    }
  };
  // Outcome efectiu del cartell d'envit per a un cantador: si encara no
  // s'ha vist el cartell central de "Vull" / "No vull" del rival, retorna
  // "pending" (no es pinta marca i el cartell continua pulsant).
  const effectiveEnvitOutcome = (
    p: PlayerId,
  ): "pending" | "volgut" | "no-volgut" | null => {
    const o = envitOutcomeByPlayer?.[p];
    if (!o) return null;
    if (o.outcome === "pending") return "pending";
    if (!opponentResponseComplete(p, o.outcome)) return "pending";
    return o.outcome;
  };
  // V verda del truc: només es pinta una vegada s'ha vist el cartell
  // central "Vull" del rival.
  const effectiveAcceptedShout = (p: PlayerId): boolean => {
    if (!acceptedShoutByPlayer[p]) return false;
    return opponentResponseComplete(p, "volgut");
  };
  const commitScoreDisplay = (nextScores: typeof match.scores, nextCames: typeof match.camesWon) => {
    // Evita re-renders innecessaris: si els valors són idèntics als
    // mostrats actualment, no fem setState. Aquesta funció es crida en
    // cada render del padre quan match canvia (encara que scores no), i
    // un setState amb objecte nou — encara que sigui semànticament igual
    // — força un re-render i la repintada del marcador.
    setDisplayedScores((prev) => {
      if (
        prev.nos.males === nextScores.nos.males &&
        prev.nos.bones === nextScores.nos.bones &&
        prev.ells.males === nextScores.ells.males &&
        prev.ells.bones === nextScores.ells.bones
      ) {
        return prev;
      }
      return {
        nos: { males: nextScores.nos.males, bones: nextScores.nos.bones },
        ells: { males: nextScores.ells.males, bones: nextScores.ells.bones },
      };
    });
    setDisplayedCames((prev) => {
      if (prev.nos === nextCames.nos && prev.ells === nextCames.ells) return prev;
      return { nos: nextCames.nos, ells: nextCames.ells };
    });
  };

  const applyPendingRoundResolution = () => {
    const pending = pendingRoundResolutionRef.current;
    if (!pending) return;
    pendingRoundResolutionRef.current = null;
    clearScoreToastHideTimer();
    // Agrupa els tres setStates en una microtask perquè React 18 els
    // batchegi en un sol commit. La crida directa ja és batchejada dins
    // d'un event handler/effect, però fem-ho explícit perquè aquest
    // mètode també es crida des de timeouts on el batching no és
    // automàtic en React 17 (no afecta a React 18+, però és més segur).
    logSequence("scoreboard:toast-show", { count: pending.toasts.length });
    logSequence("scoreboard:score-commit", {
      nos: pending.scores.nos,
      ells: pending.scores.ells,
    });
    setScoreToasts(pending.toasts);
    commitScoreDisplay(pending.scores, pending.camesWon);
    if (pending.toasts.length > 0) {
      scoreToastHideTimerRef.current = window.setTimeout(() => {
        setScoreToasts([]);
        scoreToastHideTimerRef.current = null;
      }, 3000);
    }
  };

  useEffect(() => {
    const prev = lastHistoryLenForScoreRef.current;
    const cur = match.history.length;
    if (cur < prev) {
      lastHistoryLenForScoreRef.current = cur;
      pendingRoundResolutionRef.current = null;
      clearScoreToastHideTimer();
      setScoreToasts([]);
      commitScoreDisplay(match.scores, match.camesWon);
      return;
    }
    if (cur === prev) {
      if (!pendingRoundResolutionRef.current) {
        commitScoreDisplay(match.scores, match.camesWon);
      }
      return;
    }

    lastHistoryLenForScoreRef.current = cur;
    const newSummaries = match.history.slice(prev);
    const incoming: PointToast[] = [];
    const seenKeys = new Set<string>();
    newSummaries.forEach((summary, offset) => {
      const roundIndex = prev + offset;
      for (const toast of buildToastsFromSummary(summary)) {
        const key = pointToastKey(roundIndex, toast);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        incoming.push({ id: key, ...toast });
      }
    });

    pendingRoundResolutionRef.current = {
      scores: {
        nos: { ...match.scores.nos },
        ells: { ...match.scores.ells },
      },
      camesWon: { ...match.camesWon },
      toasts: incoming,
    };
  }, [match.history.length, match.history, match.scores, match.camesWon]);

  // Animació de reparteix.
  //
  // IMPORTANT: en partides online (i a vegades en local) els bots poden
  // començar a jugar la primera baza abans que el client vegi el primer
  // snapshot de la ronda nova. Si exigim "totes les mans intactes" per a
  // detectar el reparteix, l'animació s'omet i el jugador veu directament
  // bots amb 2 cartes. Detectem el reparteix per **canvi de ronda**
  // (history.length + cames + mano) sempre que encara estem dins la
  // primera baza i el total de cartes en joc (mans + jugades) és 12.
  const currentRoundKey = `${match.history.length}-${match.cames}-${r.mano}`;
  const autoDealKey = (() => {
    const inHand = r.hands[0].length + r.hands[1].length + r.hands[2].length + r.hands[3].length;
    const playedThisRound = r.tricks.reduce((acc, t) => acc + t.cards.length, 0);
    const total = inHand + playedThisRound;
    const isFirstTrick = r.tricks.length === 1;
    // total === 12 → ningú no ha guanyat baza encara (no s'han descartat).
    // isFirstTrick → estem realment al començament de la ronda.
    if (total === 12 && isFirstTrick && r.tricks[0].cards.length < 4) {
      return currentRoundKey;
    }
    return null;
  })();
  const dealKey = providedDealKey === undefined ? autoDealKey : providedDealKey;

  // Inicialitzem `lastDealKeyRef` amb l'últim `dealKey` ja consumit que ens
  // passa el pare (quan existeix). Això permet que un re-mount del
  // `TrucBoard` (típic en mode online quan la pàgina re-renderitza)
  // hereti la "memòria" de l'animació ja reproduïda i no la torni a
  // disparar per una mà que ja estava repartida.
  //
  // IMPORTANT: si el pare no ens passa `initialConsumedDealKey` (cas típic
  // del mode offline on cada partida nova arrenca des de zero), inicialitzem
  // a `null` perquè el primer `dealKey` no nul dispari l'animació de
  // repartir. Si pre-omplim el ref amb el `dealKey` actual de muntatge,
  // l'efecte de sota el considera "ja consumit" i mai s'anima la primera
  // mà.
  const lastDealKeyRef = useRef<string | null>(initialConsumedDealKey ?? null);
  const [dealing, setDealing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectOverlayReady, setCollectOverlayReady] = useState(false);
  const [collectKey, setCollectKey] = useState<string | null>(null);
  const [collectItems, setCollectItems] = useState<CollectedCard[]>([]);
  const [collectDealerXY, setCollectDealerXY] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Animació de "passar el mazo" entre dealers (entre la recollida i el repartiment).
  const [passing, setPassing] = useState(false);
  const [passKey, setPassKey] = useState<string | null>(null);
  const [passDealer, setPassDealer] = useState<PlayerId>(0);
  // Animació de revelació de l'envit (quan s'ha querit) entre el final de
  // mà i la recollida de cartes. Es mostra durant ~3 s.
  const [envitRevealActive, setEnvitRevealActive] = useState(false);
  const [envitRevealWinner, setEnvitRevealWinner] = useState<TeamId | null>(null);
  // Quan estem fent la "recollida", congelem el dealKey pendent perquè
  // l'animació de repartir no comenci fins que la recollida acabe.
  const pendingDealKeyRef = useRef<string | null>(null);
  const pendingDealerRef = useRef<PlayerId | null>(null);
  const [revealedCount, setRevealedCount] = useState<Record<PlayerId, number>>({
    0: 3, 1: 3, 2: 3, 3: 3,
  });
  // Snapshot de les mans capturat al moment d'arrencar l'animació de
  // repartir. Mentre `dealing` és cert, totes les vistes de cartes (mà
  // pròpia i HiddenHand dels altres seients) llegeixen d'aquesta còpia
  // immutable. Així, si arriben snapshots del servidor amb cartes
  // diferents (per exemple, perquè l'estat ha avançat ràpidament durant
  // l'animació), no es produeix cap flicker visual.
  const dealingHandsRef = useRef<Record<PlayerId, typeof r.hands[PlayerId]> | null>(null);
  // Snapshot estàtic de la ronda anterior, capturat just al final de mà.
  // S'utilitza per a animar la "recollida" de totes les cartes (jugades i
  // les que encara estaven a la mà) cap al mazo del dealer abans de
  // començar el nou repartiment.
  type CollectMeasure = { x: number; y: number; w: number; h: number; rot: string };
  type SnapPlayedCard = { id: string; player: PlayerId; suit: Suit; rank: Rank; measure: CollectMeasure | null; covered?: boolean };
  type SnapHandCard = { id: string; player: PlayerId; suit: Suit; rank: Rank; measure: CollectMeasure | null };
  const lastRoundSnapshotRef = useRef<{
    played: SnapPlayedCard[];
    hand: SnapHandCard[];
    dealer: PlayerId;
    matchKey: string;
  } | null>(null);
  const lastRoundVisualMatchRef = useRef<MatchState | null>(null);

  // Captura el snapshot la primera vegada que veiem la ronda en
  // `round-end`/`game-end` (o que el log ja conté un esdeveniment de fi
  // de ronda). Una vegada capturat, no el sobreescrivim fins que la
  // recollida es consumeixi: així sobreviu al `newRound()` posterior, que
  // reparteix una mà nova i, sense aquest gel, esborraria les cartes a
  // animar.
  const phaseEnded =
    r.phase === "round-end" ||
    r.phase === "game-end" ||
    r.log.some((ev) => ev.type === "round-end" || ev.type === "game-end");
  const endRoundKey = `${match.history.length}-${match.cames}`;
  const lastCapturedEndRoundKeyRef = useRef<string | null>(null);
  const capturePendingEndRoundKeyRef = useRef<string | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!phaseEnded) return;
    if (lastCapturedEndRoundKeyRef.current === endRoundKey) return;
    if (capturePendingEndRoundKeyRef.current === endRoundKey) return;
    capturePendingEndRoundKeyRef.current = endRoundKey;
    const captureTimer = window.setTimeout(() => {
      const measure = (id: string): CollectMeasure | null => {
        if (typeof document === "undefined") return null;
        const el = document.querySelector(`[data-collect-id="${CSS.escape(id)}"]`) as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          w: rect.width,
          h: rect.height,
          rot: el.getAttribute("data-collect-rot") ?? "0deg",
        };
      };
      const played: SnapPlayedCard[] = [];
      r.tricks.forEach((t) => {
        t.cards.forEach((tc) => {
          played.push({
            id: tc.card.id,
            player: tc.player,
            suit: tc.card.suit,
            rank: tc.card.rank,
            measure: measure(tc.card.id),
            covered: tc.covered,
          });
        });
      });
      const hand: SnapHandCard[] = [];
      ([0, 1, 2, 3] as PlayerId[]).forEach((p) => {
        r.hands[p].forEach((c) => {
          hand.push({ id: c.id, player: p, suit: c.suit, rank: c.rank, measure: measure(c.id) });
        });
      });
      if (played.length > 0 || hand.length > 0) {
        lastRoundSnapshotRef.current = {
          played,
          hand,
          dealer: match.dealer,
          matchKey: endRoundKey,
        };
        lastRoundVisualMatchRef.current = match;
        lastCapturedEndRoundKeyRef.current = endRoundKey;
      }
      capturePendingEndRoundKeyRef.current = null;
    }, 420);
    return () => window.clearTimeout(captureTimer);
  }, [phaseEnded, endRoundKey, r.tricks, r.hands, match, match.dealer]);


  // No hi ha cap animació de fi de mà: el hook manté l'estat en `round-end`
  // durant 3 s i el tauler queda completament quiet fins a la següent mà.
  // Notifica al pare el `dealKey` inicial consumit perquè el persisteixi i
  // el puga re-injectar en futurs re-munts.
  useEffect(() => {
    if (lastDealKeyRef.current) {
      onDealKeyConsumed?.(lastDealKeyRef.current);
    }
    // Només al muntar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Helper: arrenca l'animació de repartir per al `dealKey` indicat. Es
  // crida directament quan no hi ha res a recollir, o diferida quan acaba
  // la `CollectAnimation` per a la mà anterior.
  const startDealing = (key: string) => {
    onDealKeyConsumed?.(key);
    lastRoundSnapshotRef.current = null;
    lastRoundVisualMatchRef.current = null;
    dealingHandsRef.current = {
      0: [...r.hands[0]],
      1: [...r.hands[1]],
      2: [...r.hands[2]],
      3: [...r.hands[3]],
    };
    logSequence("deal-anim-start", { dealKey: key });
    endSequence(match.history.length - 1);
    setDealing(true);
    setRevealedCount({ 0: 0, 1: 0, 2: 0, 3: 0 });
  };
  const startDealingRef = useRef(startDealing);
  useEffect(() => {
    startDealingRef.current = startDealing;
  });

  useIsomorphicLayoutEffect(() => {
    if (!dealKey) return;
    if (dealKey === lastDealKeyRef.current) return;
    // Log: nou `dealKey` rebut. A partir d'aquest punt mesurem el delta
    // fins a la transició visual següent (collect / pass / deal). Si es
    // supera el llindar, `sequenceLog` emet un GAP REGRESSION error.
    logSequence("dealKey-changed", {
      dealKey,
      phase: dealing ? "deal" : collecting ? "collect" : passing ? "pass" : "idle",
      hasSnapshot: !!lastRoundSnapshotRef.current,
    });
    // Bloqueig anti-repetició: si ja estem repartint o recollint, no
    // reiniciem encara que arribi un `dealKey` nou (típic en mode online
    // quan el servidor envia varies snapshots seguides).
    if (dealing || collecting) {
      lastDealKeyRef.current = dealKey;
      onDealKeyConsumed?.(dealKey);
      return;
    }
    // Si la primera baza ja té cartes jugades, la ronda ja està en marxa
    // i no té sentit tornar a animar el repartiment — només passaria si
    // ens arriba un snapshot tardà o desordenat.
    if (r.tricks.length > 0 && r.tricks[0].cards.length > 0) {
      lastDealKeyRef.current = dealKey;
      onDealKeyConsumed?.(dealKey);
      lastRoundSnapshotRef.current = null;
      lastRoundVisualMatchRef.current = null;
      return;
    }
    lastDealKeyRef.current = dealKey;

    // Si tenim snapshot de la mà anterior, primer animem la recollida
    // de totes les cartes (jugades + a la mà) cap al dealer; el reparteix
    // s'engegarà quan acabe. Utilitzem les posicions REALS capturades al
    // final de mà, abans que l'estat canviï a la mà nova, perquè les cartes
    // jugades surtin del centre de la mesa i no del seient del jugador.
    const snap = lastRoundSnapshotRef.current;
    if (snap && (snap.played.length > 0 || snap.hand.length > 0)) {
      const items: CollectedCard[] = [];
      snap.played.forEach((c) => {
        const m = c.measure;
        if (!m) return;
        items.push({
          id: c.id,
          player: c.player,
          suit: c.suit,
          rank: c.rank,
          startX: m.x,
          startY: m.y,
          width: m.w,
          height: m.h,
          startRot: m.rot,
          faceDown: !!c.covered,
          size: "md",
        });
      });
      snap.hand.forEach((c) => {
        const m = c.measure;
        if (!m) return;
        // Cartes a la mà: jugadors no-locals tenien la carta boca avall,
        // el local boca amunt. Mida "md" per al local, "sm" per als altres.
        const isLocal = c.player === HUMAN;
        items.push({
          id: c.id,
          player: c.player,
          suit: c.suit,
          rank: c.rank,
          inHand: true,
          startX: m.x,
          startY: m.y,
          width: m.w,
          height: m.h,
          startRot: m.rot,
          faceDown: !isLocal,
          size: isLocal ? "md" : "sm",
        });
      });

      // Mesura el destí: el centre del contenidor del dealer.
      let dealerX = window.innerWidth / 2;
      let dealerY = window.innerHeight / 2;
      const deckEl = document.querySelector(`[data-deck-anchor="${snap.dealer}"]`) as HTMLElement | null;
      if (deckEl) {
        const dr = deckEl.getBoundingClientRect();
        dealerX = dr.left + dr.width / 2;
        dealerY = dr.top + dr.height / 2;
      }

      // Els punts (cartells + marcador) ja s'han commitejat per l'efecte
      // de fi de mà (a 1500 ms en mans sense envit, o just després de la
      // revelació en mans amb envit querit). Cridem
      // `applyPendingRoundResolution()` igualment per seguretat: si per
      // alguna raó encara queda pendent (per exemple, un re-mount), el
      // resol ara. En cas contrari és un no-op.
      applyPendingRoundResolution();
      if (items.length === 0) {
        const newDealer = ((snap.dealer + 1) % 4) as PlayerId;
        pendingDealKeyRef.current = dealKey;
        pendingDealerRef.current = newDealer;
        setRevealedCount({ 0: 0, 1: 0, 2: 0, 3: 0 });
        setPassDealer(newDealer);
        setPassKey(`pass-${snap.matchKey}->${dealKey}`);
        logSequence("pass-anim-start", { dealKey, dealer: newDealer });
        setPassing(true);
      } else {
        pendingDealKeyRef.current = dealKey;
        pendingDealerRef.current = ((snap.dealer + 1) % 4) as PlayerId;
        const newCollectKey = `${snap.matchKey}->${dealKey}`;
        // Els cartells de punts ja són visibles des de fa ~500 ms, així
        // que muntem la CollectAnimation immediatament. Les cartes
        // arrencaran l'animació al frame següent des de la posició exacta
        // on es troben, sense salts.
        setCollectItems(items);
        // Estabilitza la identitat: si les coordenades no han canviat,
        // reutilitza l'objecte existent perquè els fills memoitzats
        // (`CollectAnimation`) no es re-renderitzen sense cap raó visible.
        setCollectDealerXY((prev) =>
          prev.x === dealerX && prev.y === dealerY ? prev : { x: dealerX, y: dealerY },
        );
        setCollectKey(newCollectKey);
        setCollectOverlayReady(false);
        logSequence("collect-anim-start", { items: items.length, dealKey });
        setCollecting(true);
      }
    } else {
      applyPendingRoundResolution();
      // No hi ha res a recollir: comencem a repartir directament.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => startDealingRef.current(dealKey));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealKey]);

  // Watchdog: garantia que si l'animació de repartir es queda penjada
  // (per exemple, perquè `onComplete` no s'arriba a invocar a causa
  // d'un re-render o d'un timer ofegat per la pestanya en background),
  // forcem el final passat un temps de seguretat. Així mai no es queda
  // mostrant només una o dues cartes a la mà del jugador.
  useEffect(() => {
    if (!dealing) return;
    const SAFETY_MS = 3500; // 12 cartes × 140ms + 380ms ≈ 2060ms; marge ample.
    const t = window.setTimeout(() => {
      setDealing(false);
      setRevealedCount({ 0: 3, 1: 3, 2: 3, 3: 3 });
      dealingHandsRef.current = null;
      if (dealKey) onDealAnimationEnd?.(dealKey);
    }, SAFETY_MS);
    return () => window.clearTimeout(t);
  }, [dealing, dealKey, onDealAnimationEnd]);

  // Watchdog anàleg per a la "recollida": si l'animació no completa en
  // un temps raonable, forcem la transició a l'animació de repartir.
  useEffect(() => {
    if (!collecting) return;
    const SAFETY_MS = 3500;
    const t = window.setTimeout(() => {
      setCollecting(false);
      setCollectOverlayReady(false);
      const newDealer = pendingDealerRef.current;
      if (newDealer != null && pendingDealKeyRef.current) {
        setPassDealer(newDealer);
        setPassKey(`pass-fallback-${pendingDealKeyRef.current}`);
        setPassing(true);
      }
    }, SAFETY_MS);
    return () => window.clearTimeout(t);
  }, [collecting]);

  // Watchdog per al pase del mazo.
  useEffect(() => {
    if (!passing) return;
    const SAFETY_MS = 1500;
    const t = window.setTimeout(() => {
      setPassing(false);
      const pendingKey = pendingDealKeyRef.current;
      pendingDealKeyRef.current = null;
      pendingDealerRef.current = null;
      if (pendingKey) startDealingRef.current(pendingKey);
    }, SAFETY_MS);
    return () => window.clearTimeout(t);
  }, [passing]);

  // Notifica al pare l'estat agregat de les animacions de transició entre
  // mans (recollida, pase del mazo, repartiment o revelació de l'envit).
  // Mentre `active` és cert el pare hauria de pausar el motor del joc per
  // a que els bots no juguen la mà nova abans que l'usuari haja vist la
  // seqüència completa.
  // El bloqueig del motor s'estén a TOTA la finestra entre el final de mà
  // i el repartiment complet de la nova mà:
  //   round-end detectat → espera 3s/6s → revelació envit (si cal) →
  //   suma de punts → recollida → pase del mazo → repartiment.
  // Mentre qualsevol d'aquestes fases siga activa, el pare ha de pausar
  // el motor perquè cap jugador (humà o bot) puga actuar.
  const transitionActive =
    phaseEnded || collecting || passing || dealing || envitRevealActive;
  const lastTransitionActiveRef = useRef<boolean>(false);
  useEffect(() => {
    if (lastTransitionActiveRef.current === transitionActive) return;
    lastTransitionActiveRef.current = transitionActive;
    onTransitionActiveChange?.(transitionActive);
  }, [transitionActive, onTransitionActiveChange]);

  // Selector únic (single source of truth) per a la vista de les mans i
  // la `match` visual durant les transicions entre rondes. Tota la lògica
  // viu a `@/game/handsViewSelector` perquè tant el mode "només bots" com
  // l'online (que comparteixen aquest mateix `<TrucBoard>`) la consumeixen
  // pel mateix camí i no puguen desincronitzar-se en futures modificacions.
  //
  // Optimització de render: memoitzem el resultat amb `useMemo` perquè la
  // identitat referencial del `handsView` i del `collectingVisualMatch`
  // siga estable mentre les entrades no canvien. Això evita re-renders
  // innecessaris dels fills memoitzats (`TableSurface`, etc.) durant la
  // finestra crítica entre la rebuda d'un nou `dealKey` i l'activació de
  // la `CollectAnimation`. Els refs (`lastRoundVisualMatchRef.current`,
  // `dealingHandsRef.current`) entren com a dependències perquè el commit
  // que els muta sempre va acompanyat d'un canvi d'algun dels estats
  // anteriors (collecting/dealing/passing), de manera que el memo
  // s'invalidarà al mateix render que canvien els refs.
  const lastRoundVisualMatch = lastRoundVisualMatchRef.current;
  const lastRoundSnapshot = lastRoundSnapshotRef.current;
  const dealingHands = dealingHandsRef.current;
  const { collectingVisualMatch, handsView } = useMemo(
    () =>
      selectHandsView({
        currentHands: r.hands,
        match,
        collecting,
        dealing,
        passing,
        lastRoundVisualMatch,
        hasLastRoundSnapshot: !!lastRoundSnapshot,
        dealingHands,
      }),
    [
      r.hands,
      match,
      collecting,
      dealing,
      passing,
      lastRoundVisualMatch,
      lastRoundSnapshot,
      dealingHands,
    ],
  );

  // Mostres / preguntes / respostes destacades al ChatPanel.
  const [altresDismissed, setAltresDismissed] = useState(false);
  const [preguntesDismissed, setPreguntesDismissed] = useState(false);
  const [respostesPending, setRespostesPending] = useState(false);
  const respostesAnchorRef = useRef<number | null>(null);
  // Quan sóc l'últim de la meua parella en jugar a la 1a baza, destaquem
  // "Respostes" perquè envie una resposta abans de tirar (o en qualsevol
  // moment fins que envie alguna resposta o ja haja tirat la seua carta).
  const [respostesLastInPairDismissed, setRespostesLastInPairDismissed] = useState(false);
  // Quan sóc el segon de la meua parella en tirar a la 1a baza i és el
  // torn del meu company (encara no ha tirat), destaquem "Respostes".
  const [respostes2ndDismissed, setRespostes2ndDismissed] = useState(false);
  useEffect(() => {
    setAltresDismissed(false);
    setPreguntesDismissed(false);
    setRespostesPending(false);
    setRespostesLastInPairDismissed(false);
    setRespostes2ndDismissed(false);
    respostesAnchorRef.current = null;
  }, [match.history.length]);

  // Reinicia els "dismissed" del botó Respostes quan canvia de baza: així
  // un descart fet a la 1a baza no impedeix que el botó es torne a destacar
  // quan apareix una nova raó (p. ex. el company tira a la 2a baza i jo
  // sóc el segon de la parella).
  useEffect(() => {
    setRespostesLastInPairDismissed(false);
    setRespostes2ndDismissed(false);
  }, [r.tricks.length]);

  // Quan acaba una mà, programem la seqüència visual de fi de mà:
  //   - 0 ms: les cartes queden quietes a la mesa.
  //   - 1500 ms: si l'envit ha estat querit, comença la revelació visual.
  //     Si no, es commiteja directament la suma de punts (cartells + marcador).
  //   - Amb envit: la revelació dura 3000 ms; en acabar (≈4500 ms) es
  //     commiteja la suma de punts.
  // La recollida de cartes la dispara el `dealKey` que arriba després,
  // amb un marge perquè l'usuari vegi els cartells de punts abans del moviment.
  const lastHistoryLenForRevealRef = useRef<number>(match.history.length);
  useEffect(() => {
    const prev = lastHistoryLenForRevealRef.current;
    const cur = match.history.length;
    lastHistoryLenForRevealRef.current = cur;
    if (cur <= prev) return;
    const lastSummary = match.history[cur - 1];
    if (!lastSummary) return;
    const envitOk =
      !!lastSummary.envitWinner &&
      !lastSummary.envitRejected &&
      (lastSummary.envitPoints ?? 0) > 0;
    // T0 for the sequence: a new round summary just landed.
    startSequence(cur - 1, { envitRevealed: envitOk });
    if (!envitOk) {
      // Sense envit querit: a 1,5 s commitegem la suma de punts (apareixen
      // els cartells i el marcador puja). La recollida de cartes
      // començarà ~500 ms més tard, quan arribi el `dealKey`.
      const commitTimer = window.setTimeout(() => {
        applyPendingRoundResolution();
      }, 1500);
      return () => window.clearTimeout(commitTimer);
    }
    const winner = lastSummary.envitWinner as TeamId;
    const startTimer = window.setTimeout(() => {
      logSequence("envit-reveal-start", { winner });
      setEnvitRevealWinner(winner);
      setEnvitRevealActive(true);
    }, 1500);
    const endTimer = window.setTimeout(() => {
      logSequence("envit-reveal-end");
      setEnvitRevealActive(false);
      setEnvitRevealWinner(null);
      // Just després de la revelació, commitegem la suma de punts perquè
      // els cartells apareguen abans de la recollida.
      applyPendingRoundResolution();
    }, 4500);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      setEnvitRevealActive(false);
      setEnvitRevealWinner(null);
    };
  }, [match.history.length]);

  useEffect(() => clearScoreToastHideTimer, []);

  useEffect(() => {
    const partnerMsg = [...messages].reverse().find((m) => m.player === PARTNER);
    if (!partnerMsg) return;
    const phrase = PHRASES.find((p) => p.id === partnerMsg.phraseId);
    if (phrase?.category !== "pregunta") return;
    setRespostesPending(true);
    const playedByPartner = match.round.tricks
      .flatMap((t) => t.cards)
      .filter((tc) => tc.player === PARTNER).length;
    respostesAnchorRef.current = playedByPartner;
  }, [messages, match.round.tricks]);
  useEffect(() => {
    if (!respostesPending) return;
    const anchor = respostesAnchorRef.current;
    if (anchor === null) return;
    const playedByPartner = match.round.tricks
      .flatMap((t) => t.cards)
      .filter((tc) => tc.player === PARTNER).length;
    if (playedByPartner > anchor) {
      setRespostesPending(false);
      respostesAnchorRef.current = null;
    }
  }, [match.round.tricks, respostesPending]);

  const isPendingResponder = (p: PlayerId): boolean => {
    if (r.envitState.kind === "pending") {
      return (
        teamOf(p) === r.envitState.awaitingTeam &&
        !(r.envitState.rejectedBy ?? []).includes(p)
      );
    }
    if (r.trucState.kind === "pending") {
      return (
        teamOf(p) === r.trucState.awaitingTeam &&
        !(r.trucState.rejectedBy ?? []).includes(p)
      );
    }
    return false;
  };

  const myHand = handsView[HUMAN];
  const myPlayedCards = r.tricks
    .flatMap((t) => t.cards)
    .filter((tc) => tc.player === HUMAN && !tc.covered)
    .map((tc) => tc.card);
  // Si l'hum\u00e0 ha jugat tapada la carta de la 1a baza, queda obligat a
  // jugar tamb\u00e9 tapades les seg\u00fcents. Si nom\u00e9s ha tapat la 2a (havent
  // jugat la 1a destapada), pot jugar la 3a destapada lliurement.
  const hasPlayedCovered = !!r.tricks[0]?.cards.some(
    (tc) => tc.player === HUMAN && tc.covered,
  );
  // Per al càlcul de l'envit visible al jugador, excloem també les cartes
  // de la mà que estan visualment girades (es jugaran tapades).
  const myVisibleHand = hasPlayedCovered
    ? []
    : myHand.filter((c) => !flippedHumanIds.has(c.id));
  const myEnvit = bestEnvit([...myVisibleHand, ...myPlayedCards]);

  // Neteja IDs de cartes "girades" que ja no estan a la mà (jugades o
  // recollides en una nova mà). Així evitem que un id antic faça que una
  // carta nova aparega tapada per coincidència d'identificador.
  useEffect(() => {
    setFlippedHumanIds((prev) => {
      if (prev.size === 0) return prev;
      const handIds = new Set(myHand.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (handIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [myHand]);

  // While the end-of-round visual sequence is still running (envit reveal,
  // collect, pass-deck, deal), block all human actions even if the engine
  // state already says it's their turn. The animations must complete first
  // — the user expects to see all cards dealt before being able to play
  // the next hand. This matches the offline behaviour where the engine is
  // paused via `pausedRef` during the same window.
  const actionsLockedByTransition =
    phaseEnded || collecting || passing || dealing || envitRevealActive;

  const playableIds = new Set(
    actionsLockedByTransition
      ? []
      : humanActions
          .filter((a) => a.type === "play-card")
          .map((a) => (a as Extract<Action, { type: "play-card" }>).cardId),
  );
  const shoutActions = (
    actionsLockedByTransition
      ? []
      : humanActions.filter((a) => a.type === "shout")
  ) as Extract<Action, { type: "shout" }>[];

  const isHumanTurn = !actionsLockedByTransition && (r.turn === HUMAN || humanActions.length > 0);
  const gameEnded = r.phase === "game-end";

  // Notifica al pare exactament una vegada per partida acabada.
  const matchEndNotifiedRef = useRef(false);
  useEffect(() => {
    if (!gameEnded) {
      matchEndNotifiedRef.current = false;
      return;
    }
    if (matchEndNotifiedRef.current) return;
    matchEndNotifiedRef.current = true;
    const winnerTeam: TeamId = match.jocForaWinner
      ?? (match.camesWon.nos > match.camesWon.ells ? "nos" : "ells");
    onMatchEnd?.(winnerTeam);
    // Reprodueix uns 4 segons d'aplaudiments per celebrar el final de la
    // partida. La crida \u00e9s din\u00e0mica per evitar carregar el m\u00f2dul al SSR.
    void import("@/lib/applauseAudio").then(({ playApplause }) => {
      playApplause();
    }).catch(() => undefined);
  }, [gameEnded, match.jocForaWinner, match.camesWon.nos, match.camesWon.ells, onMatchEnd]);

  // Auto-play timeout: if the human must play a card and doesn't act within
  // 30 seconds, dispatch a random legal play-card action automatically.
  // Only triggers when a card play is required (not for pending shout
  // responses, which require an explicit decision).
  const playCardActions = humanActions.filter(
    (a) => a.type === "play-card",
  ) as Extract<Action, { type: "play-card" }>[];
  const mustPlayCard =
    !actionsLockedByTransition &&
    playCardActions.length > 0 &&
    r.turn === HUMAN &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending" &&
    !gameEnded;

  // També es dispara el temporitzador quan l'humà ha de respondre a un
  // envit o un truc cantat per un rival/company. En esgotar-se el temps,
  // la resposta la decideix el bot a partir de les cartes de l'humà.
  const mustRespondShout =
    !gameEnded &&
    shoutActions.length > 0 &&
    isPendingResponder(HUMAN);

  const mustAct = mustPlayCard || mustRespondShout;

  const TURN_TIMEOUT_MS = turnTimeoutSec * 1000;
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  const turnDeadlineRef = useRef<number | null>(null);
  const autoPlayedKeyRef = useRef<string | null>(null);

  // Comptador que augmenta cada cop que `mustAct` passa de false→true.
  // Així, quan apareix un cant intermedi (o canvia el torn), en tornar
  // l'obligació d'actuar el deadline es reinicia des de zero.
  const [resumeNonce, setResumeNonce] = useState(0);
  const lastMustActRef = useRef(false);
  useEffect(() => {
    if (mustAct && !lastMustActRef.current) {
      setResumeNonce((n) => n + 1);
    }
    lastMustActRef.current = mustAct;
  }, [mustAct]);

  // Clau estable de l'acció pendent. Inclou `resumeNonce` perquè qualsevol
  // pausa (canvi de fase, etc.) reinicia neta el comptador en tornar.
  // També inclou un marcador del tipus d'acció (play / respond) i, en mode
  // online, `turnAnchorAt`.
  const anchorMs = turnAnchorAt == null
    ? null
    : (typeof turnAnchorAt === "number" ? turnAnchorAt : Date.parse(turnAnchorAt));
  const actKind = mustPlayCard ? "play" : (mustRespondShout ? "respond" : "none");
  const turnKey = mustAct
    ? `${match.history.length}-${match.cames}-${r.tricks.length}-${r.tricks[r.tricks.length - 1]?.cards.length ?? 0}-${HUMAN}-${actKind}-${resumeNonce}-${anchorMs ?? "local"}`
    : null;

  useEffect(() => {
    if (!mustAct || !turnKey || paused) {
      turnDeadlineRef.current = null;
      setTurnSecondsLeft(null);
      return;
    }
    const deadline = anchorMs != null
      ? anchorMs + TURN_TIMEOUT_MS
      : Date.now() + TURN_TIMEOUT_MS;
    turnDeadlineRef.current = deadline;
    const initialRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setTurnSecondsLeft(initialRemaining);

    const tick = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnSecondsLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(tick);
        if (autoPlayedKeyRef.current === turnKey) return;
        autoPlayedKeyRef.current = turnKey;

        // Cas A: ha de respondre a un envit/truc → delega al bot la decisió
        // segons les cartes de l'humà. Funciona per a vull, no-vull, i
        // també per a contracants legals (renvit / retruc / quatre / etc.).
        if (mustRespondShout) {
          const botAction = botDecide(match, HUMAN);
          if (botAction) {
            dispatch(HUMAN, botAction);
            const label =
              botAction.type === "shout"
                ? (botAction.what === "vull" ? t("shout.vull_excl")
                  : botAction.what === "no-vull" ? t("shout.no_vull")
                  : botAction.what.charAt(0).toUpperCase() + botAction.what.slice(1) + "!")
                : t("match.an_answer");
            toast.warning(t("match.timeout"), {
              description: `${t("match.autoplayed_response")}: ${label}`,
              duration: 4000,
            });
          }
          return;
        }

        // Cas B: ha de tirar carta — delega íntegrament al bot, exactament
        // amb la mateixa lògica que faria si l'humà fos un bot.
        const botAction = botDecide(match, HUMAN);
        if (botAction) {
          dispatch(HUMAN, botAction);
          if (botAction.type === "play-card") {
            const myHandNow = r.hands[HUMAN];
            const card = myHandNow.find((c) => c.id === botAction.cardId);
            const cardLabel = card
              ? (() => {
                  const suitName = t(`card.suit.${card.suit}`);
                  const lang = getLanguage();
                  const startsWithVowel = /^[aeiouàèéíòóúAEIOUÀÈÉÍÒÓÚ]/.test(suitName);
                  const connector = lang === "ca" && startsWithVowel ? "d'" : "de ";
                  return `${t(`card.rank.${card.rank}`)} ${connector}${suitName} ${SUIT_SYMBOL[card.suit as "oros" | "copes" | "espases" | "bastos"]}`;
                })()
              : t("match.a_card");
            toast.warning(t("match.timeout"), {
              description: `${t("match.autoplayed_card")}: ${cardLabel}`,
              duration: 4000,
            });
          } else if (botAction.type === "shout") {
            const label =
              botAction.what === "vull" ? t("shout.vull_excl")
                : botAction.what === "no-vull" ? t("shout.no_vull")
                : botAction.what.charAt(0).toUpperCase() + botAction.what.slice(1) + "!";
            toast.warning(t("match.timeout"), {
              description: `${t("match.autoplayed_response")}: ${label}`,
              duration: 4000,
            });
          }
        }
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, mustAct, TURN_TIMEOUT_MS, paused]);

  const firstTrick0 = r.tricks[0];
  const myHandForHL = r.hands[HUMAN] ?? [];
  const hasThreeHL = myHandForHL.some((c) => c.rank === 3);
  const hasManillaHL = myHandForHL.some(
    (c) =>
      (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
      (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
  );
  const hasGoodCardHL = hasThreeHL || hasManillaHL;
  const cardsInFirstTrick = firstTrick0?.cards ?? [];
  const isFirstOfPairFirstTrick =
    (r.phase === "envit" || r.phase === "playing") &&
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    r.turn === HUMAN &&
    !cardsInFirstTrick.some((tc) => tc.player === HUMAN) &&
    !cardsInFirstTrick.some((tc) => tc.player === PARTNER);
  const highlightPreguntesFirstOfPairFirstTrick =
    isFirstOfPairFirstTrick &&
    !preguntesDismissed;
  const humanDistFromManoHL = (HUMAN - r.mano + 4) % 4;
  const partnerDistFromManoHL = (PARTNER - r.mano + 4) % 4;
  const humanIsSecondOfPairHL = humanDistFromManoHL > partnerDistFromManoHL;
  const partnerHasPlayedFirstTrickHL = !!firstTrick0?.cards.some((tc) => tc.player === PARTNER);
  const humanHasPlayedFirstTrickHL = !!firstTrick0?.cards.some((tc) => tc.player === HUMAN);
  const noEnvitYet =
    r.envitState.kind === "none" && !r.envitResolved &&
    !r.log.some((ev) => ev.type === "shout" && (ev.what === "envit" || ev.what === "renvit" || ev.what === "falta-envit"));
  const isSecondOfPairMyTurnFirstTrick =
    (r.phase === "envit" || r.phase === "playing") &&
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    humanIsSecondOfPairHL &&
    partnerHasPlayedFirstTrickHL &&
    !humanHasPlayedFirstTrickHL &&
    r.turn === HUMAN;
  const positionInFirstTrick = cardsInFirstTrick.length; // 0=1r, 1=2n, 2=3r, 3=4t
  const highlightPreguntesAsk2nd =
    isSecondOfPairMyTurnFirstTrick && noEnvitYet &&
    (positionInFirstTrick === 2 || positionInFirstTrick === 3);
  const highlightPreguntes =
    (highlightPreguntesFirstOfPairFirstTrick || highlightPreguntesAsk2nd) &&
    !preguntesDismissed;
  const highlightedPhraseIds = new Set<ChatPhraseId>();
  if (!preguntesDismissed) {
    if (isFirstOfPairFirstTrick) {
      highlightedPhraseIds.add("puc-anar");
      highlightedPhraseIds.add("que-tens");
    }
    if (highlightPreguntesAsk2nd) {
      if (positionInFirstTrick === 2) highlightedPhraseIds.add("vols-envide");
      else if (positionInFirstTrick === 3) highlightedPhraseIds.add("tens-envit");
    }
  }
  // Equip contrari ha cantat envit i estem pendents de respondre amb un
  // envit propi de 31-33: destaquem "Preguntes" i "Vols tornar a envidar?".
  // Aquest destaque NO depèn de `preguntesDismissed`: és una situació
  // reactiva nova (acaba de cantar el rival) i ha de cridar l'atenció
  // encara que el jugador haja enviat alguna pregunta abans en la mà.
  const humanTeam: "nos" | "ells" = HUMAN % 2 === 0 ? "nos" : "ells";
  const myEnvitPts = playerTotalEnvit(r, HUMAN);
  // En "match point" de cama (a algun equip li falta 1 punt per tancar
  // la cama) l'envit només pot valdre 1 i no es pot pujar (renvit /
  // falta-envit), així que "Vols tornar a envidar?" no té sentit ni com
  // a pregunta consultiva. No la destaquem ni la oferim.
  const camaMatchPoint = isCamaMatchPoint(match);
  const opponentEnvitPending =
    r.envitState.kind === "pending" &&
    r.envitState.awaitingTeam === humanTeam &&
    myEnvitPts >= 31 && myEnvitPts <= 33 &&
    !camaMatchPoint;
  if (opponentEnvitPending) {
    highlightedPhraseIds.add("vols-tornar-envidar");
  }
  // 2a baza: hem guanyat la 1a baza i sóc el primer de la meua parella en
  // tirar. Si em queda un 3 o el 7 d'oros, destaquem "Preguntes" i
  // "Portes un tres?".
  const secondTrick0 = r.tricks[1];
  const cardsInSecondTrick = secondTrick0?.cards ?? [];
  const partnerHasPlayedSecondTrick = !!secondTrick0?.cards.some((tc) => tc.player === PARTNER);
  const humanHasPlayedSecondTrick = !!secondTrick0?.cards.some((tc) => tc.player === HUMAN);
  const firstTrickWinner = firstTrick0?.winner;
  const humanTeamId: TeamId = HUMAN % 2 === 0 ? "nos" : "ells";
  const wonFirstTrick =
    firstTrickWinner !== undefined && teamOf(firstTrickWinner) === humanTeamId;
  const hasThreeOr7Oros = myHandForHL.some(
    (c) => c.rank === 3 || (c.rank === 7 && c.suit === "oros"),
  );
  const isFirstOfPairSecondTrick =
    r.phase === "playing" &&
    r.tricks.length === 2 &&
    !!secondTrick0 &&
    wonFirstTrick &&
    r.turn === HUMAN &&
    !partnerHasPlayedSecondTrick &&
    !humanHasPlayedSecondTrick &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  const highlightPreguntesSecondTrick =
    isFirstOfPairSecondTrick && hasThreeOr7Oros && !preguntesDismissed;
  if (highlightPreguntesSecondTrick) {
    highlightedPhraseIds.add("portes-un-tres");
  }
  // 2a baza: NO hem guanyat la 1a baza i sóc el primer de la meua parella
  // en tirar. Si tinc alguna carta top (3 o manilla), destaquem
  // "Preguntes" i "Tens més d'un tres?" / "Puc anar a tu?".
  const highlightPreguntesSecondTrickLost =
    r.phase === "playing" &&
    r.tricks.length === 2 &&
    !!secondTrick0 &&
    !wonFirstTrick &&
    r.turn === HUMAN &&
    !partnerHasPlayedSecondTrick &&
    !humanHasPlayedSecondTrick &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending" &&
    hasGoodCardHL &&
    !preguntesDismissed;
  if (highlightPreguntesSecondTrickLost) {
    highlightedPhraseIds.add("tens-mes-dun-tres");
    highlightedPhraseIds.add("puc-anar");
  }
  const highlightPreguntesEffective =
    highlightPreguntes ||
    opponentEnvitPending ||
    highlightPreguntesSecondTrick ||
    highlightPreguntesSecondTrickLost;

  const partnerHasPlayedFirstTrick = !!firstTrick0?.cards.some((tc) => tc.player === PARTNER);
  const humanHasPlayedFirstTrick = !!firstTrick0?.cards.some((tc) => tc.player === HUMAN);
  // Suppression sincrònica: quan a la 1a baza el PRIMER de la nostra
  // parella ja ha tirat la seua carta, qualsevol ressaltat del botó
  // "Respostes" originat per una pregunta prèvia del company ha de
  // desaparéixer immediatament en el mateix render (sense esperar
  // l'efecte que neteja `respostesPending`). El mateix s'aplica si jo sóc
  // el 1r de la parella i ja he tirat. Una nova circumstància (ser
  // l'últim de la parella, una nova pregunta posterior, etc.) podrà
  // tornar a activar el ressaltat.
  const firstOfPairPlayedFirstTrickSync =
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    ((humanIsSecondOfPairHL && partnerHasPlayedFirstTrick) ||
      (!humanIsSecondOfPairHL && humanHasPlayedFirstTrick));
  const highlightRespostes = respostesPending && !firstOfPairPlayedFirstTrickSync;
  // Sóc l'últim de la meua parella en tirar a la 1a baza: el meu company
  // ja ha jugat, jo encara no, és el meu torn i no hi ha envit/truc pendent.
  const isLastInPairFirstTrick =
    r.phase === "playing" &&
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    partnerHasPlayedFirstTrick &&
    !humanHasPlayedFirstTrick &&
    r.turn === HUMAN &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  const highlightRespostesLastInPair = isLastInPairFirstTrick && !respostesLastInPairDismissed;
  // Suprimim qualsevol highlight de "Respostes" quan sóc el PRIMER de la
  // meua parella a la 1a baza (ja he tirat) i és el torn del meu company
  // (2n de la parella, encara no ha tirat). En aquest moment no hi ha res
  // a respondre per la meua part, així que el botó no s'ha de destacar.
  const suppressRespostesFirstOfPairPartnerTurn =
    r.phase === "playing" &&
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    humanHasPlayedFirstTrick &&
    !partnerHasPlayedFirstTrick &&
    r.turn === PARTNER;
  const highlightRespostesEffective =
    // Si el company ens ha fet una pregunta, sempre destaquem "Respostes",
    // encara que normalment se suprimiria (p. ex. quan és el seu torn).
    highlightRespostes ||
    (!suppressRespostesFirstOfPairPartnerTurn && highlightRespostesLastInPair);
  const highlightAltres =
    r.phase === "playing" &&
    r.tricks.length === 1 &&
    humanHasPlayedFirstTrick &&
    !partnerHasPlayedFirstTrick &&
    r.turn === PARTNER &&
    r.envitState.kind === "none" &&
    !r.envitResolved &&
    r.trucState.kind !== "pending" &&
    playerTotalEnvit(r, HUMAN) >= 30 &&
    !altresDismissed;
  if (highlightAltres) {
    highlightedPhraseIds.add("envida");
  }

  // Sóc el SEGON de la meua parella en tirar a la 1a baza, i és el torn
  // del meu company (encara no ha jugat). Destaquem "Respostes" i la
  // resposta concreta segons les meues cartes.
  const humanDistFromMano = (HUMAN - r.mano + 4) % 4;
  const partnerDistFromMano = (PARTNER - r.mano + 4) % 4;
  const humanIsSecondOfPair = humanDistFromMano > partnerDistFromMano;
  const isPartnerTurnFirstTrick =
    (r.phase === "envit" || r.phase === "playing") &&
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    humanIsSecondOfPair &&
    !partnerHasPlayedFirstTrick &&
    !humanHasPlayedFirstTrick &&
    r.turn === PARTNER &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  const highlightRespostes2nd = isPartnerTurnFirstTrick && !respostes2ndDismissed;
  // Si el company ja ha tirat (i jo encara no), tampoc destaquem
  // "Respostes" via el flux de "darrer de la parella": el ressaltat ha de
  // desaparèixer en quant el company tire o jo envie la resposta.
  // Quan el primer de la meua parella tire la seua carta a la 1a baza,
  // s'ha de quitar el resalte del botó "Respostes" i de qualsevol opció
  // destacada, fins que es done una nova circumstància que el reactive.
  // Cobrim tant el cas en què sóc 2n de la parella i el company (1r de
  // la parella) ja ha jugat, com el cas en què jo sóc el 1r de la parella
  // i ja he jugat la meua carta.
  const firstOfPairPlayedFirstTrick =
    r.tricks.length === 1 &&
    !!firstTrick0 &&
    ((humanIsSecondOfPair && partnerHasPlayedFirstTrick) ||
      (!humanIsSecondOfPair && humanHasPlayedFirstTrick));
  useEffect(() => {
    if (firstOfPairPlayedFirstTrick) {
      setRespostesLastInPairDismissed(true);
      setRespostes2ndDismissed(true);
      setRespostesPending(false);
      respostesAnchorRef.current = null;
    }
  }, [firstOfPairPlayedFirstTrick]);
  if (highlightRespostes2nd) {
    const myHand = myHandForHL;
    // Carta més alta ja jugada en aquesta baza (per qualsevol jugador).
    const playedHere = firstTrick0?.cards ?? [];
    const maxPlayedStr = playedHere.length > 0
      ? Math.max(...playedHere.map((tc) => cardStrength(tc.card)))
      : -1;
    const myMaxStr = myHand.length > 0
      ? Math.max(...myHand.map((c) => cardStrength(c)))
      : -1;
    // No podem guanyar a la carta ja jugada.
    const cantBeatPlayed = maxPlayedStr >= 0 && myMaxStr <= maxPlayedStr;

    // Té As espases, As bastos o 7 espases → "Vine a mi!".
    const hasVineCard = myHand.some(
      (c) =>
        (c.rank === 1 && (c.suit === "espases" || c.suit === "bastos")) ||
        (c.rank === 7 && c.suit === "espases"),
    );
    // Té 7 d'espases o 7 d'oros (manilla "menor") sense cap dels asos top
    // (As d'espases / As de bastos): destaquem també "Algo tinc" perquè
    // l'humà puga avisar el company que té carta de truc però no top.
    const has7Manilla = myHand.some(
      (c) => c.rank === 7 && (c.suit === "espases" || c.suit === "oros"),
    );
    const hasTopAce2nd = myHand.some(
      (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
    );
    if (cantBeatPlayed) {
      highlightedPhraseIds.add("a-tu");
    } else if (hasVineCard) {
      highlightedPhraseIds.add("vine-a-mi");
    } else if (hasManillaHL) {
      // Carta top (7 d'oros) sense les més fortes: "Algo tinc".
      highlightedPhraseIds.add("tinc-bona");
    } else if (hasThreeHL) {
      highlightedPhraseIds.add("tinc-un-tres");
    } else {
      highlightedPhraseIds.add("a-tu");
    }
    if (has7Manilla && !hasTopAce2nd && !cantBeatPlayed) {
      highlightedPhraseIds.add("tinc-bona");
    }
  }

  // Si el company ens ha fet una pregunta ("Què tens?" o "Puc anar a tu?")
  // i sóc el segon de la meua parella en tirar a la 1a baza, destaquem la
  // resposta adient si tinc 7 d'espases o 7 d'oros i NO tinc cap dels
  // asos top (As d'espases / As de bastos):
  //   - "Què tens?"      → "Algo tinc"
  //   - "Puc anar a tu?" → "Vine a vore!"
  if (
    respostesPending &&
    !firstOfPairPlayedFirstTrickSync &&
    humanIsSecondOfPair &&
    r.tricks.length === 1 &&
    !humanHasPlayedFirstTrick
  ) {
    const lastPartnerMsg = [...messages]
      .reverse()
      .find((m) => m.player === PARTNER);
    const lastPartnerPhrase = lastPartnerMsg
      ? PHRASES.find((p) => p.id === lastPartnerMsg.phraseId)
      : undefined;
    const qid = lastPartnerPhrase?.category === "pregunta"
      ? lastPartnerMsg!.phraseId
      : undefined;
    const myHandQ = myHandForHL;
    const has7ManillaQ = myHandQ.some(
      (c) => c.rank === 7 && (c.suit === "espases" || c.suit === "oros"),
    );
    const hasTopAceQ = myHandQ.some(
      (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
    );
    if (qid === "puc-anar" && has7ManillaQ) {
      highlightedPhraseIds.add("vine-a-vore");
    }
    if (has7ManillaQ && !hasTopAceQ) {
      if (qid === "que-tens") highlightedPhraseIds.add("tinc-bona");
    }
  }

  // Cobertura general: si el company ens acaba de preguntar "Puc anar a tu?"
  // (en qualsevol baza i en qualsevol modalitat — local contra bots o
  // online contra humans) i tenim el 7 d'oros o el 7 d'espases (manilla),
  // sempre destaquem la resposta "Vine a vore!". El bloc anterior només
  // cobria la 1a baza quan jo era el 2n de la parella; aquest cas és
  // independent d'eixes restriccions.
  if (respostesPending) {
    const lastPartnerMsg2 = [...messages]
      .reverse()
      .find((m) => m.player === PARTNER);
    const lastPartnerPhrase2 = lastPartnerMsg2
      ? PHRASES.find((p) => p.id === lastPartnerMsg2.phraseId)
      : undefined;
    const qid2 = lastPartnerPhrase2?.category === "pregunta"
      ? lastPartnerMsg2!.phraseId
      : undefined;
    if (qid2 === "puc-anar") {
      const has7ManillaAny = myHandForHL.some(
        (c) => c.rank === 7 && (c.suit === "espases" || c.suit === "oros"),
      );
      const hasTopAceAny = myHandForHL.some(
        (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
      );
      if (has7ManillaAny && !hasTopAceAny) {
        highlightedPhraseIds.add("vine-a-vore");
      }
    }
  }

  // 2a baza: hem guanyat la 1a baza, sóc el SEGON de la meua parella en
  // tirar i és el torn del meu company (primer de la parella, encara no ha
  // jugat). Si em queda un 3, destaquem "Respostes" i "Vine al meu 3!" /
  // "Vine a mi!".
  const isPartnerTurnSecondTrick =
    r.phase === "playing" &&
    r.tricks.length === 2 &&
    !!secondTrick0 &&
    wonFirstTrick &&
    !partnerHasPlayedSecondTrick &&
    !humanHasPlayedSecondTrick &&
    r.turn === PARTNER &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  const highlightRespostes2ndTrick =
    isPartnerTurnSecondTrick && hasThreeHL && !respostes2ndDismissed;
  if (highlightRespostes2ndTrick) {
    highlightedPhraseIds.add("vine-al-meu-tres");
    highlightedPhraseIds.add("vine-a-mi");
  }

  // 2a baza, NO hem guanyat la 1a, és el torn del company (primer de la
  // parella, encara no ha jugat) i jo encara no he jugat: si em queda
  // alguna carta top (manilla/as), destaquem "Vine a mi!"; si no tinc ni
  // un 3 ni cap carta top, destaquem "A tu!".
  const isPartnerTurnSecondTrickLost =
    r.phase === "playing" &&
    r.tricks.length === 2 &&
    !!secondTrick0 &&
    !wonFirstTrick &&
    !partnerHasPlayedSecondTrick &&
    !humanHasPlayedSecondTrick &&
    r.turn === PARTNER &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  const highlightRespostes2ndTrickLost =
    isPartnerTurnSecondTrickLost && !respostes2ndDismissed &&
    (hasManillaHL || (!hasThreeHL && !hasManillaHL));
  if (isPartnerTurnSecondTrickLost && !respostes2ndDismissed) {
    if (hasManillaHL) {
      highlightedPhraseIds.add("vine-a-mi");
    } else if (!hasThreeHL) {
      highlightedPhraseIds.add("a-tu");
    }
  }

  // 2a baza: el meu company ja ha jugat i jo sóc el SEGON de la parella
  // a tirar (és el meu torn). Destaquem la resposta més adient segons la
  // meua mà:
  //  - As d'espases o As de bastos → "Vine a mi!".
  //  - 7 d'oros o 7 d'espases     → "Algo tinc".
  //  - 3                          → "Tinc un 3".
  //  - sense res ni que guanye    → "No tinc res" + "A tu!".
  const isSecondInPairSecondTrick =
    r.phase === "playing" &&
    r.tricks.length === 2 &&
    !!secondTrick0 &&
    partnerHasPlayedSecondTrick &&
    !humanHasPlayedSecondTrick &&
    r.turn === HUMAN &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending";
  if (isSecondInPairSecondTrick) {
    const myHand2 = myHandForHL;
    const hasAceTop = myHand2.some(
      (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
    );
    const hasSeven = myHand2.some(
      (c) => c.rank === 7 && (c.suit === "oros" || c.suit === "espases"),
    );
    const playedInSecond = cardsInSecondTrick;
    const maxPlayedStr2 = playedInSecond.length > 0
      ? Math.max(...playedInSecond.map((tc) => cardStrength(tc.card)))
      : -1;
    const myMaxStr2 = myHand2.length > 0
      ? Math.max(...myHand2.map((c) => cardStrength(c)))
      : -1;
    const cantBeatPlayed2 = maxPlayedStr2 >= 0 && myMaxStr2 <= maxPlayedStr2;
    const noGood = !hasThreeHL && !hasManillaHL;
    if (hasAceTop) highlightedPhraseIds.add("vine-a-mi");
    if (hasSeven && !hasAceTop) highlightedPhraseIds.add("tinc-bona");
    if (hasThreeHL && !hasAceTop && !hasSeven) highlightedPhraseIds.add("tinc-un-tres");
    if (noGood) highlightedPhraseIds.add("no-tinc-res");
    if (cantBeatPlayed2 || noGood) highlightedPhraseIds.add("a-tu");
  }

  // Amaga les frases d'envit del ChatPanel quan: l'envit ja s'ha cantat
  // (resolt o pendent), quan ja no estem a la 1a baza, o quan el truc ja
  // s'ha "volgut" (acceptat) — després de voler el truc no es pot envidar.
  const envitPhrasesHidden =
    r.envitResolved ||
    r.envitState.kind !== "none" ||
    r.tricks.length > 1 ||
    r.trucState.kind === "accepted";

  // Amaga respostes "fortes" del ChatPanel quan la mà del jugador no
  // permet dir-les sincerament. Es basa en les cartes que li queden.
  const myRemaining = r.hands[HUMAN] ?? [];
  const hasThree = myRemaining.some((c) => c.rank === 3);
  // Cartes que justifiquen sincerament dir "Algo tinc": as d'espases,
  // as de bastos, 7 d'espases o 7 d'oros (les "manilles" de l'envit/joc
  // sense comptar el 3).
  const hasManilla = myRemaining.some(
    (c) =>
      (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
      (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
  );
  const hasGoodCard = hasThree || hasManilla;
  const hiddenResponseIds = new Set<ChatPhraseId>();
  if (envitPhrasesHidden) {
    ENVIT_PHRASE_IDS.forEach((id) => hiddenResponseIds.add(id));
  }
  // Excepció: si l'equip contrari acaba d'envidar i l'humà té 30-33 punts
  // d'envit, mostrem "Vols tornar a envidar?" perquè puga consultar el
  // company. S'ocultarà automàticament en quant es resolga l'envit.
  if (opponentEnvitPending) {
    hiddenResponseIds.delete("vols-tornar-envidar");
  }
  // (S'ha eliminat el botó combinat "Envidar i Truc!". Ara el flux per
  // a fer envidar el company és simplement la indicació "Envida!", i
  // per fer-li trucar la nova indicació "Truca!".)
  if (!hasGoodCard) {
    hiddenResponseIds.add("vine-a-mi");
    hiddenResponseIds.add("tinc-bona");
    hiddenResponseIds.add("tinc-un-tres");
    hiddenResponseIds.add("vine-a-vore");
    hiddenResponseIds.add("vine-al-meu-tres");
  } else {
    // Si encara em queda alguna carta bona (3, 7 oros, 7 espases, As bastos
    // o As espases), no és sincer dir "No tinc res!" — l'amaguem.
    hiddenResponseIds.add("no-tinc-res");
    if (!hasThree) {
      hiddenResponseIds.add("tinc-un-tres");
      hiddenResponseIds.add("vine-al-meu-tres");
    }
    // "Algo tinc" només té sentit si em queda una manilla (as d'espases,
    // as de bastos, 7 d'espases o 7 d'oros). Tenir només un 3 no compta.
    if (!hasManilla) {
      hiddenResponseIds.add("tinc-bona");
    }
    // "Vine a vore!" en la 1a baza només té sentit si tinc una manilla
    // (7 d'oros, 7 d'espases, As bastos o As espases). Si l'única carta
    // bona que em queda és un 3, no és apropiat demanar al company que
    // vinga: l'amaguem. En canvi, en la 2a/3a baza amb la 1a guanyada,
    // "Vine a vore!" sí pot tindre sentit amb només un 3 (per coordinar
    // empardar la baza), així que no s'amaga en eixe cas.
    if (!hasManilla && r.tricks.length === 1) {
      hiddenResponseIds.add("vine-a-vore");
    }
    // Si tinc l'As de bastos o l'As d'espases, no té sentit dir "Vine a vore!":
    // ja puc guanyar la baza directament. L'amaguem sempre.
    const hasTopAce = myRemaining.some(
      (c) => c.rank === 1 && (c.suit === "bastos" || c.suit === "espases"),
    );
    if (hasTopAce) {
      hiddenResponseIds.add("vine-a-vore");
    }
  }

  const handleSay = (phraseId: ChatPhraseId) => {
    if (phraseId === "envida") setAltresDismissed(true);
    const sentPhrase = PHRASES.find((p) => p.id === phraseId);
    if (sentPhrase?.category === "pregunta") setPreguntesDismissed(true);
    if (sentPhrase?.category === "resposta") {
      setRespostesPending(false);
      respostesAnchorRef.current = null;
      setRespostesLastInPairDismissed(true);
      setRespostes2ndDismissed(true);
    }
    onSay(phraseId);
  };

  const nameBottom = seatNames?.bottom ?? t("common.you");
  const nameLeft = seatNames?.left ?? t("common.bot_left");
  const nameTop = seatNames?.top ?? t("common.partner");
  const nameRight = seatNames?.right ?? t("common.bot_right");

  const boardRootRef = useRef<HTMLElement | null>(null);
  useFreezeSubtreeAnimations(boardRootRef, paused);

  return (
    <main ref={boardRootRef} data-paused={paused ? "true" : undefined} className="min-h-screen flex flex-col relative pt-5">
      {paused && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 pointer-events-auto" style={{ zIndex: TRUC_Z_INDEX.pauseOverlay }}>
          <Pause className="w-16 h-16 text-primary" />
          <p className="text-2xl font-semibold text-foreground">{t("match.paused")}</p>
          {onPauseToggle && (
            <Button
              onClick={() => onPauseToggle(false)}
              variant="outline"
              className="border-primary/60 text-primary hover:bg-primary/10"
            >
              <Play className="w-4 h-4 mr-2" /> {t("match.resume")}
            </Button>
          )}
        </div>
      )}
      <div className="relative px-[18px] pt-0 flex items-center gap-2">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Button
            onClick={(event) => {
              blurAfterPress(event);
              // Toggle de so via lib/speech.
              import("@/lib/speech").then(({ toggleMuted }) => {
                setMuted(toggleMuted());
              });
            }}
            size="sm"
            variant="outline"
            className={cn(
               gameTopButtonBaseClass,
               muted ? gameTopButtonDestructiveClass : gameTopButtonPrimaryClass,
            )}
            aria-label={muted ? t("match.sound_on") : t("match.sound_off")}
            title={muted ? t("match.sound_on") : t("match.sound_off")}
          >
            {muted ? <VolumeOff className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button
            onClick={(event) => {
              blurAfterPress(event);
              onNewGame();
            }}
            size="sm"
            variant="outline"
            className={cn(gameTopButtonBaseClass, gameTopButtonPrimaryClass)}
            aria-label={t("match.new_game")}
            title={t("match.new_game")}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>


        </div>
        <div className="flex-1 flex justify-center min-w-0 mt-[13px]">
          <HorizontalScoreboard
            targetCama={match.targetCama}
            targetCames={match.targetCames}
            scores={displayedScores}
            camesWon={displayedCames}
            toasts={scoreToasts}
          />
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Button
            onClick={(event) => {
              blurAfterPress(event);
              setConfirmAbandon(true);
            }}
            size="sm"
            variant="outline"
            className={cn(gameTopButtonBaseClass, gameTopButtonDestructiveClass)}
            aria-label={t("match.abandon")}
            title={t("match.abandon")}
          >
            <LogOut className="w-4 h-4" />
          </Button>
          {onPauseToggle && (
            <Button
              onClick={(event) => {
                blurAfterPress(event);
                onPauseToggle(!paused);
              }}
              size="sm"
              variant="outline"
              className={cn(gameTopButtonBaseClass, gameTopButtonPrimaryClass)}
              aria-label={paused ? t("match.resume_match") : t("match.pause")}
              title={paused ? t("match.resume_match") : t("match.pause")}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative mt-[35px] mb-1 mx-2 min-h-[480px]">
        {(() => {
          // Construïm el centerOverlay (carteles "Vull"/"No vull"/"Truc"/...
          // centrats exactament al centre del felt) per passar-lo al
          // TableSurface, que el renderitza dins del propi felt el·líptic.
          // Així el centre coincideix amb el centre real del tauler de joc
          // i no amb el centre del contenidor flex extern.
          const list: Array<{ what: string; labelOverride?: string; player?: PlayerId }> =
            shoutFlashes && shoutFlashes.length > 0
              ? shoutFlashes
              : (shoutFlash ? [shoutFlash] : []);
          const currentFlash = list[0];
          const tailFor = (p?: PlayerId): "top" | "bottom" | "left" | "right" | undefined => {
            if (p === undefined) return undefined;
            if (p === HUMAN) return "bottom";
            if (p === RIGHT) return "right";
            if (p === PARTNER) return "top";
            if (p === LEFT) return "left";
            return undefined;
          };
          const overlay = currentFlash ? (
            <ShoutBubble
              key={`${currentFlash.player ?? "?"}-${currentFlash.what}`}
              what={currentFlash.what as ShoutKind}
              labelOverride={currentFlash.labelOverride}
              tailDirection={tailFor(currentFlash.player)}
              className="!relative !left-auto !top-auto !translate-x-0 !translate-y-0"
            />
          ) : null;
          return (
            <TableSurface
              match={collectingVisualMatch ?? match}
              perspectiveSeat={perspectiveSeat}
              hiddenCardIds={undefined}
              hideAllPlayedCards={collectOverlayReady}
              centerOverlay={overlay}
            />
          );
        })()}

        {envitRevealActive && envitRevealWinner && (
          <EnvitReveal
            match={match}
            perspectiveSeat={perspectiveSeat}
            winnerTeam={envitRevealWinner}
            paused={paused}
          />
        )}

        {dealing && dealKey && (
          <DealAnimation
            dealKey={dealKey}
            dealer={match.dealer}
            mano={r.mano}
            perspectiveSeat={perspectiveSeat}
            onCardLanded={(player, idx) =>
              setRevealedCount((prev) => ({
                ...prev,
                [player]: Math.max(prev[player], idx + 1),
              }))
            }
            onComplete={() => {
              setDealing(false);
              setRevealedCount({ 0: 3, 1: 3, 2: 3, 3: 3 });
              dealingHandsRef.current = null;
              if (dealKey) onDealAnimationEnd?.(dealKey);
            }}
          />
        )}

        {collecting && collectKey && (
          <CollectAnimation
            collectKey={collectKey}
            cards={collectItems}
            dealerX={collectDealerXY.x}
            dealerY={collectDealerXY.y}
            onReady={() => setCollectOverlayReady(true)}
            onComplete={() => {
              setCollecting(false);
              setCollectOverlayReady(false);
              // En lloc de repartir directament, encadenem el "pase" del
              // mazo cap al nou repartidor. El watchdog garanteix que si
              // alguna cosa falla, igualment es comencen a repartir.
              const newDealer = pendingDealerRef.current;
              if (newDealer != null) {
                setRevealedCount({ 0: 0, 1: 0, 2: 0, 3: 0 });
                setPassDealer(newDealer);
                setPassKey(`pass-${collectKey}`);
                setPassing(true);
              } else {
                const pendingKey = pendingDealKeyRef.current;
                pendingDealKeyRef.current = null;
                if (pendingKey) startDealingRef.current(pendingKey);
              }
            }}
          />
        )}

        {passing && passKey && (
          <PassDeckAnimation
            passKey={passKey}
            dealer={passDealer}
            perspectiveSeat={perspectiveSeat}
            onComplete={() => {
              setPassing(false);
              const pendingKey = pendingDealKeyRef.current;
              pendingDealKeyRef.current = null;
              pendingDealerRef.current = null;
              if (pendingKey) startDealingRef.current(pendingKey);
            }}
          />
        )}

        <div className="absolute left-1 bottom-[37px] z-30">
          <TricksWonIndicator match={match} />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10" style={{ top: "20px" }} data-deck-anchor={PARTNER}>
          <HiddenHand
            count={Math.max(0, collectOverlayReady ? 0 : ((dealing || passing) ? Math.min(revealedCount[PARTNER], 3) : handsView[PARTNER].length))}
            cards={handsView[PARTNER]}
            player={PARTNER}
          />
        </div>
        <div className="absolute top-12 left-1/2 -translate-y-1/2 -translate-x-full z-50" style={{ marginLeft: "-55px", marginTop: "-30px" }}>
          <div className="relative">
            <PlayerSeat player={PARTNER} match={match} position="top" name={nameTop} isPendingResponder={isPendingResponder(PARTNER)} presence={presenceFor(PARTNER)} presenceLastSeen={presenceLastSeenFor(PARTNER)} avatarUrl={avatarFor(PARTNER)} />
            {messages.find((m) => m.player === PARTNER) && (
              <ChatBubble
                phraseId={messages.find((m) => m.player === PARTNER)!.phraseId}
                vars={messages.find((m) => m.player === PARTNER)!.vars}
                position="top"
              />
            )}
            {/* Cartell d'envit (sempre amunt). Persisteix fins la nova mà. */}
            {envitShoutByPlayer?.[PARTNER] && (
              <div className="absolute top-[-17px] left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={envitShoutByPlayer[PARTNER] as ShoutKind}
                    labelOverride={envitShoutLabelByPlayer?.[PARTNER] ?? undefined}
                    quiet={(() => { const _o = effectiveEnvitOutcome(PARTNER); return !!_o && _o !== "pending"; })()}
                  />
                  {(() => { const _o = effectiveEnvitOutcome(PARTNER); return _o ? (
                    <EnvitOutcomeMark
                      outcome={_o}
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-0"
                    />
                  ) : null; })()}
                </div>
              </div>
            )}
            {/* Cartell de truc (sempre avall). */}
            {lastShoutByPlayer[PARTNER] && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={lastShoutByPlayer[PARTNER] as ShoutKind}
                    labelOverride={shoutLabelByPlayer[PARTNER] ?? undefined}
                    quiet={effectiveAcceptedShout(PARTNER)}
                  />
                  {effectiveAcceptedShout(PARTNER) && (
                    <EnvitOutcomeMark
                      outcome="volgut"
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-[-4px]"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="absolute left-1 top-[42%] -translate-y-1/2 z-10" data-deck-anchor={LEFT}>
          <HiddenHand
            count={Math.max(0, collectOverlayReady ? 0 : ((dealing || passing) ? Math.min(revealedCount[LEFT], 3) : handsView[LEFT].length))}
            direction="vertical"
            cards={handsView[LEFT]}
            player={LEFT}
          />
        </div>
        <div className="absolute left-1 top-[42%] z-50" style={{ marginTop: "55px" }}>
          <div className="relative">
            <PlayerSeat player={LEFT} match={match} position="left" name={nameLeft} isPendingResponder={isPendingResponder(LEFT)} presence={presenceFor(LEFT)} presenceLastSeen={presenceLastSeenFor(LEFT)} avatarUrl={avatarFor(LEFT)} />
            {messages.find((m) => m.player === LEFT) && (
              <ChatBubble
                phraseId={messages.find((m) => m.player === LEFT)!.phraseId}
                vars={messages.find((m) => m.player === LEFT)!.vars}
                position="bottom-left"
              />
            )}
            {envitShoutByPlayer?.[LEFT] && (
              <div className="absolute top-[-17px] left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={envitShoutByPlayer[LEFT] as ShoutKind}
                    labelOverride={envitShoutLabelByPlayer?.[LEFT] ?? undefined}
                    quiet={(() => { const _o = effectiveEnvitOutcome(LEFT); return !!_o && _o !== "pending"; })()}
                  />
                  {(() => { const _o = effectiveEnvitOutcome(LEFT); return _o ? (
                    <EnvitOutcomeMark
                      outcome={_o}
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-0"
                    />
                  ) : null; })()}
                </div>
              </div>
            )}
            {lastShoutByPlayer[LEFT] && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={lastShoutByPlayer[LEFT] as ShoutKind}
                    labelOverride={shoutLabelByPlayer[LEFT] ?? undefined}
                    quiet={effectiveAcceptedShout(LEFT)}
                  />
                  {effectiveAcceptedShout(LEFT) && (
                    <EnvitOutcomeMark
                      outcome="volgut"
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-[-4px]"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="absolute right-1 top-[42%] z-50" style={{ transform: "translateY(-100%)", marginTop: "-55px" }}>
          <div className="relative">
            <PlayerSeat player={RIGHT} match={match} position="right" name={nameRight} isPendingResponder={isPendingResponder(RIGHT)} presence={presenceFor(RIGHT)} presenceLastSeen={presenceLastSeenFor(RIGHT)} avatarUrl={avatarFor(RIGHT)} />
            {messages.find((m) => m.player === RIGHT) && (
              <ChatBubble
                phraseId={messages.find((m) => m.player === RIGHT)!.phraseId}
                vars={messages.find((m) => m.player === RIGHT)!.vars}
                position="bottom-right"
              />
            )}
            {envitShoutByPlayer?.[RIGHT] && (
              <div className="absolute top-[-17px] left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={envitShoutByPlayer[RIGHT] as ShoutKind}
                    labelOverride={envitShoutLabelByPlayer?.[RIGHT] ?? undefined}
                    quiet={(() => { const _o = effectiveEnvitOutcome(RIGHT); return !!_o && _o !== "pending"; })()}
                  />
                  {(() => { const _o = effectiveEnvitOutcome(RIGHT); return _o ? (
                    <EnvitOutcomeMark
                      outcome={_o}
                      className="absolute right-full top-1/2 -translate-y-1/2 mr-0"
                    />
                  ) : null; })()}
                </div>
              </div>
            )}
            {lastShoutByPlayer[RIGHT] && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="relative inline-block">
                  <ShoutBadge
                    what={lastShoutByPlayer[RIGHT] as ShoutKind}
                    labelOverride={shoutLabelByPlayer[RIGHT] ?? undefined}
                    quiet={effectiveAcceptedShout(RIGHT)}
                  />
                  {effectiveAcceptedShout(RIGHT) && (
                    <EnvitOutcomeMark
                      outcome="volgut"
                      className="absolute right-full top-1/2 -translate-y-1/2 mr-[-4px]"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="absolute right-1 top-[42%] -translate-y-1/2 z-10" data-deck-anchor={RIGHT}>
          <HiddenHand
            count={Math.max(0, collectOverlayReady ? 0 : ((dealing || passing) ? Math.min(revealedCount[RIGHT], 3) : handsView[RIGHT].length))}
            direction="vertical"
            cards={handsView[RIGHT]}
            player={RIGHT}
          />
        </div>

      </div>

      <div
        className="px-2 pt-1 pb-[calc(0.5rem+20px)] bg-background/40 border-t-2 border-primary/30 relative mt-[-35px]"
        style={{ zIndex: TRUC_Z_INDEX.tableActions }}
      >
        <div className="w-full min-h-[20px] flex flex-wrap justify-center items-center gap-1 mb-1 relative">
          {!gameEnded && shoutActions.length > 0 && shoutActions.map((a) => {
            // Si l'humà és "primer de la pareja" (en l'ordre de tirada
            // d'aquesta mà juga abans que el seu company), el botó "Envit!"
            // mostra l'etiqueta "Envit i truca!". L'obligació de cantar
            // truc després de resoldre's l'envit s'aplica al hook
            // useTrucMatch (auto-dispatch).
            const humanDistFromMano = (HUMAN - r.mano + 4) % 4;
            const partnerDistFromMano = (partnerOf(HUMAN) - r.mano + 4) % 4;
            const humanIsFirstOfPair = humanDistFromMano < partnerDistFromMano;

            // "Truc i passe!" per als 3 primers jugadors de la primera
            // baza, mentre no hi haja envit en joc ni resolt. Si l'envit
            // ja s'ha cantat (en joc o resolt), o si l'humà és el peu del
            // seu equip, el botó torna a ser "Truc!".
            const isTrucCall =
              a.what === "truc" || a.what === "retruc" ||
              a.what === "quatre" || a.what === "joc-fora";
            const firstTrick = r.tricks[0];
            const cardsPlayedFirstTrick = firstTrick ? firstTrick.cards.length : 0;
            const isFirstTrickCall =
              r.tricks.length <= 1 && cardsPlayedFirstTrick < 3;
            const envitResolvedOrInPlay =
              r.envitState.kind !== "none" ||
              r.log.some((ev) => ev.type === "shout" && (
                ev.what === "envit" || ev.what === "renvit" || ev.what === "falta-envit"
              ));
            const peuManoTeam = ((r.mano + 2) % 4) as PlayerId;
            const peuOtherTeam = ((r.mano + 3) % 4) as PlayerId;
            const humanIsPeu = HUMAN === peuManoTeam || HUMAN === peuOtherTeam;
            const trucPasseBase: Record<string, string> = {
              truc: translate("shout.truc_passe"),
              retruc: translate("shout.retruc_passe"),
              quatre: translate("shout.quatre_passe"),
              "joc-fora": translate("shout.joc_fora_passe"),
            };
            const trucPasseLabel =
              isTrucCall && isFirstTrickCall && !envitResolvedOrInPlay && !humanIsPeu
                ? trucPasseBase[a.what]
                : undefined;

            const labelOverride =
              a.what === "envit" && humanIsFirstOfPair
                ? translate("shout.envit_truc")
                : trucPasseLabel;
            const humanIsSecondOfPairBtn = humanDistFromMano > partnerDistFromMano;
            const noEnvitYet =
              r.envitState.kind === "none" &&
              !r.envitResolved &&
              !r.log.some((ev) => ev.type === "shout" && (
                ev.what === "envit" || ev.what === "renvit" || ev.what === "falta-envit"
              ));
            const suggestEnvit =
              a.what === "envit" &&
              r.tricks.length === 1 &&
              humanIsSecondOfPairBtn &&
              noEnvitYet &&
              playerTotalEnvit(r, HUMAN) >= 30;

            // 3a baza: suggerim cantar Truc/Retruc/Quatre val/Joc fora si la
            // nostra carta guanya segur el truc (bat les jugades a la 3a i
            // les que queden per jugar de la resta de jugadors), o emparda
            // amb la millor i ja hem guanyat la 1a baza.
            let suggestTruc3rd = false;
            if (isTrucCall && r.phase === "playing" && r.tricks.length === 3) {
              const trick3 = r.tricks[2];
              const cards3 = trick3?.cards ?? [];
              const humanPlayed3 = cards3.some((tc) => tc.player === HUMAN);
              const myCard3 = (r.hands[HUMAN] ?? [])[0];
              if (trick3 && myCard3 && !humanPlayed3) {
                const playedIds = new Set(cards3.map((tc) => tc.card.id));
                const otherCards: { rank: number; suit: string; id: string }[] = [];
                for (const tc of cards3) otherCards.push(tc.card);
                for (const pid of [0, 1, 2, 3] as PlayerId[]) {
                  if (pid === HUMAN) continue;
                  for (const c of r.hands[pid] ?? []) {
                    if (!playedIds.has(c.id)) otherCards.push(c);
                  }
                }
                const myStr = cardStrength(myCard3);
                const maxOther = otherCards.length
                  ? Math.max(...otherCards.map((c) => cardStrength(c as never)))
                  : -1;
                const isLast3rd = cards3.length === 3;
                const maxPlayed3 = cards3.length
                  ? Math.max(...cards3.map((tc) => cardStrength(tc.card)))
                  : -1;
                if (myStr > maxOther) suggestTruc3rd = true;
                else if (isLast3rd && myStr === maxPlayed3 && wonFirstTrick) suggestTruc3rd = true;
                // Si no hem guanyat la 1a baza i l'única carta que ens queda
                // és un 3, no destaquem Truc: encara que el 3 puga guanyar
                // la 3a baza, no garanteix el truc i no volem suggerir-lo.
                if (suggestTruc3rd && !wonFirstTrick && myCard3.rank === 3) {
                  suggestTruc3rd = false;
                }
              }
            }

            // Renvit suggerit: el rival ha cantat envit i estem pendents
            // de respondre. Si tenim 33, o tenim 32 i som el primer de la
            // parella en tirar a la 1a baza, destaquem "Torne a envidar!".
            const humanTeam: TeamId = HUMAN % 2 === 0 ? "nos" : "ells";
            let suggestRenvit = false;
            if (a.what === "renvit" &&
                r.envitState.kind === "pending" &&
                r.envitState.awaitingTeam === humanTeam) {
              const myEnv = playerTotalEnvit(r, HUMAN);
              if (myEnv >= 33) suggestRenvit = true;
              else if (myEnv === 32 && r.tricks.length === 1 && humanIsFirstOfPair) suggestRenvit = true;
            }

            // "No vull" suggerit a envit: rival ha envidat i tenim <= 29.
            let suggestNoVullEnvit = false;
            if (a.what === "no-vull" &&
                r.envitState.kind === "pending" &&
                r.envitState.awaitingTeam === humanTeam) {
              const myEnv = playerTotalEnvit(r, HUMAN);
              if (myEnv <= 29) suggestNoVullEnvit = true;
            }

            // "No vull" suggerit a truc: rival ha trucat i la nostra mà
            // és dèbil.
            let suggestNoVullTruc = false;
            if (a.what === "no-vull" &&
                r.trucState.kind === "pending" &&
                r.trucState.awaitingTeam === humanTeam) {
              const myHand = r.hands[HUMAN] ?? [];
              const hasTop = myHand.some((c) => cardStrength(c) >= 85);
              const hasThree = myHand.some((c) => c.rank === 3);
              const tricksWonByUs = r.tricks.filter(
                (t) => t.winner !== undefined && teamOf(t.winner) === humanTeam,
              ).length;
              const wonSecond =
                r.tricks.length >= 2 &&
                r.tricks[1]?.winner !== undefined &&
                teamOf(r.tricks[1]!.winner!) === humanTeam;
              const highestRank = myHand.length
                ? Math.max(...myHand.map((c) => cardStrength(c)))
                : -1;
              if (tricksWonByUs === 0 && !hasTop && !hasThree) {
                suggestNoVullTruc = true;
              } else if (wonSecond && hasThree && !hasTop && highestRank <= 70) {
                // La seua carta més alta és un 3 (strength 70).
                suggestNoVullTruc = true;
              }
            }

            // Amaga el botó de Truc/Retruc/Quatre val/Joc fora només quan
            // a la 3a baza el nostre equip JA TÉ guanyat el truc:
            //  - Som l'últim a tirar (3 cartes a la mesa, és el nostre torn).
            //  - I el nostre equip lidera ESTRICTAMENT la mesa (la nostra
            //    millor carta supera la millor del rival), cas en què
            //    guanyem la 3a baza segur.
            //  - O bé la 3a baza està en EMPAT entre equips (parda) i hem
            //    guanyat la 1a: parda 3a + winner 1a = guanyem el truc.
            // Si el rival lidera estrictament la mesa, el botó es manté
            // visible: encara que perdem la baza podem trucar per veure si
            // el rival vol o no (i guanyar punts si diu "no vull").
            let hideTruc3rd = false;
            if (isTrucCall && r.tricks.length === 3) {
              const trick3 = r.tricks[2];
              const cards3 = trick3?.cards ?? [];
              const humanPlayed3 = cards3.some((tc) => tc.player === HUMAN);
              if (cards3.length === 3 && !humanPlayed3 && r.turn === HUMAN) {
                const ourMaxStr = cards3
                  .filter((tc) => teamOf(tc.player) === humanTeam)
                  .reduce((m, tc) => Math.max(m, cardStrength(tc.card)), -1);
                const oppMaxStr = cards3
                  .filter((tc) => teamOf(tc.player) !== humanTeam)
                  .reduce((m, tc) => Math.max(m, cardStrength(tc.card)), -1);
                const ourStrictlyLeads = ourMaxStr > oppMaxStr;
                const tiedBetweenTeams = ourMaxStr >= 0 && ourMaxStr === oppMaxStr;
                if (ourStrictlyLeads) hideTruc3rd = true;
                else if (tiedBetweenTeams && wonFirstTrick) hideTruc3rd = true;
              }
            }
            if (hideTruc3rd) return null;

            // "Envit i truca": si l'humà té l'obligació encadenada de
            // truc pendent, el truc s'auto-disparará — no mostrem el botó
            // perquè el jugador no pugui re-prémer ni triar res més.
            if (
              isTrucCall &&
              a.what === "truc" &&
              r.chainedTrucPending === HUMAN
            ) {
              return null;
            }

            // Amaga "No vull" quan rebutjar implica perdre la cama:
            //  · Envit pendent en match-point de cama (envit val 1 punt sí
            //    o sí, i si l'equip rival ja és el líder de cama, perdrem
            //    la cama si no acceptem). Per simplicitat, sempre que estem
            //    en match-point de cama amaguem el "No vull" de l'envit.
            //  · Truc pendent on l'equip que l'ha cantat està a 1 punt de
            //    tancar la cama: rebutjar dóna eixe punt → perd la cama.
            if (a.what === "no-vull") {
              if (
                r.envitState.kind === "pending" &&
                r.envitState.awaitingTeam === humanTeam &&
                camaMatchPoint
              ) {
                return null;
              }
              if (
                r.trucState.kind === "pending" &&
                r.trucState.awaitingTeam === humanTeam
              ) {
                const callerTeam = teamOf(r.trucState.calledBy);
                const callerBones = match.scores[callerTeam].bones;
                if (callerBones >= match.targetCama - 1) return null;
              }
            }


            return (
              <ShoutButton
                key={a.what}
                what={a.what}
                size="sm"
                labelOverride={labelOverride}
                highlight={suggestEnvit || suggestTruc3rd || suggestRenvit || suggestNoVullEnvit || suggestNoVullTruc}
                onClick={() => dispatch(HUMAN, a)}
              />
            );
          })}
        </div>

        <div className="flex items-end gap-3">
          <div
            className="flex flex-col items-center gap-1 shrink-0 relative"
            style={{ zIndex: TRUC_Z_INDEX.chatBubble }}
          >
            <div className="relative">
              <PlayerSeat player={HUMAN} match={match} position="bottom" name={nameBottom} isPendingResponder={isPendingResponder(HUMAN)} presence={presenceFor(HUMAN)} presenceLastSeen={presenceLastSeenFor(HUMAN)} avatarUrl={avatarFor(HUMAN)} />
              {messages.find((m) => m.player === HUMAN) && (
                <ChatBubble
                  phraseId={messages.find((m) => m.player === HUMAN)!.phraseId}
                  vars={messages.find((m) => m.player === HUMAN)!.vars}
                  position="bottom"
                />
              )}
              {envitShoutByPlayer?.[HUMAN] && (
                <div className="absolute top-[-17px] left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ zIndex: TRUC_Z_INDEX.shout }}>
                  <div className="relative inline-block">
                    <ShoutBadge
                      what={envitShoutByPlayer[HUMAN] as ShoutKind}
                      labelOverride={envitShoutLabelByPlayer?.[HUMAN] ?? undefined}
                      quiet={(() => { const _o = effectiveEnvitOutcome(HUMAN); return !!_o && _o !== "pending"; })()}
                    />
                    {(() => { const _o = effectiveEnvitOutcome(HUMAN); return _o ? (
                    <EnvitOutcomeMark
                      outcome={_o}
                      className="absolute left-full top-1/2 -translate-y-1/2 ml-0"
                    />
                  ) : null; })()}
                  </div>
                </div>
              )}
              {lastShoutByPlayer[HUMAN] && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ zIndex: TRUC_Z_INDEX.shout }}>
                  <div className="relative inline-block">
                    <ShoutBadge
                      what={lastShoutByPlayer[HUMAN] as ShoutKind}
                      labelOverride={shoutLabelByPlayer[HUMAN] ?? undefined}
                      quiet={effectiveAcceptedShout(HUMAN)}
                    />
                    {effectiveAcceptedShout(HUMAN) && (
                      <EnvitOutcomeMark
                        outcome="volgut"
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-[-4px]"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 leading-none py-1 -ml-[10px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("match.envit_label")}</div>
              <div className="text-2xl font-display font-bold text-gold leading-none">{myEnvit}</div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center min-w-0 -ml-[30px]">
            {turnSecondsLeft !== null && (
              <div
                className={cn(
                  "text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full mb-1 leading-none",
                  turnSecondsLeft <= 10
                    ? "bg-destructive/20 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
                aria-live="polite"
                aria-label={t("match.turn_seconds", { n: turnSecondsLeft })}
              >
                {turnSecondsLeft}s
              </div>
            )}
            <div className="flex justify-center gap-1.5 min-w-0 w-full" style={{ transform: "translateX(-10px)" }} data-deck-anchor={HUMAN}>
            {myHand.length === 0 ? (
              <div className="text-muted-foreground text-sm py-4">{t("match.waiting_deal")}</div>
            ) : (
              myHand.map((c, i) => {
                const visible = !collectOverlayReady && (!(dealing || passing) || i < revealedCount[HUMAN]);
                if (!visible) {
                  return <div key={c.id} className="w-[64px] h-[112px]" />;
                }
                const isFlipped = hasPlayedCovered || flippedHumanIds.has(c.id);
                const flipLocked = hasPlayedCovered;
                const canPlay = playableIds.has(c.id) && isHumanTurn;
                return (
                  <div
                    key={c.id}
                    data-collect-id={c.id}
                    data-collect-player={HUMAN}
                    data-collect-kind="hand"
                    className={cn(
                      "flex flex-col items-center gap-1 transition-all duration-300 ease-out",
                      dealing && "animate-fade-in",
                    )}
                  >
                    <PlayingCard
                      suit={isFlipped ? undefined : c.suit}
                      rank={isFlipped ? undefined : c.rank}
                      faceDown={isFlipped}
                      size="md"
                      playable={canPlay}
                      onClick={
                        canPlay
                          ? () =>
                              dispatch(HUMAN, {
                                type: "play-card",
                                cardId: c.id,
                                covered: isFlipped,
                              })
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      disabled={flipLocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (flipLocked) return;
                        setFlippedHumanIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        });
                      }}
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border transition-colors",
                        "bg-background/80 backdrop-blur-sm border-primary/40 text-primary",
                        "hover:bg-primary hover:text-primary-foreground",
                        isFlipped && "bg-primary text-primary-foreground",
                        flipLocked && "opacity-40 cursor-not-allowed hover:bg-background/80 hover:text-primary",
                      )}
                      aria-label={
                        flipLocked
                          ? t("match.must_play_covered")
                          : isFlipped
                            ? t("match.show_card")
                            : t("match.cover_card")
                      }
                      title={
                        flipLocked
                          ? t("match.must_play_covered")
                          : isFlipped
                            ? t("match.show_card")
                            : t("match.cover_card")
                      }
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>
      </div>

      {false && (
        <div className="relative" style={{ zIndex: TRUC_Z_INDEX.tableChat }}>
          {belowHandSlot}
        </div>
      )}

      <ChatPanel
        onSay={handleSay}
        highlightPreguntes={highlightPreguntesEffective}
        highlightRespostes={highlightRespostesEffective || highlightRespostes2nd || highlightRespostes2ndTrick || highlightRespostes2ndTrickLost || (isSecondInPairSecondTrick && !respostes2ndDismissed)}
        highlightAltres={highlightAltres}
        highlightedPhraseIds={highlightedPhraseIds.size > 0 ? highlightedPhraseIds : undefined}
        hiddenPhraseIds={hiddenResponseIds.size > 0 ? hiddenResponseIds : undefined}
        phraseVars={{ "si-tinc-n": { n: myEnvit } }}
      />

      {gameEnded && (() => {
        const winnerTeam: TeamId = match.jocForaWinner
          ?? (match.camesWon.nos > match.camesWon.ells ? "nos" : "ells");
        const playerNamesBySeat: Record<PlayerId, string> = {
          [HUMAN]: seatNames?.bottom ?? `Seient ${HUMAN + 1}`,
          [RIGHT]: seatNames?.right ?? `Seient ${RIGHT + 1}`,
          [PARTNER]: seatNames?.top ?? `Seient ${PARTNER + 1}`,
          [LEFT]: seatNames?.left ?? `Seient ${LEFT + 1}`,
        } as Record<PlayerId, string>;
        return (
          <EndGameOverlay
            open={true}
            winnerTeam={winnerTeam}
            playerNamesBySeat={playerNamesBySeat}
            camesWon={match.camesWon}
            jocFora={!!match.jocForaWinner}
            onNewGame={onNewGame}
            onAbandon={onAbandon}
          />
        );
      })()}

      <AlertDialog open={confirmAbandon} onOpenChange={setConfirmAbandon}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("match.abandon_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("match.abandon_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmAbandon(false);
                onAbandon();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("match.abandon_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
    </main>
  );
}

function HiddenHand({
  count,
  direction = "horizontal",
  cards,
  player,
}: {
  count: number;
  direction?: "horizontal" | "vertical";
  cards?: { id: string; suit: import("@/game/types").Suit; rank: import("@/game/types").Rank }[];
  player?: PlayerId;
}) {
  const isVertical = direction === "vertical";
  // DEBUG MODE: render bots' hands face-up so we can study their behavior.
  return (
    <div className={cn(isVertical ? "flex flex-col -space-y-9" : "flex -space-x-4")}>
      {Array.from({ length: count }).map((_, i) => {
        const c = cards?.[i];
        // Cards coming from the online server are masked with placeholder
        // ids ("hidden-..."): only their *count* is real. Render face-down
        // for those so opponents' hands stay hidden in online play.
        const isHidden = !c || c.id.startsWith("hidden-");
        const collectAttrs = c
          ? {
              "data-collect-id": c.id,
              "data-collect-player": player,
              "data-collect-kind": "hand" as const,
              "data-collect-facedown": isHidden ? "1" : undefined,
              "data-collect-rot": isVertical ? "90deg" : "0deg",
            }
          : {};
        if (!isHidden) {
          return (
            <div key={c.id} {...collectAttrs}>
              <PlayingCard
                suit={c.suit}
                rank={c.rank}
                size="sm"
                className={isVertical ? "rotate-90" : ""}
              />
            </div>
          );
        }
        return (
          <div key={c?.id ?? i} {...collectAttrs}>
            <PlayingCard faceDown size="sm" className={isVertical ? "rotate-90" : ""} />
          </div>
        );
      })}
    </div>
  );
}

function TricksWonIndicator({ match }: { match: MatchState }) {
  const r = match.round;
  const resolved = r.tricks.filter(
    (t) => t.cards.length === 4 && (t.winner !== undefined || t.parda),
  );
  const winnerTeam = (t: Trick): TeamId | "parda" | undefined => {
    if (t.parda) return "parda";
    if (t.winner === undefined) return undefined;
    return teamOf(t.winner);
  };
  return (
    <div className="flex flex-row items-center gap-1.5">
      <span className="text-[8px] font-display tracking-wider uppercase text-primary/80 [writing-mode:vertical-rl] rotate-180">
        {translate("match.basses")}
      </span>
      <div className="flex flex-col gap-0.5">
        {[0, 1, 2].map((i) => {
          const t = resolved[i];
          const w = t ? winnerTeam(t) : undefined;
          return (
            <div
              key={i}
              className={cn(
                "px-1 py-0.5 rounded text-[9px] font-display font-bold border text-center min-w-[40px]",
                !w && "border-muted-foreground/30 text-muted-foreground/60 bg-background/40",
                w === "nos" && "border-team-nos bg-team-nos/80 text-white",
                w === "ells" && "border-team-ells bg-team-ells/80 text-white",
                w === "parda" && "border-primary bg-primary/30 text-primary-foreground",
              )}
            >
              {`${i + 1}ª`}
              {w === "nos" && ` ${translate("trick.us_short")}`}
              {w === "ells" && ` ${translate("trick.them_short")}`}
              {w === "parda" && ` ${translate("trick.parda_short")}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ToastPosition = "above" | "below";
const TOAST_POS_KEY = "truc:toastPosition";

function HorizontalScoreboard({
  scores,
  camesWon,
  targetCama,
  targetCames,
  toasts,
}: {
  scores: MatchState["scores"];
  camesWon: MatchState["camesWon"];
  targetCama: MatchState["targetCama"];
  targetCames: MatchState["targetCames"];
  toasts: PointToast[];
}) {
  const [toastPos, _setToastPos] = useState<ToastPosition>(() => {
    if (typeof window === "undefined") return "below";
    const saved = window.localStorage.getItem(TOAST_POS_KEY);
    return saved === "above" || saved === "below" ? saved : "below";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOAST_POS_KEY, toastPos);
  }, [toastPos]);

  const toastsByTeam: Record<TeamId, PointToast[]> = {
    nos: toasts.filter((t) => t.team === "nos"),
    ells: toasts.filter((t) => t.team === "ells"),
  };

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl wood-surface border-2 border-primary/50 card-shadow">

      <TeamSide
        label={translate("common.us")}
          males={scores.nos.males}
          bones={scores.nos.bones}
        target={targetCama}
        team="nos"
        toasts={toastsByTeam.nos}
        toastPos={toastPos}
      />
      <div className="flex items-center gap-1">
        <CamesDots won={camesWon.nos} target={targetCames} team="nos" direction="vertical" />
        <span
          className="text-[8px] text-muted-foreground tracking-widest leading-none font-display"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {translate("match.cames")}
        </span>
        <CamesDots won={camesWon.ells} target={targetCames} team="ells" direction="vertical" />
      </div>
      <TeamSide
        label={translate("common.them")}
        males={scores.ells.males}
        bones={scores.ells.bones}
        target={targetCama}
        team="ells"
        toasts={toastsByTeam.ells}
        toastPos={toastPos}
      />
    </div>
  );
}

function CamesDots({
  won,
  target,
  team,
  direction = "horizontal",
}: {
  won: number;
  target: number;
  team: "nos" | "ells";
  direction?: "horizontal" | "vertical";
}) {
  return (
    <div className={cn(direction === "vertical" ? "flex flex-col gap-0.5" : "flex gap-0.5")}>
      {Array.from({ length: target }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full border",
            i < won
              ? team === "nos"
                ? "bg-team-nos border-team-nos"
                : "bg-team-ells border-team-ells"
              : "border-primary/40 bg-background/30",
          )}
          aria-label={`${team} cama ${i + 1}`}
        />
      ))}
    </div>
  );
}

function TeamSide({
  label, males, bones, target, team, toasts = [], toastPos = "below",
}: {
  label: string; males: number; bones: number; target: number; team: "nos" | "ells";
  toasts?: PointToast[]; toastPos?: "above" | "below";
}) {
  const safeTarget = Math.max(1, target);
  const safeMales = Math.max(0, males);
  const safeBones = Math.max(0, bones);
  const inBones = safeMales >= safeTarget;
  const displayValue = inBones ? Math.min(safeBones, safeTarget) : Math.min(safeMales, safeTarget);
  const stateLabel = inBones ? translate("match.bones") : translate("match.males");
  const isAbove = toastPos === "above";
  return (
    <div className="relative flex flex-col items-center gap-0.5 w-[68px]">
      <span className={cn("text-[10px] font-display tracking-widest uppercase leading-none", team === "nos" ? "text-team-nos" : "text-team-ells")}>
        {label}
      </span>
      <div className="flex items-baseline justify-center gap-0.5 leading-none">
        <span className={cn(
          "text-base font-display font-bold leading-none transition-colors duration-500",
          inBones ? "text-primary" : "text-gold",
        )}>{displayValue}</span>
        <span className="text-[9px] text-muted-foreground leading-none">/{safeTarget}</span>
      </div>
      <span className={cn(
        "text-[9px] font-display tracking-widest uppercase leading-none transition-colors duration-500",
        inBones ? "text-primary/80" : "text-muted-foreground",
      )}>
        {stateLabel}
      </span>

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-50",
          isAbove ? "bottom-full mb-1" : "top-full mt-1",
        )}
        style={{ minWidth: "max-content" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "px-1.5 py-0.5 rounded-xl",
              "font-display font-black text-[8px] border shadow-md",
              "animate-shout",
              "max-w-[140px] text-center leading-tight break-words",
              isAbove ? "rounded-bl-sm origin-bottom" : "rounded-tl-sm origin-top",
              TOAST_STYLE[t.kind],
            )}
          >
            <span className="mr-0.5 text-[9px]">+{t.points}</span>
            <span className="uppercase tracking-wide">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}