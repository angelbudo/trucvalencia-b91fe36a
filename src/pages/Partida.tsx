import { useNavigate, useSearchParams } from "@/lib/router-shim";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { useTrucMatch, clearSavedMatch } from "@/hooks/useTrucMatch";
import { usePlayerChat } from "@/hooks/usePlayerChat";
import { TrucBoard } from "@/components/truc/TrucBoard";
import { TableChat } from "@/components/truc/TableChat";
import { LocalMatchTranscriptChat } from "@/components/truc/LocalMatchTranscriptChat";
import type { RoomTextMessage } from "@/online/useRoomTextChat";
import type { PlayerId } from "@/game/types";
import { cardStrength, playerTotalEnvit } from "@/game/deck";
import type { ChatPhraseId, ChatMessage } from "@/game/phrases";

import { useGameSettings, bluffRateOf } from "@/lib/gameSettings";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { usePlayerProfile } from "@/lib/playerProfile";
import { recordMatchResult, useMyProfile } from "@/lib/playerStats";
import { applyDifficulty } from "@/game/profileAdaptation";
import { legalActions } from "@/game/engine";

import { translate } from "@/i18n/useT";

const HUMAN: PlayerId = 0;
const PARTNER_PID: PlayerId = 2;

function PartidaLoading() {
  // Avoid useT here to keep loading minimal; default valencià text via translate
  // is fine because it's a flash before content renders.
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{translate("match.loading")}</p>
    </main>
  );
}

function Partida() {
  return (
    <ClientOnly fallback={<PartidaLoading />}>
      <PartidaClient />
    </ClientOnly>
  );
}

