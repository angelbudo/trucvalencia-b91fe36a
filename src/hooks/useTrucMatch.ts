import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Action, MatchState, PlayerId, ShoutKind, partnerOf, nextPlayer, teamOf } from "@/game/types";
import { applyAction, createMatch, dealRound, isCamaMatchPoint, legalActions, startNextRound } from "@/game/engine";
import { botDecide } from "@/game/bot";
import { bestEnvit, playerTotalEnvit, cardStrength, asEspasesPlayedFirstTrick } from "@/game/deck";
import { computeShoutDisplay } from "@/game/shoutDisplay";
import { useShoutFlashes } from "@/game/useShoutFlash";
import { speakShout } from "@/lib/speech";
import {
  shouldConsultPartner,
  pickQuestion,
  partnerAnswerFor,
  adviceFromAnswer,
  isBotOpeningForTeam,
  hasGoodTrucCard,
  shouldFoldFirstTrickAsTu,
  type PartnerAdvice,
} from "@/game/botConsult";
import type { ChatPhraseId } from "@/game/phrases";
import { emptyIntents, type CardHint, type PartnerIntents, type PlayStrengthHint } from "@/game/playerIntents";
import { NEUTRAL_TUNING, type BotTuning } from "@/game/profileAdaptation";
import type { ProfileEvent } from "@/lib/playerProfile";

const HUMAN: PlayerId = 0;

import {
  BOT_DELAY_MS,
  BOT_WAIT_FOR_HUMAN_ENVIT_MS,
  CONSULT_QUESTION_DELAY_MS,
  
  CONSULT_BOT_ANSWER_DELAY_MS,
  CONSULT_DECIDE_DELAY_MS,
  RIVAL_FIRST_TRICK_PRE_QUESTION_DELAY_MS,
  RIVAL_FIRST_TRICK_BUBBLE_MS,
  CONSULT_HUMAN_TIMEOUT_MS,
  SECOND_PLAYER_WAIT_MS,
  OPENER_WAIT_FOR_PARTNER_INFO_MS,
  PEU_SPONTANEOUS_INFO_DELAY_MS,
  PARTNER_BOT_INSTRUCTION_DELAY_MS,
  LOW_LATENCY_ROUND_END_MS,
  LOW_LATENCY_ENVIT_REVEAL_ROUND_END_MS,
  SHOUT_FLASH_HOLD_MS,
  SHOUT_FLASH_BUFFER_MS,
  SHOUT_FLASH_GAP_MS,
} from "@/game/chatTimings";



interface UseTrucMatchOptions {
  /** Permite al hook publicar mensajes de chat (consultas bot↔partner). */
  say?: (
    player: PlayerId,
    phraseId: ChatPhraseId,
    durationMs?: number,
    vars?: Record<string, string | number>,
  ) => void;
  /** Cames a guanyar (per defecte 2). */
  targetCames?: number;
  /** Punts per meitat de cama (males/bones). Per defecte 12. */
  targetCama?: number;
  /** Mà inicial (per defecte 0 = tu). El dealer és (mà + 3) % 4. */
  initialMano?: PlayerId;
  /** Si és true, intenta recuperar la partida guardada al localStorage. */
  resume?: boolean;
  /** Tuning derivat del perfil del jugador humà; aplicat als bots rivals. */
  tuning?: BotTuning;
  /** Probabilitat (0..1) de farolejar i mentir dels bots. 0 = sincer. */
  bluffRate?: number;
  /** Callback per registrar esdeveniments del jugador humà al perfil. */
  trackProfile?: (event: ProfileEvent) => void;
  /** Callback opcional invocat al final de cada ronda (history creix). Útil
   * per a forçar un flush del perfil del jugador i recalcular el tuning del
   * bot abans de la ronda següent. */
  onRoundEnd?: () => void;
  /** Si és true, congela qualsevol acció dels bots (no programa torns ni
   *  passa a nova ronda). El jugador humà també queda bloquejat per la UI. */
  paused?: boolean;
  /** Pausa explícita feta per l'usuari (botó de pausa). A diferència de
   *  `paused` (que també inclou animacions de transició), aquesta sí que
   *  bloqueja la progressió a la mà següent: si l'usuari pausa al final
   *  d'una mà, no es repartiran cartes noves fins que reprenga. */
  userPaused?: boolean;
}

const SAVE_KEY = "truc:save:v2";

interface SavedMatch {
  match: MatchState;
  targetCames: number;
  initialMano: PlayerId;
}

function loadSavedMatch(): SavedMatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMatch;
    if (!parsed?.match?.round) return null;
    if (parsed.match.round.phase === "game-end") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSavedMatch(): boolean {
  return loadSavedMatch() !== null;
}

export function clearSavedMatch() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
}

interface PendingHumanAnswer {
  botPlayer: PlayerId;
  consultKey: string;
  timer: number;
  resolve: (answer: ChatPhraseId | null) => void;
}

interface PendingSecondPlayerWait {
  botPlayer: PlayerId;
  waitKey: string;
  timer: number;
  partnerBotTimer: number | null;
  resolve: (instruction: ChatPhraseId | null) => void;
}

