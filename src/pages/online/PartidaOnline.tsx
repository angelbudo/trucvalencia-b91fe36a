import { useNavigate, useParams } from "@/lib/router-shim";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useRoomRealtime, type RoomFullDTO } from "@/online/useRoomRealtime";
import { submitAction, sendChatPhrase, sendTextMessage, setPaused, advanceBots, proposeAction, respondProposal, cancelProposal, flagPlayerInChat, leaveRoom, rematchStay } from "@/online/rooms.functions";
import { useRoomChat } from "@/online/useRoomChat";
import { useRoomTextChat } from "@/online/useRoomTextChat";
import { useRoomChatFlags } from "@/online/useRoomChatFlags";
import { buildChatFlagNotices } from "@/online/chatFlagNotices";
import { legalActions } from "@/game/engine";
import { computeShoutDisplay } from "@/game/shoutDisplay";
import { useShoutFlash, useShoutFlashes } from "@/game/useShoutFlash";
import type { Action, MatchState, PlayerId } from "@/game/types";
import type { ChatPhraseId } from "@/game/phrases";

import { TrucBoard } from "@/components/truc/TrucBoard";
import { TableChat } from "@/components/truc/TableChat";
import { BoardRoomChat } from "@/online/BoardRoomChat";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGameSettings, type TurnTimeoutSec } from "@/lib/gameSettings";
import { recordMatchResult, useMyProfile } from "@/lib/playerStats";
import { supabase } from "@/integrations/supabase/client";
import { getPresenceStatus, type PresenceStatus } from "@/online/presence";
import {
  BOT_DELAY_MS,
  LOW_LATENCY_BOT_TICK_MS,
  LOW_LATENCY_ENVIT_REVEAL_ROUND_END_MS,
  LOW_LATENCY_ROUND_END_MS,
  SHOUT_FLASH_HOLD_MS,
  SHOUT_FLASH_BUFFER_MS,
} from "@/game/chatTimings";


function currentActor(state: MatchState): PlayerId | null {
  const r = state.round;
  if (r.phase === "game-end" || r.phase === "round-end") return null;
  for (const p of [0, 1, 2, 3] as PlayerId[]) {
    if (legalActions(state, p).length === 0) continue;
    if (
      (r.envitState.kind === "pending" && r.envitState.awaitingTeam === (p % 2 === 0 ? "nos" : "ells")) ||
      (r.trucState.kind === "pending" && r.trucState.awaitingTeam === (p % 2 === 0 ? "nos" : "ells")) ||
      r.turn === p
    ) {
      return p;
    }
  }
  return null;
}

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function OnlinePartidaPage() {
  return (
    <ClientOnly fallback={<Loading />}>
      <PartidaOnline />
    </ClientOnly>
  );
}