function PartidaClient() {
  const [search] = useSearchParams();
  const camesRaw = Number(search.get("cames"));
  const manoRaw = Number(search.get("mano"));
  const targetCamaRaw = Number(search.get("targetCama"));
  const targetCames = (camesRaw === 1 || camesRaw === 2 || camesRaw === 3 ? camesRaw : 2);
  const initialMano = ((manoRaw === 0 || manoRaw === 1 || manoRaw === 2 || manoRaw === 3 ? manoRaw : 0)) as PlayerId;
  const targetCama = (targetCamaRaw === 9 || targetCamaRaw === 12 ? targetCamaRaw : 12);
  const resume = search.get("resume") === "1";
  const { messages, say: rawSay, reset: resetPlayerChat } = usePlayerChat();
  // Transcripció completa de tot el que diuen jugadors i bots durant la
  // partida (preguntes, respostes, indicacions). Es mostra al panell del
  // botó de xat flotant perquè l'usuari puga rellegir-ho.
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const say = useCallback(
    (
      player: PlayerId,
      phraseId: ChatPhraseId,
      durationMs?: number,
      vars?: Record<string, string | number>,
    ) => {
      setTranscript((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          player,
          phraseId,
          timestamp: Date.now(),
          vars,
        },
      ]);
      rawSay(player, phraseId, durationMs, vars);
    },
    [rawSay],
  );
  const { settings } = useGameSettings();
  const { deviceId } = usePlayerIdentity();
  const { tuning: rawTuning, track, flush } = usePlayerProfile(deviceId || null, settings.botDifficulty, settings.botHonesty);
  const tuning = applyDifficulty(rawTuning, settings.botDifficulty);
  const bluffRate = bluffRateOf(settings.botHonesty);
  const [paused, setPaused] = useState(false);
  // Bloqueig mentre s'està reproduint la seqüència d'animacions de
  // transició entre mans (recollida → pase del mazo → repartiment). Mentre
  // dura, pausem el motor del joc perquè els bots no juguen la mà nova
  // abans que l'usuari haja vist el repartiment.
  const [animLock, setAnimLock] = useState(false);
  // Xat de text local (només l'humà escriu; els bots no participen).
  const [textMessages, setTextMessages] = useState<RoomTextMessage[]>([]);
  const handleSendText = async (text: string) => {
    if (paused) return;
    setTextMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        seat: HUMAN,
        text,
        createdAt: Date.now(),
      },
    ]);
  };
  // Seients lògics: HUMAN=0 (baix), RIGHT=1 (dreta), PARTNER=2 (dalt), LEFT=3 (esquerra).
  const seatNamesBySeat: Record<PlayerId, string> = {
    0: translate("common.you"),
    1: translate("common.bot_right"),
    2: translate("common.partner"),
    3: translate("common.bot_left"),
  };
  const { profile: myProfile } = useMyProfile();
  const seatAvatars: Record<PlayerId, string | null> = {
    0: myProfile?.avatar_url ?? null,
    1: null,
    2: null,
    3: null,
  };
  const {
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
    setPartnerCardHintForCurrentTrick,
    setPartnerPlayStrengthForCurrentTrick,
    setPartnerSilentForCurrentTrick,
    setPartnerFoldNextTruc,
    setPartnerForceTruc,
    setPartnerForceEnvit,
    notifyChatPhrase,
  } = useTrucMatch({
    say,
    targetCames,
    targetCama,
    initialMano,
    resume,
    tuning,
    bluffRate,
    trackProfile: track,
    // En acabar cada ronda, força un flush dels esdeveniments humans pendents.
    // El hook recarrega el perfil i recalcula `tuning`, que entra en vigor
    // immediatament per a les decisions dels bots de la ronda següent.
    onRoundEnd: () => { void flush(); },
    paused: paused || animLock,
    userPaused: paused,
  });

  const r = match.round;
  const navigate = useNavigate();

  useEffect(() => {
    resetPlayerChat();
  }, [match.history.length, resetPlayerChat]);

  // Afegeix els cants (envit/truc/vull/no-vull/...) del log de la ronda
  // actual al transcript del xat. Així l'usuari pot rellegir-los a banda
  // dels carteles centrals i de la veu locutada.
  const shoutLogSeenRef = useRef<{ round: number; lastIdx: number }>({
    round: -1,
    lastIdx: -1,
  });
  useEffect(() => {
    const roundKey = match.history.length;
    const seen = shoutLogSeenRef.current;
    if (seen.round !== roundKey) {
      shoutLogSeenRef.current = { round: roundKey, lastIdx: -1 };
    }
    const log = match.round.log;
    const start = shoutLogSeenRef.current.lastIdx + 1;
    const SHOUT_TEXT: Record<string, string> = {
      envit: "Envit!",
      renvit: "Renvit!",
      "falta-envit": "Falta envit!",
      vull: "Vull!",
      "no-vull": "No vull",
      truc: "Truc!",
      retruc: "Retruc!",
      quatre: "Quatre val!",
      "joc-fora": "Joc fora!",
      passe: "Passe",
      "so-meues": "Són meues",
    };
    const newEntries: ChatMessage[] = [];
    for (let i = start; i < log.length; i++) {
      const ev = log[i];
      shoutLogSeenRef.current.lastIdx = i;
      if (ev.type !== "shout") continue;
      const text = SHOUT_TEXT[ev.what];
      if (!text) continue;
      newEntries.push({
        id: `shout-${roundKey}-${i}`,
        player: ev.player,
        phraseId: "envida" as ChatPhraseId, // placeholder; renderitzem `text`
        timestamp: Date.now(),
        text,
      });
    }
    if (newEntries.length > 0) {
      setTranscript((prev) => [...prev, ...newEntries]);
    }
  }, [match]);

  const [dealNonce, setDealNonce] = useState(0);
  const computedDealKey = (() => {
    const fullHands = r.hands[0].length + r.hands[1].length + r.hands[2].length + r.hands[3].length;
    const noPlays = r.tricks.length === 1 && r.tricks[0].cards.length === 0;
    if (fullHands === 12 && noPlays) {
      return `${match.history.length}-${match.cames}-${r.mano}#${dealNonce}`;
    }
    return null;
  })();

  const handleNewGame = () => {
    setDealNonce((n) => n + 1);
    setTranscript([]);
    shoutLogSeenRef.current = { round: -1, lastIdx: -1 };
    setTextMessages([]);
    newGame();
  };

  const handleAbandon = () => {
    clearSavedMatch();
    navigate("/");
  };

  const handleSay = (phraseId: ChatPhraseId) => {
    // Si l'humà revela el seu envit ("Tinc {n}"), calculem el valor real
    // perquè el globus mostre "Tinc 30" / "Tinc 31" etc., en lloc del
    // literal "Tinc {n}". Per a la resta de frases, no calen variables.
    const sayVars =
      phraseId === "si-tinc-n"
        ? { n: playerTotalEnvit(r, HUMAN) }
        : undefined;
    say(HUMAN, phraseId, undefined, sayVars);
    notifyChatPhrase(HUMAN, phraseId);

    if (phraseId === "envida") {
      // L'humà demana al company que envide. Marquem la intenció perquè
      // el bot company canti envit en el seu pròxim torn legal.
      // (Si el peu-bot està actualment en la finestra d'espera del 2n
      // jugador, `notifyChatPhrase` ja resol allí l'envit immediatament.)
      setPartnerForceEnvit();
      return;
    }
    if (phraseId === "truca") {
      // L'humà demana al company que truque. Marquem la intenció perquè
      // el bot company canti truc immediatament en el seu pròxim torn.
      setPartnerForceTruc();
      return;
    }
    if (phraseId === "tira-falta") {
      const falta = humanActions.find((a) => a.type === "shout" && a.what === "falta-envit");
      if (falta) dispatch(HUMAN, falta);
      return;
    }
    if (phraseId === "vamonos") {
      const noVull = humanActions.find((a) => a.type === "shout" && a.what === "no-vull");
      if (noVull && r.trucState.kind === "pending") dispatch(HUMAN, noVull);
      setPartnerFoldNextTruc();
      return;
    }
    if (phraseId === "juega-callado") { setPartnerSilentForCurrentTrick(); return; }
    if (phraseId === "pon-fort") { setPartnerCardHintForCurrentTrick("fort"); return; }
    if (phraseId === "pon-molesto") { setPartnerCardHintForCurrentTrick("molesto"); return; }
    if (phraseId === "vine-al-teu-tres") { setPartnerCardHintForCurrentTrick("tres"); return; }

    if (phraseId === "vine-a-mi" || phraseId === "vine-al-meu-tres") {
      setPartnerPlayStrengthForCurrentTrick("low");
      return;
    }
    if (phraseId === "vine-a-vore") {
      // L'hum\u00e0 ha dit "Vine a vore!": t\u00e9 7 oros o un 3 i s'encarrega
      // ell de la baza. El bot company ha de jugar la carta m\u00e9s baixa
      // per reservar les bones, igual que amb "Vine a mi!".
      setPartnerPlayStrengthForCurrentTrick("low");
      return;
    }
    if (phraseId === "tinc-bona" || phraseId === "tinc-un-tres") {
      setPartnerPlayStrengthForCurrentTrick("free");
      return;
    }
    if (phraseId === "a-tu" || phraseId === "no-tinc-res") {
      setPartnerPlayStrengthForCurrentTrick("high");
      return;
    }

    // Si l'envit ja s'ha cantat (o resolt) en aquesta ronda, el bot no
    // pot tornar a dir "Envida!": com a molt diu "Sí".
    const envitAlreadyCalled = r.envitState.kind !== "none" || r.envitResolved;
    const noEnvida = (p: ChatPhraseId): ChatPhraseId =>
      envitAlreadyCalled && p === "envida" ? "si" : p;

    if (phraseId === "tens-envit") {
      const partnerEnvit = playerTotalEnvit(r, PARTNER_PID);
      window.setTimeout(() => {
        let ans: ChatPhraseId;
        if (partnerEnvit >= 31) ans = noEnvida(Math.random() < 0.5 ? "envida" : "si");
        else if (partnerEnvit === 30) ans = Math.random() < 0.25 ? "si-tinc-n" : "si";
        else ans = "no";
        if (ans === "si-tinc-n") say(PARTNER_PID, ans, undefined, { n: partnerEnvit });
        else say(PARTNER_PID, ans);
      }, 1100);
      return;
    }

    if (phraseId === "vols-envide") {
      const partnerEnvit = playerTotalEnvit(r, PARTNER_PID);
      window.setTimeout(() => {
        let ans: ChatPhraseId;
        if (partnerEnvit >= 31) ans = noEnvida(Math.random() < 0.5 ? "envida" : "si");
        else if (partnerEnvit === 29 || partnerEnvit === 30) ans = Math.random() < 0.25 ? "si-tinc-n" : "no";
        else ans = "no";
        if (ans === "si-tinc-n") say(PARTNER_PID, ans, undefined, { n: partnerEnvit });
        else say(PARTNER_PID, ans);
      }, 1100);
      return;
    }

    if (phraseId === "vols-tornar-envidar") {
      const partnerEnvit = playerTotalEnvit(r, PARTNER_PID);
      let manoPriorityOverCaller = false;
      if (r.envitState.kind === "pending") {
        const caller = r.envitState.calledBy;
        let p: PlayerId = r.mano;
        for (let i = 0; i < 4; i++) {
          if (p === PARTNER_PID) { manoPriorityOverCaller = true; break; }
          if (p === caller) { manoPriorityOverCaller = false; break; }
          p = ((p + 1) % 4) as PlayerId;
        }
      }
      window.setTimeout(() => {
        const ans: ChatPhraseId =
          partnerEnvit >= 33 || (partnerEnvit === 32 && manoPriorityOverCaller)
            ? "si"
            : "no";
        say(PARTNER_PID, ans);
        if (ans === "si") {
          const renvit = legalActions(match, PARTNER_PID).find(
            (a) => a.type === "shout" && (a.what === "renvit" || a.what === "falta-envit"),
          );
          if (renvit) dispatch(PARTNER_PID, renvit);
        }
      }, 1100);
      return;
    }

    if (phraseId === "quant-envit") {
      // Resposta única i sincera: "Tinc {n}" amb el valor real del company.
      const partnerEnvit = playerTotalEnvit(r, PARTNER_PID);
      window.setTimeout(() => {
        say(PARTNER_PID, "si-tinc-n", undefined, { n: partnerEnvit });
      }, 1100);
      return;
    }

    if (
      phraseId === "puc-anar" ||
      phraseId === "que-tens" ||
      phraseId === "portes-un-tres" ||
      phraseId === "tens-mes-dun-tres"
    ) {
      const partnerHand = r.hands[PARTNER_PID];
      const topCards = partnerHand.filter((c) => cardStrength(c) >= 85).length;
      // Cartes ≥ 90 (As espases, As bastos, 7 espases) — autoritzen "Vine a mi!".
      const vineAMiCards = partnerHand.filter((c) => cardStrength(c) >= 90).length;
      // Manilla d'oros (7 oros, str=85) sense les ≥ 90.
      const has7Oros = partnerHand.some((c) => c.rank === 7 && c.suit === "oros");
      const onlyManillaOros = vineAMiCards === 0 && has7Oros;
      const threeCount = partnerHand.filter((c) => c.rank === 3).length;
      window.setTimeout(() => {
        let answer: ChatPhraseId;
        if (phraseId === "portes-un-tres") {
          answer = threeCount >= 1 ? "si" : "no";
        } else if (phraseId === "tens-mes-dun-tres") {
          if (topCards >= 1) {
            answer = Math.random() < 0.5 ? "si" : "tinc-bona";
          } else if (threeCount >= 1) {
            answer = Math.random() < 0.5 ? "tinc-un-tres" : "no";
          } else {
            answer = "no";
          }
        } else if (phraseId === "que-tens") {
          // 1a baza amb la 7 d'espases com a millor carta (sense As):
          // pot dir "Vine a mi!" o "Vine a vore!" (50/50).
          const handBest = partnerHand.length > 0
            ? Math.max(...partnerHand.map((c) => cardStrength(c)))
            : -1;
          const topIs7Espases = r.tricks.length === 1 && handBest === 90;
          if (vineAMiCards >= 1) {
            answer = topIs7Espases && Math.random() < 0.5 ? "vine-a-vore" : "vine-a-mi";
          } else if (onlyManillaOros) {
            answer = Math.random() < 0.5 ? "tinc-bona" : "vine-a-vore";
          } else if (threeCount >= 1) {
            // Té un 3 sense cap carta top de truc: l'única resposta
            // possible és "Tinc un 3". Mai "Vine a vore!" ni "Vine al meu
            // tres" — un 3 sol no justifica demanar al company que vinga.
            answer = "tinc-un-tres";
          } else {
            // Sense cap carta bona: "No tinc res" o "A tu" indistintament.
            answer = Math.random() < 0.5 ? "no-tinc-res" : "a-tu";
          }
        } else {
          // "puc-anar"
          const handBestPA = partnerHand.length > 0
            ? Math.max(...partnerHand.map((c) => cardStrength(c)))
            : -1;
          const topIs7EspasesPA = r.tricks.length === 1 && handBestPA === 90;
          if (vineAMiCards >= 1) {
            answer = topIs7EspasesPA && Math.random() < 0.5 ? "vine-a-vore" : "vine-a-mi";
          } else if (onlyManillaOros) {
            answer = Math.random() < 0.5 ? "tinc-bona" : "vine-a-vore";
          } else if (threeCount >= 1) {
            // Només té un 3 com a millor carta i cap carta de truc bona:
            // l'única resposta possible és "Tinc un 3".
            answer = "tinc-un-tres";
          } else {
            // Sense cap carta bona: respon "A tu!" (mai "No tinc res" a
            // "Puc anar a tu?").
            answer = "a-tu";
          }
        }
        // Prohibició: si en la primera baza ja s'ha jugat l'As d'espases,
        // cap bot pot dir "A tu!". Substituïm per "No tinc res".
        if (answer === "a-tu") {
          const firstTrick = r.tricks[0];
          const asEspasesOnTable = !!firstTrick && firstTrick.cards.some(
            (tc) => tc.card.rank === 1 && tc.card.suit === "espases",
          );
          if (asEspasesOnTable) answer = "no-tinc-res";
        }
        say(PARTNER_PID, answer);
      }, 1100);
    }
  };


  return (
    <>
      <TrucBoard
        match={match}
        humanActions={humanActions}
        dispatch={dispatch}
        shoutFlash={shoutFlash}
        shoutFlashes={shoutFlashes}
        lastShoutByPlayer={lastShoutByPlayer}
        shoutLabelByPlayer={shoutLabelByPlayer}
        acceptedShoutByPlayer={acceptedShoutByPlayer}
        shoutFamilyByPlayer={shoutFamilyByPlayer}
        envitShoutByPlayer={envitShoutByPlayer}
        envitShoutLabelByPlayer={envitShoutLabelByPlayer}
        envitOutcomeByPlayer={envitOutcomeByPlayer}
        messages={messages}
        onSay={handleSay}
        onNewGame={handleNewGame}
        onAbandon={handleAbandon}
        seatAvatars={seatAvatars}
        onMatchEnd={(winnerTeam) => {
          // Local: humà sempre seient 0 (equip "nos") amb 3 bots
          const won = winnerTeam === "nos";
          void recordMatchResult(won, 0, 3);
        }}
        dealKey={computedDealKey}
        onTransitionActiveChange={setAnimLock}
        turnTimeoutSec={settings.turnTimeoutSec}
        paused={paused}
        onPauseToggle={(next) => setPaused(next)}
        belowHandSlot={
          <TableChat
            messages={textMessages}
            mySeat={HUMAN}
            seatNames={seatNamesBySeat}
            onSend={handleSendText}
            disabled={paused}
          />
        }
      />
      <LocalMatchTranscriptChat
        messages={transcript}
        mySeat={HUMAN}
        seatNames={seatNamesBySeat}
        buttonClassName="fixed right-4 top-[104px] z-40 h-12 w-12 rounded-full text-primary-foreground shadow-lg bg-accent"
      />
    </>
  );
}
export default Partida;