export function useTrucMatch(options: UseTrucMatchOptions = {}) {
  const [localFlashQueue, setLocalFlashQueue] = useState<Array<{ id: string; player: PlayerId; what: ShoutKind; labelOverride?: string }>>([]);
  const localFlashTailRef = useRef<Promise<void>>(Promise.resolve());
  const localFlashTimersRef = useRef<number[]>([]);
  const localFlashCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const localFlashBusyUntilRef = useRef<number>(0);
  const localFlashVisibleRef = useRef<Array<{ id: string; player: PlayerId; what: ShoutKind; labelOverride?: string }>>([]);
  // Índex de la baza actual des del punt de vista de la UI. Es declara
  // ací (abans del recordChatPhrase) per poder rastrejar a quina baza
  // s'ha emés cada frase ("Vine a vore!", etc.).
  const lastSeenTrickIdxRef = useRef<number>(0);
  // Frases dites en la ronda actual per cada jugador. S'utilitza per
  // implementar regles del mode sincer (p.ex. "només reservar carta forta
  // si cap rival ha dit vine-a-mi / tinc-bona en aquesta ronda").
  const chatSignalsRef = useRef<Record<PlayerId, ChatPhraseId[]>>({
    0: [], 1: [], 2: [], 3: [],
  });
  // Compromisos personals: per a cada jugador, la baza (trickIdx) en la
  // qual ha dit "Vine a vore!", "Vine al meu tres!" o "Tinc un 3" — quan
  // li toque jugar en eixa baza, s'aplica el playStrength corresponent.
  const selfCommitRef = useRef<Record<PlayerId, Record<number, "vine-a-vore" | "vine-al-meu-tres" | "tinc-un-tres">>>({
    0: {}, 1: {}, 2: {}, 3: {},
  });
  const recordChatPhrase = useCallback((player: PlayerId, phraseId: ChatPhraseId) => {
    const arr = chatSignalsRef.current[player] ?? [];
    arr.push(phraseId);
    chatSignalsRef.current[player] = arr;
    if (
      phraseId === "vine-a-vore" ||
      phraseId === "vine-al-meu-tres" ||
      phraseId === "tinc-un-tres"
    ) {
      selfCommitRef.current[player][lastSeenTrickIdxRef.current] = phraseId;
    }
  }, []);
  const rawSayRef = useRef(options.say);
  useEffect(() => { rawSayRef.current = options.say; }, [options.say]);
  const sayRef = useRef<UseTrucMatchOptions["say"]>(undefined);
  sayRef.current = (player, phraseId, durationMs, vars) => {
    recordChatPhrase(player, phraseId);
    rawSayRef.current?.(player, phraseId, durationMs, vars);
  };
  const tuningRef = useRef<BotTuning>(options.tuning ?? NEUTRAL_TUNING);
  useEffect(() => { tuningRef.current = options.tuning ?? NEUTRAL_TUNING; }, [options.tuning]);
  const bluffRateRef = useRef<number>(options.bluffRate ?? 0);
  useEffect(() => { bluffRateRef.current = options.bluffRate ?? 0; }, [options.bluffRate]);
  const trackProfileRef = useRef(options.trackProfile);
  useEffect(() => { trackProfileRef.current = options.trackProfile; }, [options.trackProfile]);
  const onRoundEndRef = useRef(options.onRoundEnd);
  useEffect(() => { onRoundEndRef.current = options.onRoundEnd; }, [options.onRoundEnd]);
  const pausedRef = useRef<boolean>(options.paused ?? false);
  useEffect(() => { pausedRef.current = options.paused ?? false; }, [options.paused]);

  // Guard anti-race: quan acaba una mà (history creix), el pare necessita
  // un parell de cicles de render per a flipar `paused` (animLock) ja que
  // depén d'un useEffect del board. Marquem aquí mateix un flag síncron
  // que bloqueja qualsevol acció automàtica del motor fins que el pare
  // active explícitament la pausa de transició. Una vegada `paused` és
  // cert, neutralitzem el guard (el lock real ja és el del pare). Així
  // tanquem la finestra de ~1-2 frames en què un bot podria disparar la
  // primera acció de la mà nova abans que comence l'animació de repartir.
  const transitionGraceRef = useRef<boolean>(false);
  const lastHistoryLenRef = useRef<number>(0);
  const isEngineLocked = () => pausedRef.current || transitionGraceRef.current;

  // Quan s'activa la pausa, cancel·la immediatament tots els timers
  // pendents dels bots (acció principal, consultes, espera del company,
  // espera del 2n jugador). Així cap acció programada s'executarà entre
  // la pausa i la represa.
  useEffect(() => {
    if (!options.paused) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    for (const id of consultTimersRef.current) window.clearTimeout(id);
    consultTimersRef.current = [];
    consultInFlightRef.current.clear();
    consultStartedRef.current.clear();
    if (pendingHumanAnswerRef.current) {
      window.clearTimeout(pendingHumanAnswerRef.current.timer);
      pendingHumanAnswerRef.current = null;
    }
    const w = pendingSecondWaitRef.current;
    if (w) {
      window.clearTimeout(w.timer);
      if (w.partnerBotTimer) window.clearTimeout(w.partnerBotTimer);
      pendingSecondWaitRef.current = null;
    }
    if (pendingOpenerWaitRef.current) {
      window.clearTimeout(pendingOpenerWaitRef.current.timer);
      pendingOpenerWaitRef.current = null;
    }
  }, [options.paused]);

  const lastRoundsRef = useRef<number>(-1);
  const gameStartedTrackedRef = useRef<number>(-1);

  const initialDealer = ((((options.initialMano ?? 0) + 3) % 4) as PlayerId);
  const initialTargetCames = options.targetCames ?? 2;
  const initialTargetCama = options.targetCama ?? 12;
  const [match, setMatch] = useState<MatchState>(() => {
    if (options.resume) {
      const saved = loadSavedMatch();
      if (saved) return saved.match;
    }
    return createMatch({ targetCama: initialTargetCama, targetCames: initialTargetCames, firstDealer: initialDealer });
  });

  // Arma el `transitionGraceRef` SÍNCRONAMENT en el mateix render en què
  // creix `history.length`. Així, qualsevol useEffect posterior (incloent
  // el que programa l'acció dels bots) veurà el flag i no programarà res
  // fins que el pare flipi `paused=true` (aleshores el desarmem perquè
  // el lock real ja és el del pare). Aquesta detecció s'ha de fer durant
  // el render — no dins d'un useEffect — perquè els useEffect del bot
  // s'executen en el mateix commit i necessiten veure el flag actiu.
  if (lastHistoryLenRef.current !== match.history.length) {
    if (match.history.length > lastHistoryLenRef.current) {
      transitionGraceRef.current = true;
    }
    lastHistoryLenRef.current = match.history.length;
  }
  if (pausedRef.current && transitionGraceRef.current) {
    // El pare ja ha pres el control: desarmem el guard intern.
    transitionGraceRef.current = false;
  }

  // Persistència automàtica al localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (match.round.phase === "game-end") {
        window.localStorage.removeItem(SAVE_KEY);
      } else {
        const payload: SavedMatch = {
          match,
          targetCames: initialTargetCames,
          initialMano: (options.initialMano ?? 0) as PlayerId,
        };
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      }
    } catch { /* noop */ }
  }, [match, initialTargetCames, options.initialMano]);

  // Track "game_started" once per match (new createMatch resets history to []).
  useEffect(() => {
    const isFreshMatch = match.history.length === 0 && match.cames === 0;
    const fingerprint = match.round.mano + match.targetCames * 10;
    if (isFreshMatch && gameStartedTrackedRef.current !== fingerprint) {
      gameStartedTrackedRef.current = fingerprint;
      trackProfileRef.current?.({ type: "game_started" });
    }
    if (!isFreshMatch && gameStartedTrackedRef.current === -1) {
      gameStartedTrackedRef.current = fingerprint;
    }
  }, [match]);

  // Detecta el final de cada ronda (history.length augmenta) i notifica perquè
  // el motor del bot puga refrescar els seus paràmetres dins de la mateixa
  // partida sense esperar a la pròxima.
  useEffect(() => {
    const len = match.history.length;
    if (lastRoundsRef.current === -1) {
      lastRoundsRef.current = len;
      return;
    }
    if (len > lastRoundsRef.current) {
      lastRoundsRef.current = len;
      // Nova ronda: reinicia el log de frases per jugador.
      chatSignalsRef.current = { 0: [], 1: [], 2: [], 3: [] };
      selfCommitRef.current = { 0: {}, 1: {}, 2: {}, 3: {} };
      onRoundEndRef.current?.();
    } else if (len < lastRoundsRef.current) {
      // Nova partida: reinicia comptador i log de frases.
      lastRoundsRef.current = len;
      chatSignalsRef.current = { 0: [], 1: [], 2: [], 3: [] };
      selfCommitRef.current = { 0: {}, 1: {}, 2: {}, 3: {} };
    }
  }, [match.history.length]);
  // Flash transitori del cant: derivat del log via hook compartit amb online.
  const sharedShoutFlashes = useShoutFlashes(match, true);
  const shoutFlashes = localFlashQueue.length > 0 ? localFlashQueue : sharedShoutFlashes;
  const shoutFlash = shoutFlashes.length === 0 ? null : shoutFlashes[shoutFlashes.length - 1];
  // Tots els carteles (truc, envit, V/X, família, acceptat) es deriven del
  // `MatchState` via `computeShoutDisplay`. Així offline i online comparteixen
  // exactament la mateixa font de veritat — qualsevol canvi visual fet ací
  // es reflecteix automàticament en les partides online.
  const display = useMemo(() => computeShoutDisplay(match), [match]);
  const lastShoutByPlayer = display.lastShoutByPlayer;
  const shoutLabelByPlayer = display.shoutLabelByPlayer;
  const acceptedShoutByPlayer = display.acceptedShoutByPlayer;
  const shoutFamilyByPlayer = display.shoutFamilyByPlayer;
  const envitShoutByPlayer = display.envitShoutByPlayer;
  const envitShoutLabelByPlayer = display.envitShoutLabelByPlayer;
  const envitOutcomeByPlayer = display.envitOutcomeByPlayer;
  const shoutTimersRef = useRef<Record<PlayerId, number | null>>({ 0: null, 1: null, 2: null, 3: null });
  const timerRef = useRef<number | null>(null);
  const consultTimersRef = useRef<number[]>([]);
  const consultAdviceRef = useRef<Map<string, PartnerAdvice>>(new Map());
  const consultStartedRef = useRef<Set<string>>(new Set());
  const consultInFlightRef = useRef<Set<string>>(new Set());
  const intentsRef = useRef<PartnerIntents>(emptyIntents());
  // (lastSeenTrickIdxRef ja declarat al començament del hook)
  const pendingHumanAnswerRef = useRef<PendingHumanAnswer | null>(null);
  const pendingSecondWaitRef = useRef<PendingSecondPlayerWait | null>(null);
  /**
   * Per a cada (history.length, trickIdx, peuBot), guarda si el peu d'una
   * parella ja ha emés (o decidit no emetre) la seua frase informativa
   * espontània durant el torn del seu company. Evita repetir-la.
   * Clau: `${history.length}-${trickIdx}-${peuBot}`.
   */
  const peuSpontaneousInfoRef = useRef<Set<string>>(new Set());
  /**
   * Per a cada consultKey de l'opener, guarda si està en mode "esperant
   * informació espontània del company" (Feature A). Si rep una frase del
   * company dins la finestra, resol amb l'advice corresponent. Si no,
   * passat OPENER_WAIT_FOR_PARTNER_INFO_MS, decideix per ell mateix o
   * pregunta segons el dubte que tinga.
   */
  interface PendingOpenerWait {
    botPlayer: PlayerId;
    consultKey: string;
    timer: number;
    resolve: (advice: PartnerAdvice | null) => void;
  }
  const pendingOpenerWaitRef = useRef<PendingOpenerWait | null>(null);
  /**
   * Si un jugador (humà o bot) que és el "primer de la pareja" canta
   * envit, queda obligat a cantar truc tan bon punt l'envit es resolga
   * (vull/no-vull) i el truc siga legal en el seu pròxim torn. Aquest
   * mapa marca la intenció pendent per jugador. Es neteja per nova ronda.
   */
  const pendingChainedTrucRef = useRef<Record<PlayerId, boolean>>({
    0: false, 1: false, 2: false, 3: false,
  });
  const clearPendingChainedTruc = useCallback(() => {
    pendingChainedTrucRef.current = { 0: false, 1: false, 2: false, 3: false };
  }, []);

  /** Comprova si el jugador `p` és el primer de la seua parella en
   *  l'ordre de tirada partint de la mà actual. */
  const isFirstOfPair = useCallback((p: PlayerId, mano: PlayerId): boolean => {
    const distP = (p - mano + 4) % 4;
    const distPartner = (partnerOf(p) - mano + 4) % 4;
    return distP < distPartner;
  }, []);

  const setPartnerCardHintForCurrentTrick = useCallback((hint: CardHint) => {
    intentsRef.current.cardHintByTrick[lastSeenTrickIdxRef.current] = hint;
  }, []);

  const setPartnerPlayStrengthForCurrentTrick = useCallback((hint: PlayStrengthHint) => {
    intentsRef.current.playStrengthByTrick[lastSeenTrickIdxRef.current] = hint;
  }, []);

  const setPartnerSilentForCurrentTrick = useCallback(() => {
    intentsRef.current.silentByTrick[lastSeenTrickIdxRef.current] = true;
  }, []);

  const setPartnerFoldNextTruc = useCallback(() => {
    intentsRef.current.foldNextTruc = true;
  }, []);

  const setPartnerForceTruc = useCallback(() => {
    intentsRef.current.forceTrucNext = true;
  }, []);

  const setPartnerForceEnvit = useCallback(() => {
    intentsRef.current.forceEnvitNext = true;
  }, []);

  const scheduleConsultTimer = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      consultTimersRef.current = consultTimersRef.current.filter((t) => t !== id);
      fn();
    }, delayMs) as unknown as number;
    consultTimersRef.current.push(id);
    return id;
  }, []);

  const clearConsultTimers = useCallback(() => {
    for (const id of consultTimersRef.current) window.clearTimeout(id);
    consultTimersRef.current = [];
    consultInFlightRef.current.clear();
  }, []);

  const finishConsult = useCallback((consultKey: string) => {
    consultInFlightRef.current.delete(consultKey);
  }, []);

  /**
   * El component crida açò cada vegada que un jugador (humà inclòs) emet
   * una frase de chat. Si hi ha un bot esperant alguna entrada del seu
   * company, la consumim per resoldre el "await" corresponent.
   */
  const notifyChatPhrase = useCallback((player: PlayerId, phraseId: ChatPhraseId) => {
    if (isEngineLocked()) return;
    // Registra la frase a la història per ronda (mode sincer).
    recordChatPhrase(player, phraseId);
    // 1) Resposta a una consulta del bot (preguntes tipus "puc-anar?").
    const pending = pendingHumanAnswerRef.current;
    if (pending && player === partnerOf(pending.botPlayer)) {
      const validAnswers: ChatPhraseId[] = [
        "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
        "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
        "si", "no", "si-tinc-n",
      ];
      if (validAnswers.includes(phraseId)) {
        pending.resolve(phraseId);
        return;
      }
    }
    // 2) Instrucció / resposta del company al peu-bot que està esperant
    // com a 2n en tirar la 1a baza. Accepta tant les instruccions
    // directes ("envida"/"tira-falta") com la resposta a la pregunta
    // "Tens envit?" ("si"/"no") que el bot acaba de fer.
    const waiting = pendingSecondWaitRef.current;
    if (waiting && player === partnerOf(waiting.botPlayer)) {
      const accepted: ChatPhraseId[] = ["envida", "tira-falta", "si", "no"];
      if (accepted.includes(phraseId)) {
        // Petit retard perquè el peu-bot no canti instantàniament després
        // que l'humà li haja dit "Envida!" / "Tira la falta!" / "Sí" / "No".
        // Així queda més natural: l'humà parla, breu pausa, i el bot reacciona.
        const HUMAN_INSTRUCTION_REACTION_MS = 1500;
        const resolve = waiting.resolve;
        window.setTimeout(() => resolve(phraseId), HUMAN_INSTRUCTION_REACTION_MS);
      }
    }
    // 3) Informació espontània del company a l'opener-bot que està
    // esperant en silenci (Feature A). Si el company emet una frase
    // informativa vàlida durant la finestra de 7s, resolem la consulta
    // amb l'advice corresponent i el bot tirarà segons aquest consell.
    const opener = pendingOpenerWaitRef.current;
    if (opener && player === partnerOf(opener.botPlayer)) {
      const infoPhrases: ChatPhraseId[] = [
        "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
        "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
      ];
      if (infoPhrases.includes(phraseId)) {
        const advice = adviceFromAnswer(phraseId);
        opener.resolve(advice);
      }
    }
  }, []);

  const clearShoutTimer = (p: PlayerId) => {
    if (shoutTimersRef.current[p]) {
      window.clearTimeout(shoutTimersRef.current[p]!);
      shoutTimersRef.current[p] = null;
    }
  };

  const resetLocalFlashQueue = useCallback(() => {
    localFlashCancelRef.current.cancelled = true;
    localFlashCancelRef.current = { cancelled: false };
    localFlashTailRef.current = Promise.resolve();
    localFlashBusyUntilRef.current = 0;
    for (const id of localFlashTimersRef.current) window.clearTimeout(id);
    localFlashTimersRef.current = [];
    localFlashVisibleRef.current = [];
    setLocalFlashQueue([]);
  }, []);

  const enqueueLocalShoutFlash = useCallback((player: PlayerId, what: ShoutKind, labelOverride?: string) => {
    const flashId = `${player}-${what}-${Date.now()}-${Math.random()}`;
    const token = localFlashCancelRef.current;
    const AUDIO_LEAD_MS = 700;
    const estimatedStartAt = Math.max(Date.now(), localFlashBusyUntilRef.current);
    localFlashBusyUntilRef.current = estimatedStartAt + AUDIO_LEAD_MS + SHOUT_FLASH_HOLD_MS + SHOUT_FLASH_GAP_MS;
    localFlashTailRef.current = localFlashTailRef.current.then(async () => {
      if (token.cancelled) return;
      const hadVisible = localFlashVisibleRef.current.length > 0;
      if (hadVisible) {
        localFlashVisibleRef.current = [];
        setLocalFlashQueue([]);
      }
      if (hadVisible) {
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, SHOUT_FLASH_GAP_MS) as unknown as number;
          localFlashTimersRef.current.push(id);
        });
        if (token.cancelled) return;
      }
      const speakPromise = speakShout(what, labelOverride).catch(() => undefined);
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, AUDIO_LEAD_MS) as unknown as number;
        localFlashTimersRef.current.push(id);
      });
      if (token.cancelled) return;
      localFlashVisibleRef.current = [{ id: flashId, player, what, labelOverride }];
      setLocalFlashQueue(localFlashVisibleRef.current);
      const shownAt = Date.now();
      await speakPromise;
      const remainingVisibleMs = Math.max(0, SHOUT_FLASH_HOLD_MS - (Date.now() - shownAt));
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, remainingVisibleMs) as unknown as number;
        localFlashTimersRef.current.push(id);
      });
      if (token.cancelled) return;
      localFlashVisibleRef.current = [];
      setLocalFlashQueue([]);
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, SHOUT_FLASH_GAP_MS) as unknown as number;
        localFlashTimersRef.current.push(id);
      });
    });
  }, []);

  const matchRef = useRef<MatchState>(null as unknown as MatchState);
  useEffect(() => { matchRef.current = match; }, [match]);

  // Quan algú diu "Vull!" o "No vull", apareix un cartel central (flash)
  // durant ~SHOUT_FLASH_HOLD_MS. Aquest ref guarda el timestamp fins quan
  // la pròxima acció automàtica (bot juga carta, fi de ronda, etc.) hauria
  // d'esperar perquè el cartell es vegi clar abans que res es moga.
  const responseFlashUntilRef = useRef<number>(0);
  const responseFlashRemainingMs = (): number =>
    Math.max(0, responseFlashUntilRef.current - Date.now());

  // ──────────────────────────────────────────────────────────────────────
  // Endurecimiento defensivo (solo modo local con bots — este hook).
  //   • Guarda idempotente: evita reentradas síncronas a `dispatch` mentre
  //     el reducer aún no ha aplicado la acción anterior.
  //   • Dedupe: si la misma firma de acción se intenta en una ventana muy
  //     corta (≤250 ms) sobre el mismo estado lógico, se ignora.
  // Online (useRoomRealtime) NO toca este hook, así que el gating es
  // implícito: aplica solo aquí.
  // ──────────────────────────────────────────────────────────────────────
  const isProcessingActionRef = useRef<boolean>(false);
  const lastDispatchRef = useRef<{ key: string; at: number } | null>(null);
  const actionSignature = (_player: PlayerId, action: Action): string => {
    const a = action as { type: string; what?: string; cardId?: string };
    if (a.type === "shout") return `shout:${a.what ?? ""}`;
    if (a.type === "play-card") return `play:${a.cardId ?? ""}`;
    return `t:${a.type}`;
  };

  const dispatch = useCallback((player: PlayerId, action: Action) => {
    // Mentre la partida està en pausa, ignora qualsevol acció (inclòs
    // l'humà). L'overlay ja bloqueja clics, però aquesta guarda evita
    // que entrades programàtiques (teclat, eines de debug, etc.) puguin
    // colar-se i avançar l'estat.
    if (isEngineLocked()) return;
    // Guarda idempotente: una sola acción en vuelo por tick.
    if (isProcessingActionRef.current) return;
    // Dedupe de intents: misma firma sobre el mismo estado lógico en
    // ventana corta → se descarta (protege contra dobles encolados de
    // bots, p.ej. envit/truc programados por dos efectos a la vez).
    const mNow = matchRef.current;
    const dedupeKey = `${mNow?.history.length ?? 0}:${mNow?.round.phase ?? ""}:${mNow?.round.turn ?? ""}:${mNow?.round.tricks.length ?? 0}:${player}:${actionSignature(player, action)}`;
    const now = Date.now();
    const last = lastDispatchRef.current;
    if (last && last.key === dedupeKey && now - last.at < 250) return;
    lastDispatchRef.current = { key: dedupeKey, at: now };
    isProcessingActionRef.current = true;
    // Libera el flag tras el commit del reducer (próximo microtask).
    queueMicrotask(() => { isProcessingActionRef.current = false; });
    // Si està actiu el cartell central de "Vull!"/"No vull", bloqueja
    // l'avanç de la mà per part dels bots fins que el cartell s'haja
    // amagat. Per a l'humà confiem en el seu propi temps de reacció.
    if (
      player !== HUMAN &&
      action.type === "play-card" &&
      responseFlashUntilRef.current > Date.now()
    ) {
      return;
    }
    // Track human plays for the adaptive profile.
    if (player === HUMAN && action.type === "shout") {
      const track = trackProfileRef.current;
      const prev = matchRef.current;
      const pr = prev?.round;
      if (track && pr) {
        const what = action.what;
        if (what === "envit" || what === "renvit" || what === "falta-envit") {
          const myEnvit = bestEnvit(pr.hands[HUMAN] ?? []);
          track({ type: "envit_called", strength: myEnvit, bluff: myEnvit < 25 });
        } else if (what === "truc" || what === "retruc" || what === "quatre" || what === "joc-fora") {
          const hand = pr.hands[HUMAN] ?? [];
          let s = 0;
          for (const c of hand) {
            const v = c.rank === 1 && (c.suit === "espases" || c.suit === "bastos") ? 0.5
              : c.rank === 7 && (c.suit === "oros" || c.suit === "espases") ? 0.5
              : c.rank === 3 ? 0.3 : 0.05;
            s += v;
          }
          const strength = Math.min(1, s);
          track({ type: "truc_called", strength, bluff: strength < 0.25 });
        } else if (what === "vull" || what === "no-vull") {
          const accepted = what === "vull";
          if (pr.envitState.kind === "pending") track({ type: "envit_response", accepted });
          else if (pr.trucState.kind === "pending") track({ type: "truc_response", accepted });
        }
      }
    }
    // Si el jugador és "primer de la pareja" i ara canta envit (envit /
    // renvit / falta-envit), queda obligat a cantar truc en quant l'envit
    // es resolga i siga legal. Marquem la intenció pendent.
    if (action.type === "shout") {
      const what = action.what;
      const isEnvitCall =
        what === "envit" || what === "renvit" || what === "falta-envit";
      if (isEnvitCall) {
        const prMano = matchRef.current?.round?.mano;
        if (prMano !== undefined && isFirstOfPair(player, prMano)) {
          pendingChainedTrucRef.current[player] = true;
        }
      }
      // Si el jugador canta truc (qualsevol nivell), neteja la seua
      // intenció pendent encadenada — ja l'ha complida.
      if (
        what === "truc" || what === "retruc" ||
        what === "quatre" || what === "joc-fora"
      ) {
        pendingChainedTrucRef.current[player] = false;
      }
    }
    setMatch(prev => {
      let labelOverride: string | undefined;
      if (action.type === "shout") {
        const pr = prev.round;
        const isTrucCall = action.what === "truc" || action.what === "retruc" || action.what === "quatre" || action.what === "joc-fora";
        if (isTrucCall && !pr.envitResolved && pr.tricks.length === 1 && pr.envitState.kind === "none") {
          // El cartell és "Truc i passe" si el cantador NO és el peu del seu equip
          // (és a dir, encara queda algú del seu equip per tirar la 1a baza
          // i, per tant, podria envidar abans de tirar).
          // Peu de cada equip a la 1a baza:
          //   - equip de la mà: mà + 2
          //   - equip contrari: mà + 3 (= dealer)
          const peuManoTeam = ((pr.mano + 2) % 4) as PlayerId;
          const peuOtherTeam = ((pr.mano + 3) % 4) as PlayerId;
          const callerIsPeu = player === peuManoTeam || player === peuOtherTeam;
          if (!callerIsPeu) {
            const baseLabel: Record<string, string> = {
              truc: "Truque",
              retruc: "Retruque",
              quatre: "Quatre val",
              "joc-fora": "Joc fora",
            };
            labelOverride = `${baseLabel[action.what]} i passe!`;
          }
        }
      }

      const next = applyAction(prev, player, action);
      if (action.type === "shout") {
        // La locució (TTS) ja no es dispara aquí: es fa des de
        // `useShoutFlash` exactament en l'instant en què apareix el
        // cartell central, perquè la veu i el text estiguen 100%
        // sincronitzats (sense el desfase introduït pel staggering
        // visual de VISUAL_EVENT_GAP_MS).
        // Si la resposta és "Vull!" o "No vull", apareix un cartel central
        // gran (flash). Bloqueja qualsevol acció automàtica posterior (bot
        // jugant carta, fi de ronda, etc.) fins que el cartell s'haja
        // amagat, perquè el jugador llegisca clarament la decisió.
        enqueueLocalShoutFlash(player, action.what, labelOverride);
        if (action.what === "vull" || action.what === "no-vull") {
          responseFlashUntilRef.current =
            Math.max(responseFlashUntilRef.current, localFlashBusyUntilRef.current + SHOUT_FLASH_BUFFER_MS);
        }
        // El flash transitori (1.6s) es deriva automàticament del log
        // via `useShoutFlash`. La resta dels carteles persistents (truc,
        // envit, V/X, família, acceptat) via `computeShoutDisplay`.
      }
      return next;
    });
  }, [enqueueLocalShoutFlash, isFirstOfPair]);

  const clearPendingSecondWait = () => {
    const w = pendingSecondWaitRef.current;
    if (w) {
      window.clearTimeout(w.timer);
      if (w.partnerBotTimer) window.clearTimeout(w.partnerBotTimer);
      pendingSecondWaitRef.current = null;
    }
  };

  const forcedNextDealerRef = useRef<PlayerId | null>(null);
  const setForcedNextDealer = useCallback((dealer: PlayerId | null) => {
    forcedNextDealerRef.current = dealer;
  }, []);

  const newRound = useCallback(() => {
    resetLocalFlashQueue();
    setMatch(prev => {
      const next = startNextRound(prev);
      const forced = forcedNextDealerRef.current;
      if (forced !== null && next.round.phase !== "game-end") {
        forcedNextDealerRef.current = null;
        return { ...next, dealer: forced, round: dealRound(forced) };
      }
      return next;
    });
    for (const p of [0, 1, 2, 3] as PlayerId[]) clearShoutTimer(p);
    consultAdviceRef.current.clear();
    consultStartedRef.current.clear();
    clearConsultTimers();
    intentsRef.current = emptyIntents();
    clearPendingChainedTruc();
    lastSeenTrickIdxRef.current = 0;
    if (pendingHumanAnswerRef.current) {
      window.clearTimeout(pendingHumanAnswerRef.current.timer);
      pendingHumanAnswerRef.current = null;
    }
    clearPendingSecondWait();
  }, [clearConsultTimers, clearShoutTimer, resetLocalFlashQueue]);

  const newGame = useCallback(() => {
    resetLocalFlashQueue();
    const forced = forcedNextDealerRef.current;
    const firstDealer: PlayerId = forced !== null ? forced : initialDealer;
    if (forced !== null) forcedNextDealerRef.current = null;
    setMatch(createMatch({ targetCama: initialTargetCama, targetCames: initialTargetCames, firstDealer }));
    for (const p of [0, 1, 2, 3] as PlayerId[]) clearShoutTimer(p);
    consultAdviceRef.current.clear();
    consultStartedRef.current.clear();
    clearConsultTimers();
    intentsRef.current = emptyIntents();
    clearPendingChainedTruc();
    lastSeenTrickIdxRef.current = 0;
    if (pendingHumanAnswerRef.current) {
      window.clearTimeout(pendingHumanAnswerRef.current.timer);
      pendingHumanAnswerRef.current = null;
    }
    clearPendingSecondWait();
  }, [clearConsultTimers, clearShoutTimer, resetLocalFlashQueue]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isEngineLocked()) return;
    const r = match.round;
    if (r.phase === "game-end" || r.phase === "round-end") return;

    let actor: PlayerId | null = null;
    for (const p of [0, 1, 2, 3] as PlayerId[]) {
      const acts = legalActions(match, p);
      if (acts.length > 0) {
        if (
          (r.envitState.kind === "pending" && (r.envitState.awaitingTeam === (p % 2 === 0 ? "nos" : "ells"))) ||
          (r.trucState.kind === "pending" && (r.trucState.awaitingTeam === (p % 2 === 0 ? "nos" : "ells"))) ||
          r.turn === p
        ) {
          actor = p;
          break;
        }
      }
    }
    if (actor === null) return;
    if (actor === HUMAN) return;

    const botPlayer = actor;

    let delay = BOT_DELAY_MS;
    const firstTrick = r.tricks[0]!;
    const aboutToPlayCard =
      r.turn === botPlayer &&
      r.envitState.kind !== "pending" &&
      r.trucState.kind !== "pending" &&
      (r.phase === "envit" || (r.phase === "playing" && r.tricks.length === 1));
    if (aboutToPlayCard && !r.envitResolved && firstTrick.cards.length < 4) {
      const peuNos: PlayerId = teamOf(r.mano) === "nos" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
      const peuElls: PlayerId = teamOf(r.mano) === "ells" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
      const botIsPeu = botPlayer === peuNos || botPlayer === peuElls;
      const botPartner = partnerOf(botPlayer);
      const partnerHasNotPlayedYet = !firstTrick.cards.some(tc => tc.player === botPartner);

      const humanIsPeu = peuNos === HUMAN;
      const humanHasNotPlayedYet = !firstTrick.cards.some(tc => tc.player === HUMAN);
      if (humanIsPeu && humanHasNotPlayedYet) {
        delay = BOT_WAIT_FOR_HUMAN_ENVIT_MS;
      }

      if (botIsPeu && botPartner === HUMAN && partnerHasNotPlayedYet) {
        delay = BOT_WAIT_FOR_HUMAN_ENVIT_MS;
      }
    }

    // 2a/3a baza: si el bot està a punt de tirar carta i no té cap
    // carta que guanye les ja jugades en aquesta baza, tira ràpid.
    if (
      r.turn === botPlayer &&
      r.phase === "playing" &&
      r.tricks.length >= 2 &&
      r.envitState.kind !== "pending" &&
      r.trucState.kind !== "pending"
    ) {
      const curTrick = r.tricks[r.tricks.length - 1];
      if (curTrick && curTrick.cards.length > 0) {
        const myHand = r.hands[botPlayer] ?? [];
        const bestOnTable = Math.max(...curTrick.cards.map((tc) => cardStrength(tc.card)));
        const myBest = myHand.length > 0 ? Math.max(...myHand.map((c) => cardStrength(c))) : -1;
        // Estricte: només tira ràpid si cap carta de la mà pot superar
        // la millor de la mesa. Si empata (parda) o té alguna carta
        // especial que iguala, conserva el temps normal de reflexió.
        if (myBest < bestOnTable) {
          delay = Math.min(delay, 1000);
        }
      }
    }

    // Si fa poc s'ha mostrat un cartell central de "Vull!" o "No vull",
    // espera fins que s'haja amagat abans de qualsevol acció del bot,
    // perquè el jugador llegisca clarament la decisió presa.
    delay = Math.max(delay, responseFlashRemainingMs());

    const trickIdx = r.tricks.length - 1;
    lastSeenTrickIdxRef.current = trickIdx;
    const consultKey = `${match.history.length}-${trickIdx}-${botPlayer}`;
    const isBotTurnWithoutPendingShouts =
      r.turn === botPlayer &&
      r.envitState.kind !== "pending" &&
      r.trucState.kind !== "pending";
    const isPlayCardTurn =
      isBotTurnWithoutPendingShouts &&
      (r.phase === "playing" || (r.phase === "envit" && r.tricks.length === 1));
    const isResponseTurn =
      (r.envitState.kind === "pending" && (r.envitState.awaitingTeam === (botPlayer % 2 === 0 ? "nos" : "ells"))) ||
      (r.trucState.kind === "pending" && (r.trucState.awaitingTeam === (botPlayer % 2 === 0 ? "nos" : "ells")));

    const cachedAdvice = consultAdviceRef.current.get(consultKey) ?? "neutral";

    // Abans d'acceptar un envit del rival, el bot pregunta al company
    // "Vols tornar a envidar?" perquè el company puga decidir si convé
    // pujar. Regla dura del producte: amb 31/32/33 d'envit, el bot HA de
    // preguntar primer; després, si el company diu "no", farà "vull" i,
    // si el company diu "sí", renvidarà/tirarà falta si és legal.
    const envitConsultKey = `envit-consult-${match.history.length}-${botPlayer}`;
    if (
      isResponseTurn &&
      r.envitState.kind === "pending" &&
      !consultStartedRef.current.has(envitConsultKey) &&
      !consultAdviceRef.current.has(envitConsultKey) &&
      sayRef.current
    ) {
      const myEnvitNow = playerTotalEnvit(r, botPlayer);
      const acts = legalActions(match, botPlayer);
      const canRaiseOrAccept = acts.some(
        (a) => a.type === "shout" && (a.what === "vull" || a.what === "renvit" || a.what === "falta-envit"),
      );
      const partnerSeatRej = partnerOf(botPlayer);
      const partnerAlreadyRejected =
        r.envitState.kind === "pending" &&
        (r.envitState.rejectedBy ?? []).includes(partnerSeatRej);
      const wouldAccept = myEnvitNow >= 31 && canRaiseOrAccept && !partnerAlreadyRejected;
      const partnerEnv = partnerOf(botPlayer);
      const partnerIsBotEnv = partnerEnv !== HUMAN;
      // En "match point" de cama l'envit només val 1 punt i no es pot
      // pujar (renvit / falta-envit). Per tant el bot no consulta el
      // company amb "Vols tornar a envidar?" ni "Quant envit tens?":
      // simplement decideix sense preguntar.
      if (wouldAccept && !isCamaMatchPoint(match)) {
        consultStartedRef.current.add(envitConsultKey);
        const finalizeAfter = (instruction: ChatPhraseId | null) => {
          // Marca consultat (qualsevol valor) per a no repetir.
          consultAdviceRef.current.set(envitConsultKey, "neutral");
          scheduleConsultTimer(() => {
            const currentActs = legalActions(matchRef.current, botPlayer);
            const currentVull = currentActs.find(
              (a) => a.type === "shout" && a.what === "vull",
            );
            const currentRenvit = currentActs.find(
              (a) => a.type === "shout" && (a.what === "renvit" || a.what === "falta-envit"),
            );
            const currentRound = matchRef.current.round;
            const currentEnvit = playerTotalEnvit(currentRound, botPlayer);
            let currentManoPriorityOverCaller = false;
            if (currentRound.envitState.kind === "pending") {
              const currentCaller = currentRound.envitState.calledBy;
              let p: PlayerId = currentRound.mano;
              for (let i = 0; i < 4; i++) {
                if (p === botPlayer) { currentManoPriorityOverCaller = true; break; }
                if (p === currentCaller) { currentManoPriorityOverCaller = false; break; }
                p = ((p + 1) % 4) as PlayerId;
              }
            }
            const canRaiseNow =
              currentEnvit >= 33 || (currentEnvit === 32 && currentManoPriorityOverCaller);

            // Després de preguntar, el bot MAI rebutja amb 31/32/33:
            // si pot pujar, puja; altrament, vol l'envit.
            if ((instruction === "envida" || instruction === "si" || instruction === "si-tinc-n") && canRaiseNow && currentRenvit) {
              dispatch(botPlayer, currentRenvit);
              return;
            }
            if (instruction === "no") {
              if (currentVull) { dispatch(botPlayer, currentVull); return; }
            }
            if (currentEnvit >= 31 && currentVull) {
              dispatch(botPlayer, currentVull);
              return;
            }
            // Altrament, decisió normal d'envit.
            const hints = buildHints();
            const action = botDecide(matchRef.current, botPlayer, cachedAdvice, hints, tuningRef.current, bluffRateRef.current);
            if (action) dispatch(botPlayer, action);
          }, CONSULT_DECIDE_DELAY_MS);
        };
        // Davant d'una falta-envit o si l'envit ja s'ha pujat (renvit o
        // superior), els bots no pregunten "Vols tornar a envidar?": ja
        // no té sentit perquè ja s'ha reenvidat. En aquests casos
        // pregunten "Quant envit tens?" i el company respon amb el seu
        // valor real ("Tinc {n}").
        const envitAlreadyRaised =
          r.envitState.kind === "pending" &&
          (r.envitState.level === "falta" ||
            (typeof r.envitState.level === "number" && r.envitState.level > 2));
        const consultQuestion: ChatPhraseId = envitAlreadyRaised
          ? "quant-envit"
          : "vols-tornar-envidar";
        scheduleConsultTimer(() => {
          sayRef.current?.(botPlayer, consultQuestion);
          if (partnerIsBotEnv) {
            let answer: ChatPhraseId;
            let answerVars: Record<string, string | number> | undefined;
            if (envitAlreadyRaised) {
              answer = "si-tinc-n";
              answerVars = { n: playerTotalEnvit(r, partnerEnv) };
            } else {
              answer = partnerAnswerFor(match, partnerEnv, "vols-tornar-envidar", bluffRateRef.current);
            }
            scheduleConsultTimer(() => {
              sayRef.current?.(partnerEnv, answer, undefined, answerVars);
              finalizeAfter(answer);
            }, CONSULT_BOT_ANSWER_DELAY_MS);
          } else {
            // Company humà: espera resposta o timeout.
            const tid = window.setTimeout(() => finalizeAfter(null), CONSULT_HUMAN_TIMEOUT_MS) as unknown as number;
            pendingHumanAnswerRef.current = {
              botPlayer,
              consultKey: envitConsultKey,
              timer: tid,
              resolve: (ans) => {
                if (pendingHumanAnswerRef.current?.consultKey !== envitConsultKey) return;
                window.clearTimeout(pendingHumanAnswerRef.current.timer);
                pendingHumanAnswerRef.current = null;
                finalizeAfter(ans);
              },
            };
          }
        }, CONSULT_QUESTION_DELAY_MS);
        return;
      }
    }

    // "Truc i passe!": el rival ha cantat truc en la 1a baza sense haver-se
    // envidat. El bot, abans de respondre al truc, pot envidar (l'engine ho
    // permet ara). Si té envit alt (≥30) envida directament; en cas
    // contrari, consulta al company "Vols envidar?" i decideix segons la
    // resposta.
    const trucEnvitConsultKey = `truc-envit-consult-${match.history.length}-${botPlayer}`;
    if (
      isResponseTurn &&
      r.trucState.kind === "pending" &&
      !consultStartedRef.current.has(trucEnvitConsultKey) &&
      !consultAdviceRef.current.has(trucEnvitConsultKey)
    ) {
      const actsTE = legalActions(match, botPlayer);
      const canEnvitTE = actsTE.some(
        (a) => a.type === "shout" && a.what === "envit",
      );
      if (canEnvitTE && sayRef.current) {
        const myEnvitNow = playerTotalEnvit(r, botPlayer);
        const partnerSeatTE = partnerOf(botPlayer);
        const partnerIsBotTE = partnerSeatTE !== HUMAN;

        if (myEnvitNow >= 30) {
          // Fast-path: envida directament sense consultar.
          consultStartedRef.current.add(trucEnvitConsultKey);
          consultAdviceRef.current.set(trucEnvitConsultKey, "neutral");
          scheduleConsultTimer(() => {
            const envit = legalActions(matchRef.current, botPlayer).find(
              (a) => a.type === "shout" && a.what === "envit",
            );
            if (envit) dispatch(botPlayer, envit);
          }, CONSULT_DECIDE_DELAY_MS);
          return;
        }

        // Consulta al company.
        consultStartedRef.current.add(trucEnvitConsultKey);
        const finalizeAfterTE = (instruction: ChatPhraseId | null) => {
          consultAdviceRef.current.set(trucEnvitConsultKey, "neutral");
          scheduleConsultTimer(() => {
            const acts2 = legalActions(matchRef.current, botPlayer);
            const envitAct = acts2.find(
              (a) => a.type === "shout" && a.what === "envit",
            );
            if (
              envitAct &&
              (instruction === "envida" ||
                instruction === "si" ||
                instruction === "si-tinc-n")
            ) {
              dispatch(botPlayer, envitAct);
              return;
            }
            const hints = buildHints();
            const action = botDecide(
              matchRef.current,
              botPlayer,
              cachedAdvice,
              hints,
              tuningRef.current,
              bluffRateRef.current,
            );
            if (action) dispatch(botPlayer, action);
          }, CONSULT_DECIDE_DELAY_MS);
        };
        scheduleConsultTimer(() => {
          sayRef.current?.(botPlayer, "vols-envide");
          if (partnerIsBotTE) {
            const rivalsSaidNoEnvitTE = (() => {
              const myTeam = teamOf(partnerSeatTE);
              for (const pStr of Object.keys(chatSignalsRef.current)) {
                const p = Number(pStr) as PlayerId;
                if (teamOf(p) === myTeam) continue;
                const ph = chatSignalsRef.current[p] ?? [];
                if (ph.includes("no")) return true;
              }
              return false;
            })();
            const answer = partnerAnswerFor(
              match,
              partnerSeatTE,
              "vols-envide",
              bluffRateRef.current,
              { rivalsSaidNoEnvit: rivalsSaidNoEnvitTE },
            );
            const answerVars =
              answer === "si-tinc-n"
                ? { n: playerTotalEnvit(r, partnerSeatTE) }
                : undefined;
            scheduleConsultTimer(() => {
              sayRef.current?.(partnerSeatTE, answer, undefined, answerVars);
              finalizeAfterTE(answer);
            }, CONSULT_BOT_ANSWER_DELAY_MS);
          } else {
            const tid = window.setTimeout(
              () => finalizeAfterTE(null),
              CONSULT_HUMAN_TIMEOUT_MS,
            ) as unknown as number;
            pendingHumanAnswerRef.current = {
              botPlayer,
              consultKey: trucEnvitConsultKey,
              timer: tid,
              resolve: (ans) => {
                if (
                  pendingHumanAnswerRef.current?.consultKey !==
                  trucEnvitConsultKey
                )
                  return;
                window.clearTimeout(pendingHumanAnswerRef.current.timer);
                pendingHumanAnswerRef.current = null;
                finalizeAfterTE(ans);
              },
            };
          }
        }, CONSULT_QUESTION_DELAY_MS);
        return;
      }
    }

    const buildHints = () => {
      const hints: {
        cardHint?: CardHint;
        playStrength?: PlayStrengthHint;
        silentTruc?: boolean;
        foldTruc?: boolean;
        forceTruc?: boolean;
        forceEnvit?: boolean;
        rivalShownStrength?: boolean;
      } = {};
      // Mode sincer: detecta si algun rival d'aquest bot ha dit
      // "vine-a-mi" o "tinc-bona" en aquesta ronda. Aplica per a TOTS
      // els bots (no només els que tenen humà de company).
      const myTeam = teamOf(botPlayer);
      let rivalSignaled = false;
      for (const pStr of Object.keys(chatSignalsRef.current)) {
        const p = Number(pStr) as PlayerId;
        if (teamOf(p) === myTeam) continue;
        const phrases = chatSignalsRef.current[p] ?? [];
        if (phrases.includes("vine-a-mi") || phrases.includes("tinc-bona")) {
          rivalSignaled = true;
          break;
        }
      }
      if (rivalSignaled) hints.rivalShownStrength = true;

      // Compromís personal del propi bot: si en aquesta baza ha respost
      // "Vine a vore!", "Vine al meu tres!" o "Tinc un 3", aplica el
      // playStrength específic perquè la funció de tria de carta honre
      // el compromís (jugar la carta forta si guanya la mesa, etc.).
      const selfCommit = selfCommitRef.current[botPlayer]?.[trickIdx];
      if (
        selfCommit === "vine-a-vore" ||
        selfCommit === "vine-al-meu-tres" ||
        selfCommit === "tinc-un-tres"
      ) {
        hints.playStrength = selfCommit;
      }

      // Obligació encadenada: si aquest bot ha cantat envit sent "primer
      // de la pareja", ha de cantar truc en quant siga legal i l'envit
      // s'haja resolt. Aplica a tots els bots, no només els companys de
      // l'humà.
      if (pendingChainedTrucRef.current[botPlayer]) {
        const r = matchRef.current?.round;
        if (r && r.envitState.kind !== "pending") {
          hints.forceTruc = true;
        }
      }

      const isPartnerOfHuman = partnerOf(HUMAN) === botPlayer;
      if (!isPartnerOfHuman) return hints;
      const ch = intentsRef.current.cardHintByTrick[trickIdx];
      if (ch) hints.cardHint = ch;
      const ps = intentsRef.current.playStrengthByTrick[trickIdx];
      // No sobrescriguis el compromís propi del bot amb una pista més
      // laxa que vinga de l'humà.
      if (
        ps &&
        hints.playStrength !== "vine-a-vore" &&
        hints.playStrength !== "vine-al-meu-tres" &&
        hints.playStrength !== "tinc-un-tres"
      ) {
        hints.playStrength = ps;
      }
      if (intentsRef.current.silentByTrick[trickIdx]) hints.silentTruc = true;
      if (intentsRef.current.foldNextTruc) hints.foldTruc = true;
      if (intentsRef.current.forceTrucNext) hints.forceTruc = true;
      if (intentsRef.current.forceEnvitNext) hints.forceEnvit = true;
      return hints;
    };

    const partnerOfBot = partnerOf(botPlayer);
    const isRivalOpeningFirstTrick =
      trickIdx === 0 &&
      botPlayer !== HUMAN &&
      partnerOfBot !== HUMAN &&
      isPlayCardTurn &&
      isBotOpeningForTeam(match, botPlayer);
    const questionDelayMs = isRivalOpeningFirstTrick
      ? RIVAL_FIRST_TRICK_PRE_QUESTION_DELAY_MS
      : CONSULT_QUESTION_DELAY_MS;
    // Quan el qui respon és un bot, sempre tarda mig segon (no depèn del
    // mode "rival opening first trick"). Així el chat entre bots flueix ràpid.
    const botAnswerDelayMs = CONSULT_BOT_ANSWER_DELAY_MS;
    const decideDelayMs = isRivalOpeningFirstTrick
      ? RIVAL_FIRST_TRICK_BUBBLE_MS
      : CONSULT_DECIDE_DELAY_MS;
    const bubbleDurationMs = isRivalOpeningFirstTrick
      ? RIVAL_FIRST_TRICK_BUBBLE_MS
      : undefined;

    // Cas especial: el bot obri la primera baza per a la seua parella
    // sense cap carta bona de truc (3, 7 oros, 7 espases, As bastos, As
    // espases). En lloc de consultar, diu "A tu!" i tira directament una
    // carta sense esperar resposta del company. S'aplica tant si el
    // company és l'humà com si és un altre bot.
    if (
      isPlayCardTurn &&
      trickIdx === 0 &&
      isBotOpeningForTeam(match, botPlayer) &&
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey) &&
      !hasGoodTrucCard(match, botPlayer)
    ) {
      consultStartedRef.current.add(consultKey);
      consultAdviceRef.current.set(consultKey, "weak");
      timerRef.current = window.setTimeout(() => {
        const hints = buildHints();
        const action = botDecide(match, botPlayer, "weak", hints, tuningRef.current, bluffRateRef.current);
        if (action) dispatch(botPlayer, action);
      }, questionDelayMs) as unknown as number;
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }

    // Nota: el bot que obri la 1a baza NO anuncia mai "Vine a mi!".
    // Si té carta top pot consultar al company i tirar segons la
    // resposta, però l'anunci proactiu queda prohibit en aquesta posició.

    // Cas especial: el bot és el 2n en tirar la 1a baza i encara no s'ha
    // envidat. Espera fins SECOND_PLAYER_WAIT_MS perquè el company li
    // indique alguna cosa ("Envida!" o "Tira la falta!"). Si rep
    // instrucció, llança l'envit corresponent. Si no, decideix per ell
    // mateix (botDecide ja considera envidar amb envit alt).
    // Cas: el bot és el peu (segon de la seua parella) en la 1a baza,
    // el seu company ja ha tirat la seua carta, i encara no s'ha envidat.
    // Espera SECOND_PLAYER_WAIT_MS perquè el company li puga dir
    // "envida" o "tira la falta".
    const firstTrickRef = r.tricks[0]!;
    const peuNosCheck: PlayerId = teamOf(r.mano) === "nos" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const peuEllsCheck: PlayerId = teamOf(r.mano) === "ells" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const botIsPeuOfTeam = botPlayer === peuNosCheck || botPlayer === peuEllsCheck;
    const partnerForSecondWait = partnerOf(botPlayer);
    const partnerHasPlayedAlready = firstTrickRef.cards.some(tc => tc.player === partnerForSecondWait);
    const botHasNotPlayedYet = !firstTrickRef.cards.some(tc => tc.player === botPlayer);
    const isSecondToPlayFirstTrick =
      isPlayCardTurn &&
      trickIdx === 0 &&
      botIsPeuOfTeam &&
      partnerHasPlayedAlready &&
      botHasNotPlayedYet &&
      r.envitState.kind === "none" &&
      !r.envitResolved;
    const waitKey = `wait2-${match.history.length}-${botPlayer}`;
    if (
      isSecondToPlayFirstTrick &&
      pendingSecondWaitRef.current?.waitKey !== waitKey &&
      !consultStartedRef.current.has(waitKey)
    ) {
      consultStartedRef.current.add(waitKey);

      // Short-circuit: si el company JA ha dit "Envida!" / "Tira la falta!"
      // / "Sí" / "No" / "Tinc {n}" abans que el peu-bot arribara al seu
      // torn (per exemple, l'humà ho ha dit espontàniament), no esperem
      // res: actuem immediatament amb aquesta resposta com a instrucció.
      // Així evitem que el bot es quede esperant una resposta a una
      // pregunta que el company ja havia contestat.
      {
        const partnerEarly = partnerForSecondWait;
        const earlySpoken = chatSignalsRef.current[partnerEarly] ?? [];
        const earlyInstructions: ChatPhraseId[] = ["envida", "tira-falta", "si", "no", "si-tinc-n"];
        const earlyHit = [...earlySpoken].reverse().find((p) => earlyInstructions.includes(p));
        if (earlyHit) {
          const canEnvitEarly = legalActions(match, botPlayer).some(
            (a) => a.type === "shout" && a.what === "envit",
          );
          const myEnvitEarly = playerTotalEnvit(r, botPlayer);
          let action: Action | null = null;
          if (earlyHit === "envida" || earlyHit === "tira-falta") {
            const what: ShoutKind = earlyHit === "tira-falta" ? "falta-envit" : "envit";
            const acts = legalActions(match, botPlayer);
            action = acts.find((a) => a.type === "shout" && a.what === what)
              ?? acts.find((a) => a.type === "shout" && a.what === "envit")
              ?? null;
          } else if (canEnvitEarly && (earlyHit === "si" || earlyHit === "si-tinc-n")) {
            action = { type: "shout", what: "envit" };
          } else if (canEnvitEarly && earlyHit === "no") {
            if (myEnvitEarly >= 30 && Math.random() < 0.4) {
              action = { type: "shout", what: "envit" };
            }
          }
          if (!action) {
            const hints = buildHints();
            action = botDecide(match, botPlayer, cachedAdvice, hints, tuningRef.current, bluffRateRef.current);
          }
          if (action) {
            timerRef.current = window.setTimeout(() => {
              if (action) dispatch(botPlayer, action);
            }, BOT_DELAY_MS) as unknown as number;
          }
          return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
          };
        }
      }

      // Si el propi bot ja té envit (≥31), envida directament: no cal
      // preguntar al company ni esperar instruccions. Amb envit alt
      // (30) també, però amb una mica d'aleatorietat per a no ser
      // totalment previsible.
      const myEnvit = playerTotalEnvit(r, botPlayer);
      const canEnvit = legalActions(match, botPlayer).some(
        (a) => a.type === "shout" && a.what === "envit",
      );
      if (canEnvit && myEnvit >= 31) {
        timerRef.current = window.setTimeout(() => {
          dispatch(botPlayer, { type: "shout", what: "envit" });
        }, BOT_DELAY_MS) as unknown as number;
        return () => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
        };
      }
      if (canEnvit && myEnvit >= 30 && Math.random() < 0.8) {
        timerRef.current = window.setTimeout(() => {
          dispatch(botPlayer, { type: "shout", what: "envit" });
        }, BOT_DELAY_MS) as unknown as number;
        return () => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
        };
      }

      const partner = partnerForSecondWait;
      const partnerIsBot = partner !== HUMAN;

      // Decideix l'acció final del peu-bot a partir de la resposta del
      // company a "Tens envit?" (o de la instrucció directa "Envida!"/
      // "Tira la falta!"), combinant-ho amb el seu propi envit.
      const decideEnvitAction = (
        instruction: ChatPhraseId | null,
      ): Action | null => {
        if (instruction === "envida" || instruction === "tira-falta") {
          const what: ShoutKind = instruction === "tira-falta" ? "falta-envit" : "envit";
          const acts = legalActions(match, botPlayer);
          const envitAct = acts.find((a) => a.type === "shout" && a.what === what)
            ?? acts.find((a) => a.type === "shout" && a.what === "envit");
          if (envitAct) return envitAct;
        }
        if (canEnvit && (instruction === "si" || instruction === "no" || instruction === "si-tinc-n")) {
          const partnerHasEnvit = instruction !== "no";
          if (partnerHasEnvit) {
            // Si el company ha confirmat que té envit ("Sí" o "Tinc {n}"),
            // el peu-bot envida directament. És el comportament natural:
            // ja s'ha preguntat al primer de la pareja, ha dit que sí, i
            // no té sentit fer més preguntes ni dubtar.
            return { type: "shout", what: "envit" };
          } else {
            // El company no té envit. Només envida si jo en tinc molt
            // (≥30: 30, 31, 32 o 33). Amb 28-29 o menys és un envit
            // petit i no val la pena demanar al company que envide.
            if (myEnvit >= 30 && Math.random() < 0.4) return { type: "shout", what: "envit" };
          }
          // No envidar: el peu-bot tira carta com sempre.
          const hints = buildHints();
          return botDecide(match, botPlayer, cachedAdvice, hints, tuningRef.current, bluffRateRef.current);
        }
        // Sense resposta vàlida: decideix com sempre.
        const hints = buildHints();
        return botDecide(match, botPlayer, cachedAdvice, hints, tuningRef.current, bluffRateRef.current);
      };

      const finalize = (instruction: ChatPhraseId | null) => {
        if (pendingSecondWaitRef.current?.waitKey !== waitKey) return;
        if (pendingSecondWaitRef.current.partnerBotTimer) {
          window.clearTimeout(pendingSecondWaitRef.current.partnerBotTimer);
        }
        window.clearTimeout(pendingSecondWaitRef.current.timer);
        pendingSecondWaitRef.current = null;
        const action = decideEnvitAction(instruction);
        if (action) dispatch(botPlayer, action);
      };

      const timeoutId = window.setTimeout(() => finalize(null), SECOND_PLAYER_WAIT_MS) as unknown as number;

      // Cas especial dins del peu-bot a la 1a baza: si és el 4t en tirar
      // (ja hi ha 3 cartes a la mesa) i amb la seua millor carta no pot
      // guanyar la baza, no té sentit esperar instruccions del company:
      // pregunta directament "Tens envit?" i actua segons la resposta.
      // No depèn de probabilitat ni del temporitzador d'espera.
      const cardsOnTable = firstTrickRef.cards;
      const isFourthToPlay = cardsOnTable.length === 3;
      const myHand = r.hands[botPlayer] ?? [];
      const myBestStrength = myHand.length > 0
        ? Math.max(...myHand.map((c) => cardStrength(c)))
        : -Infinity;
      const tableBestStrength = cardsOnTable.length > 0
        ? Math.max(...cardsOnTable.map((tc) => cardStrength(tc.card)))
        : -Infinity;
      const cannotWinTrick = myBestStrength <= tableBestStrength;
      const askDirectlyNoWait = canEnvit && isFourthToPlay && cannotWinTrick;

      // El peu-bot pot preguntar proactivament "Tens envit?" al seu
      // company, però NO sempre: ho fa només a vegades (~35%). La resta
      // de vegades es queda callat i espera fins a SECOND_PLAYER_WAIT_MS
      // (~7 s) perquè siga el company qui prenga la iniciativa amb un
      // "Envida!" o "Tira la falta!" espontani. Així evitem que els
      // bots delaten sempre que tenen opció d'envidar.
      // Excepció: si és el 4t en tirar i no pot guanyar la baza, sempre
      // pregunta directament (askDirectlyNoWait=true).
      let partnerBotTimer: number | null = null;
      const askPartner = askDirectlyNoWait || (canEnvit && Math.random() < 0.35);
      if (askPartner && sayRef.current) {
        scheduleConsultTimer(() => {
          sayRef.current?.(botPlayer, "vols-envide", bubbleDurationMs);
          if (partnerIsBot) {
            const rivalsSaidNoEnvitAsk = (() => {
              const myTeam = teamOf(partner);
              for (const pStr of Object.keys(chatSignalsRef.current)) {
                const p = Number(pStr) as PlayerId;
                if (teamOf(p) === myTeam) continue;
                if ((chatSignalsRef.current[p] ?? []).includes("no")) return true;
              }
              return false;
            })();
            const answer = partnerAnswerFor(match, partner, "vols-envide", bluffRateRef.current, { rivalsSaidNoEnvit: rivalsSaidNoEnvitAsk });
            // A "Tens envit?" el company pot dir "Envida!", "Sí",
            // "Tinc {n}" (si en té 30) o "No". Si revela el número,
            // passem la variable {n} amb l'envit real del company.
            const partnerEnvitNow = playerTotalEnvit(r, partner);
            const displayPhrase: ChatPhraseId = answer;
            const sayVars = answer === "si-tinc-n" ? { n: partnerEnvitNow } : undefined;
            scheduleConsultTimer(() => {
              sayRef.current?.(partner, displayPhrase, bubbleDurationMs, sayVars);
              // Si el company ha confirmat que té envit ("Sí" o
              // "Tinc {n}"), el bot envida directament sense fer més
              // preguntes (cap "Vols que envide?" ni "Quant envit?"):
              // és el comportament natural quan el primer de la pareja
              // ja ha donat el "OK".
              const partnerConfirmed = answer === "si" || answer === "si-tinc-n";
              const finalInstruction: ChatPhraseId = partnerConfirmed
                ? "envida"
                : answer;
              scheduleConsultTimer(() => {
                finalize(finalInstruction);
              }, decideDelayMs);
            }, botAnswerDelayMs);
          }
          // Si el partner és humà, esperem que responga via
          // notifyChatPhrase (que crida finalize amb "si"/"no" o
          // l'instrucció "envida"/"tira-falta"). El timeout general ja
          // serveix de rescat.
        }, askDirectlyNoWait ? 0 : questionDelayMs);
      } else if (partnerIsBot && sayRef.current) {
        // El peu-bot s'ha quedat callat (o no pot envidar). Si el company
        // és un bot, donem-li l'oportunitat de prendre la iniciativa amb
        // un "Envida!" / "Tira la falta!" espontani durant la finestra
        // d'espera, sempre que tinga envit suficient. Si no, el peu-bot
        // simplement esperarà i, en passar el timeout, decidirà sol.
        const partnerEnvit = playerTotalEnvit(r, partner);
        const trapPartner = partnerEnvit >= 32 && Math.random() < 0.75;
        if (!trapPartner && partnerEnvit >= 30) {
          // El bot primer de la parella en la 1a baza sempre diu "Envida!"
          // (mai "Tira la falta!"), encara que tinga 33: és més probable que
          // el rival accepte l'envit simple i així es guanyen més pedres.
          const instruction: ChatPhraseId = "envida";
          partnerBotTimer = window.setTimeout(() => {
            sayRef.current?.(partner, instruction, bubbleDurationMs);
            window.setTimeout(() => finalize(instruction), CONSULT_DECIDE_DELAY_MS);
          }, PARTNER_BOT_INSTRUCTION_DELAY_MS) as unknown as number;
        }
      }

      pendingSecondWaitRef.current = {
        botPlayer,
        waitKey,
        timer: timeoutId,
        partnerBotTimer,
        resolve: finalize,
      };

      return () => {
        // Neteja només si encara és la mateixa espera (canvi d'estat).
      };
    }

    // Si el bot ha de tirar carta i obri per a la seua parella sense
    // cap carta forta (3, 7 oros, 7 espases, As bastos, As espases),
    // tira directament sense consultar el company. Aplica a qualsevol
    // baza (no només la primera).
    if (
      isPlayCardTurn &&
      isBotOpeningForTeam(match, botPlayer) &&
      !hasGoodTrucCard(match, botPlayer) &&
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey)
    ) {
      consultStartedRef.current.add(consultKey);
      consultAdviceRef.current.set(consultKey, "weak");
      timerRef.current = window.setTimeout(() => {
        const hints = buildHints();
        const action = botDecide(match, botPlayer, "weak", hints, tuningRef.current, bluffRateRef.current);
        if (action) dispatch(botPlayer, action);
      }, decideDelayMs) as unknown as number;
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }

    const forceRivalFirstTrickConsult =
      !!sayRef.current &&
      isRivalOpeningFirstTrick &&
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey);

    const shouldStartConsult =
      forceRivalFirstTrickConsult || (
        sayRef.current &&
        !consultStartedRef.current.has(consultKey) &&
        !consultAdviceRef.current.has(consultKey) &&
        ((isPlayCardTurn && shouldConsultPartner(match, botPlayer, tuningRef.current)) ||
          (isResponseTurn && shouldConsultPartner(match, botPlayer, tuningRef.current)))
      );

    // Curt-circuit: 1a baza, soc el primer del meu equip, hi ha una carta
    // top a la mesa d'un rival i no la puc superar amb cap carta meua.
    // El bot diu "A tu!" i tira la seua carta més baixa, sense preguntar.
    if (
      !!sayRef.current &&
      isPlayCardTurn &&
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey) &&
      shouldFoldFirstTrickAsTu(match, botPlayer)
    ) {
      consultStartedRef.current.add(consultKey);
      consultAdviceRef.current.set(consultKey, "neutral");
      consultInFlightRef.current.add(consultKey);
      scheduleConsultTimer(() => {
        if (!asEspasesPlayedFirstTrick(match.round)) {
          sayRef.current?.(botPlayer, "a-tu");
        }
        scheduleConsultTimer(() => {
          const hand = match.round.hands[botPlayer] ?? [];
          const acts = legalActions(match, botPlayer).filter(
            (a) => a.type === "play-card",
          ) as Extract<Action, { type: "play-card" }>[];
          if (acts.length > 0 && hand.length > 0) {
            const sortedAsc = [...hand].sort(
              (a, b) => cardStrength(a) - cardStrength(b),
            );
            const lowest = sortedAsc[0]!;
            const matchAct = acts.find((a) => a.cardId === lowest.id) ?? acts[0]!;
            dispatch(botPlayer, matchAct);
          }
          finishConsult(consultKey);
        }, decideDelayMs);
      }, CONSULT_QUESTION_DELAY_MS);
      return;
    }

    // Feature A — short-circuit per a l'opener: si el company ja li ha
    // donat informació espontània (Feature B) abans que es disparara la
    // consulta, l'opener no pregunta res. Pren l'última frase informativa
    // del company com a advice i tira directament.
    if (
      isPlayCardTurn &&
      trickIdx === 0 &&
      isBotOpeningForTeam(match, botPlayer) &&
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey)
    ) {
      const partnerO = partnerOf(botPlayer);
      const infoPhrasesA: ChatPhraseId[] = [
        "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
        "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
      ];
      const partnerSaid = (chatSignalsRef.current[partnerO] ?? [])
        .filter(p => infoPhrasesA.includes(p));
      if (partnerSaid.length > 0) {
        const lastInfo = partnerSaid[partnerSaid.length - 1]!;
        const advice = adviceFromAnswer(lastInfo);
        consultStartedRef.current.add(consultKey);
        consultAdviceRef.current.set(consultKey, advice);
        timerRef.current = window.setTimeout(() => {
          const hints = buildHints();
          const action = botDecide(match, botPlayer, advice, hints, tuningRef.current, bluffRateRef.current);
          if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
            intentsRef.current.foldNextTruc = false;
          }
          if (action) dispatch(botPlayer, action);
        }, decideDelayMs) as unknown as number;
        return () => {
          if (timerRef.current) window.clearTimeout(timerRef.current);
        };
      }
    }

    // Feature A — l'opener-bot NO sempre pregunta. Quan toca consultar
    // (té carta bona de truc) i NO és el cas forçat de parella rival amb
    // humà a la mesa, hi ha ~50% de probabilitat que es quede callat
    // esperant una resposta espontània del company durant 7 segons.
    //  - Si el company envia una frase informativa dins la finestra, es
    //    resol amb l'advice corresponent i el bot tira.
    //  - Si passen 7 s sense resposta:
    //      · Si el bot té molt clar què tirar (mà polaritzada o molt
    //        forta), tira sol amb advice "neutral".
    //      · Si té dubtes (mà mixta), llavors sí pregunta "Què tens?" o
    //        "Puc anar a tu?".
    const canTriggerOpenerWait =
      !!sayRef.current &&
      isPlayCardTurn &&
      trickIdx === 0 &&
      isBotOpeningForTeam(match, botPlayer) &&
      hasGoodTrucCard(match, botPlayer) &&
      !isRivalOpeningFirstTrick && // el cas rival-pair manté la consulta forçada
      !consultStartedRef.current.has(consultKey) &&
      !consultAdviceRef.current.has(consultKey) &&
      shouldConsultPartner(match, botPlayer, tuningRef.current);

    if (canTriggerOpenerWait && Math.random() < 0.5) {
      consultStartedRef.current.add(consultKey);
      consultInFlightRef.current.add(consultKey);

      const finalizeOpenerWait = (advice: PartnerAdvice | null) => {
        const cur = pendingOpenerWaitRef.current;
        if (cur?.consultKey !== consultKey) return;
        window.clearTimeout(cur.timer);
        pendingOpenerWaitRef.current = null;

        const hand = match.round.hands[botPlayer] ?? [];
        // Detecta "muchas dudas": mà polaritzada (té carta bona de truc
        // però també alguna carta baixa) o sense un guanyador clar de baza.
        const strengths = hand.map(c => cardStrength(c)).sort((a, b) => b - a);
        const topS = strengths[0] ?? 0;
        const lowS = strengths[strengths.length - 1] ?? 0;
        const polarized = topS >= 65 && lowS <= 30 && hand.length >= 2;

        if (advice !== null) {
          // El company ha donat informació dins la finestra.
          consultAdviceRef.current.set(consultKey, advice);
          scheduleConsultTimer(() => {
            const hints = buildHints();
            const action = botDecide(match, botPlayer, advice, hints, tuningRef.current, bluffRateRef.current);
            if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
              intentsRef.current.foldNextTruc = false;
            }
            if (action) dispatch(botPlayer, action);
            finishConsult(consultKey);
          }, decideDelayMs);
          return;
        }

        // Timeout: cap resposta del company.
        if (polarized) {
          // Té dubtes → pregunta ara "Què tens?" o "Puc anar a tu?".
          const q: ChatPhraseId = Math.random() < 0.5 ? "que-tens" : "puc-anar";
          const partnerQ = partnerOf(botPlayer);
          const partnerIsHumanQ = partnerQ === HUMAN;
          scheduleConsultTimer(() => {
            sayRef.current?.(botPlayer, q);
            if (partnerIsHumanQ) {
              const finalizeAfterQ = (answer: ChatPhraseId | null) => {
                if (pendingHumanAnswerRef.current?.consultKey !== consultKey) return;
                window.clearTimeout(pendingHumanAnswerRef.current.timer);
                pendingHumanAnswerRef.current = null;
                const advice2: PartnerAdvice = answer ? adviceFromAnswer(answer, q) : "neutral";
                consultAdviceRef.current.set(consultKey, advice2);
                scheduleConsultTimer(() => {
                  const hints = buildHints();
                  const action = botDecide(match, botPlayer, advice2, hints, tuningRef.current, bluffRateRef.current);
                  if (action) dispatch(botPlayer, action);
                  finishConsult(consultKey);
                }, decideDelayMs);
              };
              const tid = window.setTimeout(() => finalizeAfterQ(null), CONSULT_HUMAN_TIMEOUT_MS) as unknown as number;
              pendingHumanAnswerRef.current = {
                botPlayer, consultKey, timer: tid,
                resolve: (ans) => finalizeAfterQ(ans),
              };
            } else {
              // Partner bot: respon segons la seua mà.
              const partnerTeamQ = teamOf(partnerQ);
              let rivalSaidNoTincResQ = false;
              for (const pStr of Object.keys(chatSignalsRef.current)) {
                const p = Number(pStr) as PlayerId;
                if (teamOf(p) === partnerTeamQ) continue;
                if ((chatSignalsRef.current[p] ?? []).includes("no-tinc-res")) {
                  rivalSaidNoTincResQ = true;
                  break;
                }
              }
              const answerQ = partnerAnswerFor(match, partnerQ, q, bluffRateRef.current, { rivalSaidNoTincRes: rivalSaidNoTincResQ });
              const adviceQ = adviceFromAnswer(answerQ, q);
              scheduleConsultTimer(() => {
                sayRef.current?.(partnerQ, answerQ);
                scheduleConsultTimer(() => {
                  consultAdviceRef.current.set(consultKey, adviceQ);
                  const hints = buildHints();
                  const action = botDecide(match, botPlayer, adviceQ, hints, tuningRef.current, bluffRateRef.current);
                  if (action) dispatch(botPlayer, action);
                  finishConsult(consultKey);
                }, decideDelayMs);
              }, CONSULT_BOT_ANSWER_DELAY_MS);
            }
          }, CONSULT_QUESTION_DELAY_MS);
          return;
        }

        // Sense dubtes ni resposta del company: tira sol amb advice neutral.
        consultAdviceRef.current.set(consultKey, "neutral");
        scheduleConsultTimer(() => {
          const hints = buildHints();
          const action = botDecide(match, botPlayer, "neutral", hints, tuningRef.current, bluffRateRef.current);
          if (action) dispatch(botPlayer, action);
          finishConsult(consultKey);
        }, decideDelayMs);
      };

      const timeoutId = window.setTimeout(
        () => finalizeOpenerWait(null),
        OPENER_WAIT_FOR_PARTNER_INFO_MS,
      ) as unknown as number;

      pendingOpenerWaitRef.current = {
        botPlayer,
        consultKey,
        timer: timeoutId,
        resolve: (advice) => finalizeOpenerWait(advice),
      };

      return;
    }

    if (shouldStartConsult) {
      if (consultInFlightRef.current.has(consultKey)) return;

      consultStartedRef.current.add(consultKey);
      consultInFlightRef.current.add(consultKey);
      const partner = partnerOf(botPlayer);
      const partnerSpoken = chatSignalsRef.current[partner] ?? [];
      const question = pickQuestion(match, botPlayer, partnerSpoken);

      // Si totes les preguntes possibles ja tenen resposta espontània
      // del company, NO preguntem res: usem la seua última frase
      // informativa com a advice i actuem directament.
      if (question === null) {
        const infoPhrasesNQ: ChatPhraseId[] = [
          "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
          "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
        ];
        const said = partnerSpoken.filter((p) => infoPhrasesNQ.includes(p));
        const advice: PartnerAdvice = said.length > 0
          ? adviceFromAnswer(said[said.length - 1]!)
          : "neutral";
        consultAdviceRef.current.set(consultKey, advice);
        scheduleConsultTimer(() => {
          const hints = buildHints();
          const action = botDecide(match, botPlayer, advice, hints, tuningRef.current, bluffRateRef.current);
          if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
            intentsRef.current.foldNextTruc = false;
          }
          if (action) dispatch(botPlayer, action);
          finishConsult(consultKey);
        }, decideDelayMs);
        return;
      }

      const partnerIsHuman = partner === HUMAN;

      scheduleConsultTimer(() => {
        sayRef.current?.(botPlayer, question, bubbleDurationMs);

        if (partnerIsHuman) {
          const finalize = (answer: ChatPhraseId | null) => {
            if (pendingHumanAnswerRef.current?.consultKey !== consultKey) return;
            window.clearTimeout(pendingHumanAnswerRef.current.timer);
            pendingHumanAnswerRef.current = null;
            const advice: PartnerAdvice = answer ? adviceFromAnswer(answer, question) : "neutral";
            consultAdviceRef.current.set(consultKey, advice);
            scheduleConsultTimer(() => {
              const hints = buildHints();
              const action = botDecide(match, botPlayer, advice, hints, tuningRef.current, bluffRateRef.current);
              if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
                intentsRef.current.foldNextTruc = false;
              }
              if (action) dispatch(botPlayer, action);
              finishConsult(consultKey);
            }, decideDelayMs);
          };

          const timeoutId = window.setTimeout(() => {
            finalize(null);
          }, CONSULT_HUMAN_TIMEOUT_MS) as unknown as number;

          pendingHumanAnswerRef.current = {
            botPlayer,
            consultKey,
            timer: timeoutId,
            resolve: (ans) => finalize(ans),
          };
        } else {
          // Context per a "Vine al meu tres": ¿algun rival del partner
          // ha dit "No tinc res" en aquesta ronda?
          const partnerTeam = teamOf(partner);
          let rivalSaidNoTincRes = false;
          for (const pStr of Object.keys(chatSignalsRef.current)) {
            const p = Number(pStr) as PlayerId;
            if (teamOf(p) === partnerTeam) continue;
            if ((chatSignalsRef.current[p] ?? []).includes("no-tinc-res")) {
              rivalSaidNoTincRes = true;
              break;
            }
          }
          const answer = partnerAnswerFor(match, partner, question, bluffRateRef.current, { rivalSaidNoTincRes });
          const advice = adviceFromAnswer(answer, question);
          scheduleConsultTimer(() => {
            sayRef.current?.(partner, answer, bubbleDurationMs);
            scheduleConsultTimer(() => {
              consultAdviceRef.current.set(consultKey, advice);
              const hints = buildHints();
              const action = botDecide(match, botPlayer, advice, hints, tuningRef.current, bluffRateRef.current);
              if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
                intentsRef.current.foldNextTruc = false;
              }
              if (action) dispatch(botPlayer, action);
              finishConsult(consultKey);
            }, decideDelayMs);
          }, botAnswerDelayMs);
        }
      }, questionDelayMs);

      return;
    }

    // Si ja hi ha una consulta o espera en curs per a aquest bot,
    // no programes una decisió paral·lela.
    if (pendingHumanAnswerRef.current?.botPlayer === botPlayer) {
      return;
    }
    if (pendingSecondWaitRef.current?.botPlayer === botPlayer) {
      return;
    }
    if (consultInFlightRef.current.has(consultKey)) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      const hints = buildHints();
      const action = botDecide(match, botPlayer, cachedAdvice, hints, tuningRef.current, bluffRateRef.current);
      if (hints.foldTruc && action?.type === "shout" && action.what === "no-vull") {
        intentsRef.current.foldNextTruc = false;
      }
      if (action) dispatch(botPlayer, action);
    }, delay) as unknown as number;

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [match, dispatch, options.paused]);

  // Feature B: el bot que és el peu (segon de la seua parella) en la 1a baza
  // pot informar proactivament al seu company SENSE que li hagen preguntat
  // res, durant el torn del company, en funció de les cartes que té.
  // Diu "Vine a mi!", "Algo tinc", "Tinc un 3" o "No tinc res" segons
  // la seua mà. Una sola vegada per (mà, baza, peuBot).
  useEffect(() => {
    if (isEngineLocked()) return;
    if (options.paused) return;
    const r = match.round;
    if (r.phase !== "playing" && r.phase !== "envit") return;
    if (r.envitState.kind === "pending") return;
    if (r.trucState.kind === "pending") return;
    const trickIdx = r.tricks.length - 1;
    if (trickIdx !== 0) return;
    const firstTrick = r.tricks[0];
    if (!firstTrick) return;
    if (firstTrick.cards.length === 0) return; // ningú ha tirat encara

    // El torn ha de ser del PARTNER del peu-bot (o sigui, l'opener),
    // i l'opener encara no ha tirat la seua carta.
    for (const peuBot of [1, 2, 3] as PlayerId[]) {
      const partner = partnerOf(peuBot);
      if (partner === HUMAN) continue; // ens centrem en parelles bot-bot
      if (peuBot === r.turn) continue; // ha de ser el torn del company
      if (r.turn !== partner) continue; // el company ha de ser l'actor

      // El peu-bot ha de ser realment el peu de la seua parella en la 1a baza:
      // és a dir, el seu company juga abans que ell.
      const peuNos: PlayerId = teamOf(r.mano) === "nos" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
      const peuElls: PlayerId = teamOf(r.mano) === "ells" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
      const isPeu = peuBot === peuNos || peuBot === peuElls;
      if (!isPeu) continue;

      // El company encara no ha tirat la seua carta en aquesta baza.
      const partnerHasPlayed = firstTrick.cards.some(tc => tc.player === partner);
      if (partnerHasPlayed) continue;

      // El peu-bot encara no ha tirat tampoc (estem a la 1a baza, abans
      // de la seua jugada): per construcció ja és cert si el seu company
      // és l'actor.
      const peuHasPlayed = firstTrick.cards.some(tc => tc.player === peuBot);
      if (peuHasPlayed) continue;

      const infoKey = `peuinfo-${match.history.length}-${trickIdx}-${peuBot}`;
      if (peuSpontaneousInfoRef.current.has(infoKey)) continue;

      // Si el peu-bot ja ha emés alguna frase informativa en aquesta ronda
      // (potser des d'un torn anterior), evitem repetir.
      const phrasesSaid = chatSignalsRef.current[peuBot] ?? [];
      const infoPhrases: ChatPhraseId[] = [
        "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
        "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
      ];
      if (phrasesSaid.some(p => infoPhrases.includes(p))) {
        peuSpontaneousInfoRef.current.add(infoKey);
        continue;
      }

      // Probabilitat: ~55% de vegades el peu-bot informa proactivament.
      // La resta de vegades es queda callat i deixa que l'opener decidisca
      // o pregunte si vol.
      if (Math.random() >= 0.55) {
        peuSpontaneousInfoRef.current.add(infoKey);
        continue;
      }

      peuSpontaneousInfoRef.current.add(infoKey);

      // Calcula la frase informativa basada en les cartes del peu-bot.
      // Reaprofitem `partnerAnswerFor` amb la pregunta "que-tens": ja
      // retorna "vine-a-mi" / "tinc-bona" / "vine-a-vore" / "tinc-un-tres" /
      // "vine-al-meu-tres" / "no-tinc-res" / "a-tu" segons la mà.
      const partnerTeam2 = teamOf(peuBot);
      let rivalSaidNoTincRes2 = false;
      for (const pStr of Object.keys(chatSignalsRef.current)) {
        const p = Number(pStr) as PlayerId;
        if (teamOf(p) === partnerTeam2) continue;
        if ((chatSignalsRef.current[p] ?? []).includes("no-tinc-res")) {
          rivalSaidNoTincRes2 = true;
          break;
        }
      }
      let phrase = partnerAnswerFor(
        match,
        peuBot,
        "que-tens",
        bluffRateRef.current,
        { rivalSaidNoTincRes: rivalSaidNoTincRes2 },
      );

      // Cas especial: si a la mesa ja hi ha una carta TOP (força ≥70: 3,
      // 7 oros, 7 espases, As bastos, As espases) jugada per un RIVAL,
      // la resposta espontània al company ha de ser binària segons si
      // el peu-bot pot guanyar-la o no:
      //   · Pot guanyar-la → "Vine a mi!"
      //   · No pot guanyar-la → "A tu!"
      // Mai "Tinc un 3" en aquest context: presumir d'un 3 quan la mesa
      // ja té una carta top que no podrem superar no aporta informació
      // útil al company i li dóna pistes errònies.
      const peuTeam = teamOf(peuBot);
      let bestRivalTopOnTable = -1;
      for (const tc of firstTrick.cards) {
        if (teamOf(tc.player) === peuTeam) continue;
        const s = cardStrength(tc.card);
        if (s >= 70 && s > bestRivalTopOnTable) bestRivalTopOnTable = s;
      }
      if (bestRivalTopOnTable >= 70) {
        const peuHand = match.round.hands[peuBot];
        const canBeatTop = peuHand.some((c) => cardStrength(c) > bestRivalTopOnTable);
        const lieBin = bluffRateRef.current > 0 && Math.random() < bluffRateRef.current;
        const truth: ChatPhraseId = canBeatTop ? "vine-a-mi" : "a-tu";
        phrase = lieBin ? (canBeatTop ? "a-tu" : "vine-a-mi") : truth;
      }

      // Iniciativa espontània (el company NO ha preguntat res): si no té
      // res, ha de dir "A tu!" i mai "No tinc res". "No tinc res" només
      // és vàlid com a resposta a "Que tens?" o "Puc anar a tu?".
      if (phrase === "no-tinc-res") {
        phrase = "a-tu";
      }

      // Prohibició: si en la primera baza ja s'ha jugat l'As d'espases,
      // cap bot pot dir "A tu!". En aqueix cas, el peu-bot calla en lloc
      // d'emetre la frase espontània.
      if (phrase === "a-tu" && asEspasesPlayedFirstTrick(match.round)) {
        continue;
      }

      const t = window.setTimeout(() => {
        sayRef.current?.(peuBot, phrase);
      }, PEU_SPONTANEOUS_INFO_DELAY_MS);
      // Retorn de cleanup només per al primer cas trobat.
      return () => window.clearTimeout(t);
    }
  }, [match, options.paused]);

  // Auto-truc encadenat per a l'humà: si l'humà ha cantat envit sent
  // "primer de la pareja", queda obligat a cantar truc en quant l'envit
  // s'haja resolt i el truc siga legal en el seu pròxim torn.
  useEffect(() => {
    if (isEngineLocked()) return;
    if (!pendingChainedTrucRef.current[HUMAN]) return;
    const r = match.round;
    if (r.envitState.kind === "pending") return;
    const acts = legalActions(match, HUMAN);
    const trucAct = acts.find(
      (a) => a.type === "shout" && a.what === "truc",
    );
    if (!trucAct) return;
    pendingChainedTrucRef.current[HUMAN] = false;
    // Petit retard perquè l'animació del "Vull!"/"No vull" es vegi
    // clarament abans d'encadenar el truc.
    const remaining = Math.max(300, responseFlashRemainingMs() + 200);
    const t = window.setTimeout(() => {
      dispatch(HUMAN, trucAct);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [match, dispatch]);

  // Suggeriment proactiu del bot company quan l'HUMÀ és el peu de la
  // seua parella en la 1a baza i ha de decidir si envidar:
  // si el bot company ja ha jugat la seua carta i té envit suficient,
  // diu "Envida!" (o "Tira la falta!" si en té molt) per indicar a
  // l'humà que envide. Una sola vegada per ronda.
  const partnerEnvitHintRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEngineLocked()) return;
    if (options.paused) return;
    const r = match.round;
    if (r.phase === "game-end" || r.phase === "round-end") return;
    if (r.tricks.length !== 1) return;
    if (r.envitResolved) return;
    if (r.envitState.kind !== "none") return;
    if (r.trucState.kind === "pending") return;

    // L'humà ha de ser peu de la seua parella en la 1a baza.
    const peuNos: PlayerId = teamOf(r.mano) === "nos" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const peuElls: PlayerId = teamOf(r.mano) === "ells" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const humanIsPeu = HUMAN === peuNos || HUMAN === peuElls;
    if (!humanIsPeu) return;

    // Ha de ser el torn de l'humà i ha de poder envidar.
    if (r.turn !== HUMAN) return;
    const humanActs = legalActions(match, HUMAN);
    const humanCanEnvit = humanActs.some(
      (a) => a.type === "shout" && (a.what === "envit" || a.what === "falta-envit"),
    );
    if (!humanCanEnvit) return;

    // El bot company de l'humà ja ha d'haver jugat la seua carta.
    const partner = partnerOf(HUMAN);
    if (partner === HUMAN) return; // sanity
    const firstTrick = r.tricks[0]!;
    const partnerHasPlayed = firstTrick.cards.some((tc) => tc.player === partner);
    if (!partnerHasPlayed) return;

    // L'humà encara no ha jugat la seua carta.
    const humanHasPlayed = firstTrick.cards.some((tc) => tc.player === HUMAN);
    if (humanHasPlayed) return;

    // El bot company té envit suficient per voler que l'humà envide.
    const partnerEnvit = playerTotalEnvit(r, partner);
    if (partnerEnvit < 30) return;

    // Una sola vegada per mà.
    const hintKey = `partner-envit-hint-${match.history.length}`;
    if (partnerEnvitHintRef.current === hintKey) return;
    partnerEnvitHintRef.current = hintKey;

    // El bot primer de la parella en la 1a baza sempre diu "Envida!" (mai
    // "Tira la falta!"), encara que tinga 33: és més probable que el rival
    // accepte l'envit simple i així es guanyen més pedres.
    const instruction: ChatPhraseId = "envida";
    const t = window.setTimeout(() => {
      sayRef.current?.(partner, instruction);
    }, PARTNER_BOT_INSTRUCTION_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [match, options.paused]);

  useEffect(() => {
    if (match.round.phase === "round-end") {
      // IMPORTANT: NO bloquegem amb `pausedRef.current` (que inclou
      // animLock) perquè provocaria deadlock — `paused` no es desactiva
      // fins que arribe el `dealKey` i acabe l'animació de repartir.
      // En canvi SÍ bloquegem amb `userPaused`: si l'usuari ha premut
      // pausa explícitament al final d'una mà, no comencem la mà nova
      // fins que reprenga. Quan `userPaused` torne a false, aquest
      // efecte es torna a executar i programa el `newRound()`.
      if (options.userPaused) return;
      const lastSummary = match.history[match.history.length - 1];
      const envitRevealed = !!(lastSummary && lastSummary.envitWinner && !lastSummary.envitRejected && lastSummary.envitPoints > 0);
      let delay = envitRevealed ? LOW_LATENCY_ENVIT_REVEAL_ROUND_END_MS : LOW_LATENCY_ROUND_END_MS;
      delay = Math.max(delay, responseFlashRemainingMs() + LOW_LATENCY_ROUND_END_MS);
      const t = window.setTimeout(() => newRound(), delay);
      return () => window.clearTimeout(t);
    }
  }, [match.round.phase, match.history, newRound, options.userPaused]);

  const humanActions = legalActions(match, HUMAN);

  // Watchdog de turno (solo bots locales). Si el turno de un bot no
  // avanza en 5 s y sigue siendo legal jugar, fuerza una re-decisión y
  // como último recurso una acción legal cualquiera para que la partida
  // nunca quede colgada. No afecta a partidas online (otro hook).
  const watchdogTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (watchdogTimerRef.current != null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (options.paused || options.userPaused) return;
    const r = match.round;
    if (!r || r.phase === "round-end" || r.phase === "game-end") return;
    const turn = r.turn;
    if (turn === HUMAN) return;
    const historyLen = match.history.length;
    watchdogTimerRef.current = window.setTimeout(() => {
      try {
        const cur = matchRef.current;
        if (!cur) return;
        if (cur.history.length !== historyLen) return;
        if (cur.round.turn !== turn || cur.round.phase !== r.phase) return;
        const acts = legalActions(cur, turn);
        if (acts.length === 0) return;
        const forced =
          botDecide(cur, turn, "neutral", {}, tuningRef.current, bluffRateRef.current) ??
          acts[0]!;
        console.warn("[truc] bot watchdog: forcing action for player", turn, forced);
        if (forced) dispatch(turn, forced);
      } catch (e) {
        console.warn("[truc] bot watchdog error", e);
      }
    }, 5000) as unknown as number;
    return () => {
      if (watchdogTimerRef.current != null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [
    match.round.turn,
    match.round.phase,
    match.history.length,
    match.round.tricks.length,
    options.paused,
    options.userPaused,
    dispatch,
  ]);

  return {
    match,
    dispatch,
    humanActions,
    shoutFlash,
    shoutFlashes,
    lastShoutByPlayer,
    shoutLabelByPlayer,
    acceptedShoutByPlayer,
    shoutFamilyByPlayer,
    envitShoutByPlayer,
    envitShoutLabelByPlayer,
    envitOutcomeByPlayer,
    newGame,
    newRound,
    setPartnerCardHintForCurrentTrick,
    setPartnerPlayStrengthForCurrentTrick,
    setPartnerSilentForCurrentTrick,
    setPartnerFoldNextTruc,
    setPartnerForceTruc,
    setPartnerForceEnvit,
    notifyChatPhrase,
    setForcedNextDealer,
    /** Comprova si algun rival d'aquest jugador ha emès una frase concreta
     *  en la ronda actual (utilitzat per al context de "Vine al meu 3"). */
    rivalsHaveSaid: (forPlayer: PlayerId, phraseId: ChatPhraseId): boolean => {
      const t = teamOf(forPlayer);
      for (const pStr of Object.keys(chatSignalsRef.current)) {
        const p = Number(pStr) as PlayerId;
        if (teamOf(p) === t) continue;
        if ((chatSignalsRef.current[p] ?? []).includes(phraseId)) return true;
      }
      return false;
    },
  };
}