function PartidaOnline() {
  const { codi = "" } = useParams<{ codi: string }>();
  const navigate = useNavigate();
  const { deviceId, name, hasName, ready } = usePlayerIdentity();
  const code = codi.toUpperCase();
  const { data, error, loading, runWithExplicitRefresh, applyOptimistic } = useRoomRealtime(ready ? code : null, deviceId);
  
  const [transitionActive, setTransitionActive] = useState(false);
  const state = data?.room.matchState ?? null;
  const { messages: chatMessages, reset: resetRoomChat } = useRoomChat(data?.room.id ?? null, state);
  const textMessages = useRoomTextChat(data?.room.id ?? null);
  const chatFlags = useRoomChatFlags(data?.room.id ?? null, deviceId);
  const { settings, update } = useGameSettings();

  const mySeat = data?.mySeat ?? null;
  const players = data?.players;
  const seatKinds = data?.room.seatKinds;

  useEffect(() => {
    resetRoomChat();
  }, [state?.history.length, resetRoomChat]);

  // Bot-driver: cualquier humano sentado empuja al servidor para que avance
  // UN paso de bot por petición. El servidor (advanceBots) aplica como
  // mucho UNA acción por llamada, replicando el ritmo de la partida
  // offline (~BOT_DELAY_MS entre acciones). Cuando el servidor escribe el
  // nuevo match_state, realtime lo propaga, este effect se re-ejecuta y
  // programa el siguiente tick. Watchdog: si no llega update en ~2.5s,
  // reintenta (red caída, etc.).
  useEffect(() => {
    if (!data || !state || mySeat == null || data.room.pausedAt != null) return;
    if (data.room.seatKinds[mySeat] !== "human") return;
    if (transitionActive && state.round.phase !== "round-end") return;
    const actor = currentActor(state);
    const roomId = data.room.id;
    const fire = () => {
      advanceBots({ data: { roomId, deviceId } }).catch(() => {});
    };

    // Fin de mano: dejamos que la animación de envit/recogida se reproduzca
    // antes de pedir al servidor que abra la siguiente ronda.
    if (state.round.phase === "round-end") {
      const lastSummary = state.history[state.history.length - 1];
      const envitRevealed = !!(
        lastSummary &&
        lastSummary.envitWinner &&
        !lastSummary.envitRejected &&
        lastSummary.envitPoints > 0
      );
      let delay = envitRevealed
        ? LOW_LATENCY_ENVIT_REVEAL_ROUND_END_MS
        : LOW_LATENCY_ROUND_END_MS;
      if (lastSummary && (lastSummary as any).trucRejected) {
        delay = Math.max(delay, SHOUT_FLASH_HOLD_MS + SHOUT_FLASH_BUFFER_MS + LOW_LATENCY_ROUND_END_MS);
      }
      delay += mySeat * 150;
      const timer = window.setTimeout(fire, delay);
      return () => window.clearTimeout(timer);
    }

    if (actor == null || data.room.seatKinds[actor] !== "bot") return;

    // Cadencia offline: esperamos BOT_DELAY_MS entre acciones de bot.
    // Stagger por seat para que un cliente concreto vaya primero y los
    // demás actúen como fallback si el primero no llega.
    const tickDelay = BOT_DELAY_MS + mySeat * 200;
    const firstTimer = window.setTimeout(fire, tickDelay);
    // Watchdog: si el servidor no progresa en ~2.5s (p. ej. la petición
    // se perdió), reintentamos. Se desmonta automáticamente cuando el
    // estado cambia y el effect se re-ejecuta.
    const watchdog = window.setInterval(fire, 2500);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(watchdog);
    };
  }, [data, state, mySeat, deviceId, transitionActive]);


  // Derived values — memoised against the exact inputs the board needs, so
  // unrelated updates (e.g. a player presence flip) don't rebuild them.
  const myActions = useMemo<Action[]>(
    () => (state && mySeat != null ? legalActions(state, mySeat) : []),
    [state, mySeat],
  );

  // Mateixa font de veritat que la partida offline: tots els carteles
  // (truc, envit, V/X, família, acceptat) es deriven del MatchState.
  const display = useMemo(
    () => state ? computeShoutDisplay(state) : null,
    [state],
  );
  // Flash transitori del cant (1.6s), derivat del log. Mateix hook que offline.
  const shoutFlashes = useShoutFlashes(state);
  const shoutFlash = shoutFlashes.length === 0 ? null : shoutFlashes[shoutFlashes.length - 1];

  const seatNames = useMemo(() => {
    if (mySeat == null || !players || !seatKinds) {
      return { bottom: "", right: "", top: "", left: "" };
    }
    const nameOf = (seat: PlayerId): string => {
      const occupant = players.find((p) => p.seat === seat);
      if (occupant) return occupant.name;
      return seatKinds[seat] === "bot" ? `Bot ${seat + 1}` : `Seient ${seat + 1}`;
    };
    return {
      bottom: nameOf(mySeat),
      right: nameOf(((mySeat + 1) % 4) as PlayerId),
      top: nameOf(((mySeat + 2) % 4) as PlayerId),
      left: nameOf(((mySeat + 3) % 4) as PlayerId),
    };
  }, [mySeat, players, seatKinds]);

  // `rawDealKey` brut a partir de l'snapshot actual: només té valor quan
  // estem clarament al començament d'una mà (12 cartes en mà i cap baza
  // jugada encara). Si no, és `null`. A més de `fullHands === 12` i
  // `tricks[0].cards.length === 0`, també exigim que la fase siga "play"
  // (no "round-end" / "game-end") i que no hi haja entrades al log que
  // corresponguen a aquesta mà encara — és a dir, que la mà acabe just de
  // començar a nivell semàntic, no només estructural.
  const rawDealKey = useMemo(() => {
    if (!state) return null;
    const r = state.round;
    if (r.phase === "round-end" || r.phase === "game-end") return null;
    const inHand = r.hands[0].length + r.hands[1].length + r.hands[2].length + r.hands[3].length;
    const playedThisRound = r.tricks.reduce((acc, t) => acc + t.cards.length, 0);
    if (inHand + playedThisRound !== 12) return null;
    if (r.tricks.length !== 1 || r.tricks[0].cards.length >= 4) return null;
    return `online-${state.history.length}-${state.cames}-${r.mano}`;
  }, [state]);

  // Gate d'estabilitat: només acceptem el `rawDealKey` com a vàlid si el
  // mateix valor s'ha mantingut estable durant `DEAL_STABLE_MS`. Així
  // snapshots transitòries (per exemple, una fila intermèdia que el
  // servidor escriu i sobreescriu ràpidament) no disparen l'animació.
  const DEAL_STABLE_MS = 250;
  const [stableDealKey, setStableDealKey] = useState<string | null>(null);
  useEffect(() => {
    if (rawDealKey == null) {
      setStableDealKey(null);
      return;
    }
    if (rawDealKey === stableDealKey) return;
    const t = window.setTimeout(() => {
      setStableDealKey(rawDealKey);
    }, DEAL_STABLE_MS);
    return () => window.clearTimeout(t);
  }, [rawDealKey, stableDealKey]);

  // Bloqueig del `dealKey` mentre l'animació està en curs: una vegada emetem
  // un valor no nul (que fa arrencar l'animació de repartir al TrucBoard),
  // el "congelem" fins que el `TrucBoard` ens notifica explícitament que
  // l'animació ha acabat (via `onDealAnimationEnd`). Així snapshots
  // consecutives del servidor no poden reiniciar l'animació enmig, i
  // alliberem el bloqueig en quant pot ser, sense esperar un timeout fix.
  // Mantenim un timeout de seguretat per si la senyal no arriba mai (per
  // exemple, si el board es desmunta abans de completar l'animació).
  const DEAL_ANIMATION_FALLBACK_MS = 5000;
  const lastEmittedDealKeyRef = useRef<string | null>(null);
  const animatingDealKeyRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  // `consumedDealKeyRef` recorda l'últim `dealKey` que el `TrucBoard` ja ha
  // "consumit" (animat o ignorat). Sobreviu als re-munts del board perquè
  // viu en aquest component pare, així una nova instància de `TrucBoard` no
  // tornarà a disparar l'animació per una mà ja repartida.
  const consumedDealKeyRef = useRef<string | null>(null);
  const handleDealKeyConsumed = useCallback((key: string) => {
    consumedDealKeyRef.current = key;
  }, []);
  const releaseDealLock = useCallback((key: string) => {
    if (animatingDealKeyRef.current === key) {
      animatingDealKeyRef.current = null;
    }
    if (fallbackTimerRef.current != null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);
  const handleDealAnimationEnd = useCallback((key: string) => {
    releaseDealLock(key);
  }, [releaseDealLock]);
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current != null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);
  const dealKey = useMemo(() => {
    if (stableDealKey == null) {
      // Quan ja no estem al començament de la mà, alliberem el bloqueig
      // perquè la pròxima vegada que canviï puga emetre's de nou.
      lastEmittedDealKeyRef.current = null;
      return null;
    }
    if (stableDealKey === lastEmittedDealKeyRef.current) {
      return stableDealKey;
    }
    if (animatingDealKeyRef.current != null) {
      // Encara hi ha una animació en curs: mantenim el valor anterior fins
      // que el TrucBoard ens notifique que ha acabat.
      return lastEmittedDealKeyRef.current;
    }
    lastEmittedDealKeyRef.current = stableDealKey;
    animatingDealKeyRef.current = stableDealKey;
    if (fallbackTimerRef.current != null) {
      window.clearTimeout(fallbackTimerRef.current);
    }
    const lockedKey = stableDealKey;
    fallbackTimerRef.current = window.setTimeout(() => {
      releaseDealLock(lockedKey);
    }, DEAL_ANIMATION_FALLBACK_MS);
    return stableDealKey;
  }, [stableDealKey, releaseDealLock]);

  // Re-evaluate derived presence every 10s so seats fade to "away"/"offline"
  // even when no realtime event arrives between heartbeats.
  const [presenceTick, setPresenceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPresenceTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const { seatPresence, seatPresenceLastSeen } = useMemo(() => {
    const presence: Record<PlayerId, PresenceStatus | null> = { 0: null, 1: null, 2: null, 3: null };
    const lastSeen: Record<PlayerId, string | null> = { 0: null, 1: null, 2: null, 3: null };
    if (!players || !seatKinds) return { seatPresence: presence, seatPresenceLastSeen: lastSeen };
    const now = Date.now();
    for (const seat of [0, 1, 2, 3] as PlayerId[]) {
      if (seatKinds[seat] !== "human") continue;
      const occupant = players.find((p) => p.seat === seat);
      if (!occupant) {
        presence[seat] = "offline";
        continue;
      }
      presence[seat] = getPresenceStatus(occupant.isOnline, occupant.lastSeen, now);
      lastSeen[seat] = occupant.lastSeen;
    }
    return { seatPresence: presence, seatPresenceLastSeen: lastSeen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, seatKinds, presenceTick]);

  // Avatars per seient (només jugadors humans amb perfil vinculat). Es
  // resolen via RPC pública que mapeja device_id → avatar_url.
  const humanDeviceIds = useMemo(() => {
    if (!players || !seatKinds) return [] as string[];
    return players
      .filter((p) => seatKinds[p.seat] === "human" && !!p.deviceId)
      .map((p) => p.deviceId);
  }, [players, seatKinds]);
  const [avatarsByDevice, setAvatarsByDevice] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (humanDeviceIds.length === 0) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_public_avatars_by_devices", {
        p_device_ids: humanDeviceIds,
      });
      if (!alive || error || !data) return;
      setAvatarsByDevice((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ device_id: string; avatar_url: string | null }>) {
          next[row.device_id] = row.avatar_url ?? null;
        }
        return next;
      });
    })();
    return () => { alive = false; };
  }, [humanDeviceIds.join("|")]);
  const { profile: myProfile } = useMyProfile();
  const seatAvatars = useMemo<Record<PlayerId, string | null>>(() => {
    const out: Record<PlayerId, string | null> = { 0: null, 1: null, 2: null, 3: null };
    if (!players || !seatKinds) return out;
    for (const seat of [0, 1, 2, 3] as PlayerId[]) {
      if (seatKinds[seat] !== "human") continue;
      const occupant = players.find((p) => p.seat === seat);
      if (!occupant) continue;
      let url = avatarsByDevice[occupant.deviceId] ?? null;
      // Fallback per al meu propi seient: si el RPC encara no ha resolt
      // el meu avatar, usa el del perfil autenticat carregat localment.
      if (!url && mySeat != null && seat === mySeat && myProfile?.avatar_url) {
        url = myProfile.avatar_url;
      }
      out[seat] = url;
    }
    return out;
  }, [players, seatKinds, avatarsByDevice, mySeat, myProfile?.avatar_url]);

  // Stable refs to the latest values handlers depend on. Using refs lets
  // dispatchAction / handleSay / handleSendText keep referential identity
  // across renders, so React.memo on TrucBoard / TableChat doesn't tear down
  // and rebuild children every time `data` mutates (which happens twice per
  // local move: optimistic apply + realtime echo).
  const dispatchCtxRef = useRef<{
    roomId: string | null;
    mySeat: PlayerId | null;
    deviceId: string;
  }>({ roomId: null, mySeat: null, deviceId });
  dispatchCtxRef.current = {
    roomId: data?.room.id ?? null,
    mySeat,
    deviceId,
  };

  const dispatchAction = useCallback(async (player: PlayerId, action: Action) => {
    const ctx = dispatchCtxRef.current;
    if (!ctx.roomId) return;
    let rollback: (() => void) | null = null;
    let markHttp: ((ok: boolean) => void) | null = null;
    if (ctx.mySeat != null && player === ctx.mySeat) {
      const handle = applyOptimistic(player, action);
      rollback = handle.rollback;
      markHttp = handle.markHttp;
    }
    const isTransient = (err: unknown): boolean => {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      return (
        msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("network request failed") ||
        msg.includes("timeout") ||
        msg.includes("timed out") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("ecconn") ||
        msg.includes("aborted")
      );
    };
    const trySubmit = async () => {
      const result = await submitAction({ data: { roomId: ctx.roomId!, deviceId: ctx.deviceId, action } });
      return result;
    };
    try {
      const result = await trySubmit();
      if (result?.stale) {
        // State was stale (race with bot advance) — silently rollback and refresh
        if (rollback) rollback();
        try { await runWithExplicitRefresh(async () => {}); } catch { /* noop */ }
        return;
      }
      if (markHttp) markHttp(true);
    } catch (firstErr) {
      if (isTransient(firstErr)) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          const result = await trySubmit();
          if (result?.stale) {
            if (rollback) rollback();
            try { await runWithExplicitRefresh(async () => {}); } catch { /* noop */ }
            return;
          }
          if (markHttp) markHttp(true);
          return;
        } catch (retryErr) {
          if (markHttp) markHttp(false);
          if (rollback) rollback();
          toast.error(retryErr instanceof Error ? retryErr.message : String(retryErr));
          try { await runWithExplicitRefresh(async () => {}); } catch { /* noop */ }
          return;
        }
      }
      if (markHttp) markHttp(false);
      if (rollback) rollback();
      toast.error(firstErr instanceof Error ? firstErr.message : String(firstErr));
      try { await runWithExplicitRefresh(async () => {}); } catch { /* noop */ }
    }
  }, [applyOptimistic, runWithExplicitRefresh]);

  const handleSay = useCallback(async (phraseId: ChatPhraseId) => {
    const roomId = dispatchCtxRef.current.roomId;
    if (!roomId) return;
    try {
      await sendChatPhrase({ data: { roomId, deviceId: dispatchCtxRef.current.deviceId, phraseId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleSendText = useCallback(async (text: string) => {
    const roomId = dispatchCtxRef.current.roomId;
    if (!roomId) return;
    try {
      await sendTextMessage({ data: { roomId, deviceId: dispatchCtxRef.current.deviceId, text } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleFlagSeat = useCallback(async (
    targetSeat: PlayerId,
    ctx?: { messageId?: number; messageText?: string },
  ) => {
    const roomId = dispatchCtxRef.current.roomId;
    if (!roomId) return;
    try {
      const res = await flagPlayerInChat({
        data: {
          roomId,
          deviceId: dispatchCtxRef.current.deviceId,
          targetSeat,
          messageId: ctx?.messageId ?? null,
          messageText: ctx?.messageText ?? null,
        },
      });
      toast.success(`Jugador silenciat ${res.muteMinutes} min al xat (${res.reporterCount} report${res.reporterCount === 1 ? "" : "s"}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Compta humans REALMENT ocupats (presents a la sala). Una proposta
  // col·lectiva només té sentit si hi ha 2 o més humans.
  const humanCount = useMemo(() => {
    if (!players || !seatKinds) return 0;
    return players.filter((p) => seatKinds[p.seat] === "human").length;
  }, [players, seatKinds]);

  const proposeOrExecute = useCallback(async (kind: "pause" | "restart" | "resume") => {
    const ctx = dispatchCtxRef.current;
    if (!ctx.roomId) return;
    try {
      if (kind === "pause" && humanCount <= 1) {
        await setPaused({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId, paused: true } });
        return;
      }
      if (kind === "resume" && humanCount <= 1) {
        await setPaused({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId, paused: false } });
        return;
      }
      await proposeAction({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId, kind } });
      if (humanCount > 1) {
        toast.info(
          kind === "pause"
            ? "Esperant que els altres jugadors confirmen la pausa…"
            : kind === "resume"
            ? "Esperant que els altres jugadors confirmen reanudar la partida…"
            : "Esperant que els altres jugadors confirmen reiniciar la partida…",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [humanCount]);

  const handlePauseToggle = useCallback(async (next: boolean) => {
    const ctx = dispatchCtxRef.current;
    if (!ctx.roomId) return;
    try {
      if (!next) {
        await proposeOrExecute("resume");
        return;
      }
      await proposeOrExecute("pause");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [proposeOrExecute]);

  // Need a ref for status because handleNewGame captures it but we want a
  // stable identity across re-renders.
  const roomStatusRef = useRef<RoomFullDTO["room"]["status"] | null>(null);
  roomStatusRef.current = data?.room.status ?? null;

  const handleNewGame = useCallback(async () => {
    const ctx = dispatchCtxRef.current;
    if (!ctx.roomId) return;
    const status = roomStatusRef.current;
    // Final de partida (status="finished") o taula tornada al lobby:
    // l'usuari es queda i demanem una nova partida. Si la taula està
    // plena, comença immediatament; si algú ha abandonat, esperem que
    // s'ompli i el servidor l'iniciarà sol.
    if (status === "finished" || status === "lobby") {
      try {
        await rematchStay({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    // Partida en curs: cal el consentiment de tots per a reiniciar.
    if (humanCount <= 1) {
      try {
        await proposeAction({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId, kind: "restart" } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    await proposeOrExecute("restart");
  }, [humanCount, proposeOrExecute]);

  // Resposta a una proposta col·lectiva.
  const respondToProposal = useCallback(async (accept: boolean) => {
    const ctx = dispatchCtxRef.current;
    if (!ctx.roomId) return;
    try {
      const res = await respondProposal({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId, accept } });
      if (res.status === "rejected") {
        toast.error("Has rebutjat la proposta.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Detecció de canvis a la proposta (rebuig / expiració) per al proposant.
  const lastProposalRef = useRef<string | null>(null);
  const proposal = data?.room.pendingProposal ?? null;
  useEffect(() => {
    const sig = proposal
      ? `${proposal.createdAt}|${Object.values(proposal.votes).join(",")}`
      : null;
    const prev = lastProposalRef.current;
    lastProposalRef.current = sig;
    // Quan una proposta desapareix sense haver-se executat (cap canvi de status
    // observable a aquest nivell), si jo era el proposant ho interpretem com
    // a rebuig.
    if (prev && !sig && data && mySeat != null) {
      // No tenim info de qui era el proposant ara; només mostrem el toast si
      // som l'únic que va proposar (cap altra proposta entrant). Ho controlem
      // amb un ref a part.
      if (lastProposerSeatRef.current === mySeat) {
        toast.error("No han acceptat tots els jugadors, no és possible.");
      }
      lastProposerSeatRef.current = null;
    }
    if (proposal) {
      lastProposerSeatRef.current = proposal.proposerSeat;
    }
  }, [proposal, data, mySeat]);
  const lastProposerSeatRef = useRef<PlayerId | null>(null);

  // Caducitat automàtica al client: quan expira, si encara hi ha proposta,
  // la cancel·lem (un client qualsevol). Tot i així, la cancel·lació la fa
  // el primer que hi arribe.
  useEffect(() => {
    if (!proposal || !data) return;
    const ms = new Date(proposal.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      cancelProposal({ data: { roomId: data.room.id } }).catch(() => {});
      return;
    }
    const t = window.setTimeout(() => {
      cancelProposal({ data: { roomId: data.room.id } }).catch(() => {});
    }, ms + 200);
    return () => window.clearTimeout(t);
  }, [proposal, data]);

  const seatNamesBySeat = useMemo<Record<PlayerId, string>>(() => {
    const out: Record<PlayerId, string> = { 0: "", 1: "", 2: "", 3: "" };
    if (players && seatKinds) {
      for (const seat of [0, 1, 2, 3] as PlayerId[]) {
        const occupant = players.find((p) => p.seat === seat);
        out[seat] = occupant
          ? occupant.name
          : seatKinds[seat] === "bot" ? `Bot ${seat + 1}` : `Seient ${seat + 1}`;
      }
    }
    return out;
  }, [players, seatKinds]);

  const flagNotices = useMemo(
    () => buildChatFlagNotices(chatFlags.flags, deviceId, seatNamesBySeat),
    [chatFlags.flags, deviceId, seatNamesBySeat],
  );

  const handleAbandon = useCallback(async () => {
    const ctx = dispatchCtxRef.current;
    if (ctx.roomId) {
      try {
        await leaveRoom({ data: { roomId: ctx.roomId, deviceId: ctx.deviceId } });
      } catch {
        // No bloquegem la navegació si la crida falla; el servidor té
        // mecanismes de neteja per detectar humans desconnectats.
      }
    }
    navigate("/");
  }, [navigate]);
  const handleChangeTurnTimeoutSec = useCallback(
    (sec: TurnTimeoutSec) => update({ turnTimeoutSec: sec }),
    [update],
  );

  // Modal de confirmació per a la proposta col·lectiva (mostrat a tots els
  // humans excepte al proposant, mentre el seu vot encara siga "pending").
  const myVote = proposal && mySeat != null ? proposal.votes[String(mySeat)] : undefined;
  const showProposalModal =
    !!proposal &&
    mySeat != null &&
    proposal.proposerSeat !== mySeat &&
    myVote === "pending";


  if (!ready || loading) return <Loading />;
  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-5">
        <p className="text-destructive text-sm text-center">{error}</p>
        <Button onClick={() => navigate("/")} variant="outline">Tornar a inici</Button>
      </main>
    );
  }
  if (!data) return <Loading />;

  // Room transitioned away from "playing" — show contextual UI instead of
  // infinite loading when matchState becomes null.
  const roomStatus = data.room.status;
  // "abandoned": la taula s'ha tancat definitivament.
  if (roomStatus === "abandoned") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <h2 className="font-display font-bold text-gold text-xl">Taula tancada</h2>
        <p className="text-sm text-muted-foreground text-center">
          Aquesta taula ha sigut tancada.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => navigate("/")} variant="outline">Tornar a inici</Button>
          <Button onClick={() => navigate("/")}>Inici</Button>
        </div>
      </main>
    );
  }
  // "finished": mantenim el TrucBoard renderitzat per a que es veja
  //   l'overlay final amb els botons "Nova partida" / "Abandonar".
  // "lobby": si veníem d'una partida acabada i algú ha eixit, la taula
  //   torna a lobby esperant nous jugadors. Mostrem una pantalla d'espera.
  if (roomStatus === "lobby") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <h2 className="font-display font-bold text-gold text-xl">Esperant jugadors</h2>
        <p className="text-sm text-muted-foreground text-center">
          La taula està esperant que s'òmpliguen els seients lliures. La nova partida començarà automàticament.
        </p>
        <Button onClick={handleAbandon} variant="outline">Abandonar la taula</Button>
      </main>
    );
  }

  if (!state) return <Loading />;

  if (mySeat == null) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-5">
        <p className="text-sm text-muted-foreground text-center">No estàs en aquesta partida.</p>
        <Button onClick={() => navigate(`/online/sala/${code}`)} variant="outline">Entrar a la sala</Button>
      </main>
    );
  }

  return (
    <>
      <TrucBoard
        match={state as MatchState}
        humanActions={myActions}
        dispatch={dispatchAction}
        shoutFlash={shoutFlash}
        shoutFlashes={shoutFlashes}
        lastShoutByPlayer={display!.lastShoutByPlayer}
        shoutLabelByPlayer={display!.shoutLabelByPlayer}
        acceptedShoutByPlayer={display!.acceptedShoutByPlayer}
        shoutFamilyByPlayer={display!.shoutFamilyByPlayer}
        envitShoutByPlayer={display!.envitShoutByPlayer}
        envitShoutLabelByPlayer={display!.envitShoutLabelByPlayer}
        envitOutcomeByPlayer={display!.envitOutcomeByPlayer}
        messages={chatMessages}
        onSay={handleSay}
        onNewGame={handleNewGame}
        onAbandon={handleAbandon}
        onMatchEnd={(winnerTeam) => {
          if (mySeat == null || !seatKinds) return;
          const myTeam: "nos" | "ells" = (mySeat % 2 === 0) ? "nos" : "ells";
          const won = winnerTeam === myTeam;
          // Comptem oponents (3 seients que no són el meu)
          let humans = 0; let bots = 0;
          for (let s = 0; s < 4; s++) {
            if (s === mySeat) continue;
            const k = seatKinds[s];
            if (k === "human") humans++;
            else if (k === "bot") bots++;
            else bots++; // seient buit: comptat com a bot per a l'XP
          }
          void recordMatchResult(won, humans, bots);
        }}
        perspectiveSeat={mySeat}
        seatNames={seatNames}
        dealKey={dealKey}
        initialConsumedDealKey={consumedDealKeyRef.current}
        onDealKeyConsumed={handleDealKeyConsumed}
        onDealAnimationEnd={handleDealAnimationEnd}
        onTransitionActiveChange={setTransitionActive}
        
        belowHandSlot={
          <TableChat
            messages={textMessages}
            mySeat={mySeat}
            seatNames={seatNamesBySeat}
            onSend={handleSendText}
            roomCode={code}
            mutedSeatsExpiry={chatFlags.mutedSeatsExpiry}
            myMuteExpiresAt={chatFlags.myMuteExpiresAt}
            onFlagSeat={handleFlagSeat}
            iAlreadyFlaggedSeat={chatFlags.iAlreadyFlagged}
            flagNotices={flagNotices}
          />
        }
        turnTimeoutSec={(data.room.turnTimeoutSec ?? settings.turnTimeoutSec) as TurnTimeoutSec}
        onChangeTurnTimeoutSec={handleChangeTurnTimeoutSec}
        turnAnchorAt={data.room.turnStartedAt}
        seatPresence={seatPresence}
        seatPresenceLastSeen={seatPresenceLastSeen}
        seatAvatars={seatAvatars}
        onPauseToggle={handlePauseToggle}
        paused={data.room.pausedAt != null}
      />
      <BoardRoomChat
        roomId={data.room.id}
        roomCode={code}
        deviceId={deviceId}
        name={name}
        hasName={hasName}
        ready={ready}
        mySeat={mySeat}
        players={players ?? []}
        buttonClassName="fixed right-4 top-[104px] z-40 h-12 w-12 rounded-full text-primary-foreground shadow-lg bg-accent"
      />
      {showProposalModal && proposal && (
        <div
          className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-card border-2 border-primary rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-foreground">
              {proposal.kind === "pause"
                ? `${proposal.proposerName} vol pausar la partida`
                : proposal.kind === "resume"
                ? `${proposal.proposerName} vol reanudar la partida`
                : `${proposal.proposerName} vol començar de nou la partida`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Cal el consentiment de tots els jugadors humans. Si no acceptes, la
              proposta es cancel·larà.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => respondToProposal(false)}>
                No accepte
              </Button>
              <Button onClick={() => respondToProposal(true)}>
                Accepte
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default OnlinePartidaPage;