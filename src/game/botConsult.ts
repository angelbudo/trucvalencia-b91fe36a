import type { MatchState, PlayerId } from "./types";
import { partnerOf, teamOf } from "./types";
import { cardStrength, playerTotalEnvit, asEspasesPlayedFirstTrick, SUITS, RANKS } from "./deck";
import type { ChatPhraseId } from "./phrases";
import type { BotTuning } from "./profileAdaptation";
import { NEUTRAL_TUNING } from "./profileAdaptation";

export type PartnerAdvice = "strong" | "three" | "weak" | "neutral";

/**
 * Indica si el bot está a punto de tirar como primero de su pareja
 * en una baza (su compañero aún no ha jugado en esta baza).
 */
export function isBotOpeningForTeam(m: MatchState, bot: PlayerId): boolean {
  const r = m.round;
  if (r.phase !== "playing" && r.phase !== "envit") return false;
  if (r.turn !== bot) return false;
  if (r.envitState.kind === "pending") return false;
  if (r.trucState.kind === "pending") return false;
  const trick = r.tricks[r.tricks.length - 1];
  if (!trick) return false;
  const partner = partnerOf(bot);
  const partnerPlayed = trick.cards.some((tc) => tc.player === partner);
  if (partnerPlayed) return false;
  // Si yo soy el primero de la baza está claro que el partner no ha jugado.
  // Si yo voy en 3er lugar (mi partner aún no jugó) también soy el primero de mi pareja.
  return true;
}

/**
 * Comprova si el bot té alguna carta "bona de truc":
 * 3, manilla d'oros (7 oros), manilla d'espases (7 espases),
 * as de bastos o as d'espases.
 */
export function hasGoodTrucCard(m: MatchState, bot: PlayerId): boolean {
  const hand = m.round.hands[bot];
  return hand.some(
    (c) =>
      c.rank === 3 ||
      (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
      (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
  );
}

/**
 * En la 1a baza: si el bot és el primer de la seua parella a tirar, ja
 * hi ha alguna carta "top" (força ≥ 80: 7 oros, 7 espases, As bastos o
 * As espases) jugada per un rival, i el bot no té cap carta a la mà
 * que la supere, no té sentit que pregunte "Puc anar?" / "Què tens?".
 * En lloc d'això ha de dir "A tu!" i tirar la seua carta més baixa
 * (cedir la baza explícitament al company).
 */
export function shouldFoldFirstTrickAsTu(m: MatchState, bot: PlayerId): boolean {
  const r = m.round;
  if (r.tricks.length !== 1) return false;
  if (!isBotOpeningForTeam(m, bot)) return false;
  const trick = r.tricks[0];
  if (!trick) return false;
  const myTeam = teamOf(bot);
  let tableBest = -1;
  let rivalTopOnTable = false;
  for (const tc of trick.cards) {
    const s = cardStrength(tc.card);
    if (s > tableBest) tableBest = s;
    if (teamOf(tc.player) !== myTeam && s >= 80) rivalTopOnTable = true;
  }
  if (!rivalTopOnTable) return false;
  const hand = r.hands[bot] ?? [];
  const canBeat = hand.some((c) => cardStrength(c) > tableBest);
  return !canBeat;
}

/**
 * Comprova si el bot té els dos asos (espases + bastos): ja té el truc guanyat.
 */
export function hasBothAces(m: MatchState, bot: PlayerId): boolean {
  const hand = m.round.hands[bot];
  const hasAsEspases = hand.some((c) => c.rank === 1 && c.suit === "espases");
  const hasAsBastos = hand.some((c) => c.rank === 1 && c.suit === "bastos");
  return hasAsEspases && hasAsBastos;
}

/**
 * Decide si el bot debe consultar al compañero antes de tirar.
 * Reglas:
 *  - Primera baza i és el primer de la seua parella: consulta SEMPRE si té
 *    alguna carta bona de truc (excepte si ja té els dos asos).
 *  - Primera baza sense cartes bones: no consulta (dirà "A tu!" i tirarà).
 *  - Segunda baza: consulta si la mejor carta restante es media (duda).
 */
export function shouldConsultPartner(
  m: MatchState,
  bot: PlayerId,
  tuning: BotTuning = NEUTRAL_TUNING,
): boolean {
  const r = m.round;
  const hand = r.hands[bot];
  if (hand.length === 0) return false;

  // Si el company ja ha jugat la seua carta en aquesta baza, no té sentit
  // preguntar-li res: ja ha mostrat el que tenia per a esta baza.
  const currentTrick = r.tricks[r.tricks.length - 1];
  const partner = partnerOf(bot);
  if (currentTrick && currentTrick.cards.some((tc) => tc.player === partner)) {
    return false;
  }

  // Si algun rival ja ha jugat en aquesta baza i el bot no té cap carta
  // capaç de superar la carta més forta jugada pels rivals (per exemple,
  // han tirat l'As d'espases, o el bot només té cartes baixes), no té
  // sentit consultar res al company: la baza ja està perduda per a este
  // jugador. Tirarà la carta més baixa i prou.
  if (currentTrick) {
    const myTeam = teamOf(bot);
    const rivalCardsPlayed = currentTrick.cards.filter(
      (tc) => teamOf(tc.player) !== myTeam,
    );
    if (rivalCardsPlayed.length > 0) {
      const strongestRival = Math.max(
        ...rivalCardsPlayed.map((tc) => cardStrength(tc.card)),
      );
      const myStrongest = Math.max(...hand.map((c) => cardStrength(c)));
      if (myStrongest <= strongestRival) {
        return false;
      }
    }
  }

  const strengths = hand.map((c) => cardStrength(c)).sort((a, b) => b - a);
  const top = strengths[0]!;
  const low = strengths[strengths.length - 1]!;
  const trickIdx = r.tricks.length - 1;

  // `consultRate` modulates probabilistic consultations:
  //  - conservative bots (rate>1) ask more often, including without strong cards
  //  - aggressive bots (rate<1) skip the chat and play directly
  // Mandatory consults (carta bona de truc as opener) are still always done
  // because they are tactically required, not chat-flavor.
  const cr = Math.max(0, tuning.consultRate ?? 1);
  const clamp = (p: number) => Math.max(0, Math.min(1, p * cr));

  if (trickIdx === 0) {
    // Si ja s'ha jugat una carta "top" (força ≥ 80: 7 oros, 7 espases, As bastos
    // o As espases) per part d'algun rival i el bot, com a primer de la seua
    // parella, té una carta top que la supera, no té sentit consultar al
    // company: tirarà la seua carta top i guanyarà la baza.
    if (currentTrick && isBotOpeningForTeam(m, bot)) {
      const myTeam2 = teamOf(bot);
      const rivalTops = currentTrick.cards
        .filter((tc) => teamOf(tc.player) !== myTeam2)
        .map((tc) => cardStrength(tc.card))
        .filter((s) => s >= 80);
      if (rivalTops.length > 0) {
        const maxRivalTop = Math.max(...rivalTops);
        const myTopStrength = Math.max(...hand.map((c) => cardStrength(c)));
        if (myTopStrength >= 80 && myTopStrength > maxRivalTop) {
          return false;
        }
      }
    }
    // Equip rival (Bot Esq. ↔ Bot Dre.): repliquem la mateixa lògica
    // que entre el jugador humà i el seu company. El primer de la parella
    // en obrir la baza SEMPRE pregunta al seu company perquè la conversa
    // entre bots rivals siga sempre visible (excepte si ja té els dos asos).
    const HUMAN_PID: PlayerId = 0;
    const partner = partnerOf(bot);
    const isRivalBotPair = bot !== HUMAN_PID && partner !== HUMAN_PID;
    if (isRivalBotPair && isBotOpeningForTeam(m, bot)) {
      if (hasBothAces(m, bot)) return false;
      // Aggressive bots skip even rival-pair chat sometimes; conservative
      // always asks. Cap at 0.4 so aggressive still talks ~40 %.
      return Math.random() < Math.max(0.4, Math.min(1, cr));
    }

    // Si és el primer de la seua parella en obrir la baza, consulta
    // gairebé sempre per a fer xat: amb carta bona de truc, segur; sense
    // ella, amb una probabilitat alta perquè la conversa entre rivals
    // siga visible. Excepció: si ja té els dos asos, no cal consultar.
    if (isBotOpeningForTeam(m, bot)) {
      if (hasBothAces(m, bot)) return false;
      if (hasGoodTrucCard(m, bot)) {
        // Tactically required → always ask in conservative/balanced.
        // Aggressive may skip ~30 % of the time to play faster.
        return Math.random() < Math.max(0.7, Math.min(1, cr));
      }
      // Sense carta bona: encara consulta sovint per a fer xat visible.
      return Math.random() < clamp(0.7);
    }
    // Si no és el primer, manté el comportament anterior (mescla = dubte).
    const hasHigh = strengths.some((s) => s >= 70);
    const hasLow = strengths.some((s) => s <= 35);
    if (!(hasHigh && hasLow)) return false;
    return Math.random() < clamp(0.55);
  }

  if (trickIdx === 1) {
    // Si la 1a baza s'ha empardat, el bot no consulta res al company en la 2a
    // baza: simplement valora trucar i juga la seua carta més alta.
    const firstTrick0 = r.tricks[0];
    if (firstTrick0 && firstTrick0.parda === true) return false;
    // Si el meu equip ja ha guanyat la 1a baza, el truc està pràcticament
    // fet (només cal empardar o guanyar la 2a) i el bot no ha de consultar:
    // simplement jugarà la carta més baixa per reservar les fortes per a
    // un possible truc/retruc posterior.
    const myTeam = teamOf(bot);
    const firstTrick = r.tricks[0];
    const wonFirstTrick =
      !!firstTrick &&
      firstTrick.winner !== undefined &&
      firstTrick.parda !== true &&
      teamOf(firstTrick.winner!) === myTeam;
    if (wonFirstTrick) {
      // Cas especial: hem guanyat la 1a baza, sóc el 2n de la meua
      // parella en tirar (el company ja ha jugat) i a la mà només em
      // queda 1 carta forta (un 3 o una carta top) i a la mesa hi ha
      // un 3 o una carta top que la meua carta forta pot guanyar o
      // empardar. OBLIGACIÓ: pregunte "Què tens?" abans de tirar:
      //   - "Algo tinc" / "Tinc un tres" → trucarà abans de jugar.
      //   - "No tinc res" → valorarà trucar i tirarà la carta més alta.
      if (currentTrick) {
        const partnerPlayedHere = currentTrick.cards.some(
          (tc) => tc.player === partner,
        );
        const isTopCard = (rank: number, suit: string) =>
          (rank === 7 && (suit === "oros" || suit === "espases")) ||
          (rank === 1 && (suit === "bastos" || suit === "espases"));
        const strongCards = hand.filter(
          (c) => c.rank === 3 || isTopCard(c.rank, c.suit),
        );
        const tableHasThreeOrTop = currentTrick.cards.some(
          (tc) => tc.card.rank === 3 || cardStrength(tc.card) >= 80,
        );
        const tableBest = currentTrick.cards.length > 0
          ? Math.max(...currentTrick.cards.map((tc) => cardStrength(tc.card)))
          : -1;
        const myStrongest = hand.length > 0
          ? Math.max(...hand.map((c) => cardStrength(c)))
          : -1;
        const canBeatOrTie = myStrongest >= tableBest;
        if (
          partnerPlayedHere &&
          strongCards.length === 1 &&
          tableHasThreeOrTop &&
          canBeatOrTie
        ) {
          return true;
        }
        // Cas existent: si tinc un 3, pregunte amb 50% de probabilitat.
        const hasThreeNow = hand.some((c) => c.rank === 3);
        if (partnerPlayedHere && hasThreeNow) {
          return Math.random() < 0.5;
        }
      }
      return false;
    }
    // Cas especial: hem PERDUT la 1a baza, sóc el 2n de la meua parella
    // a tirar en la 2a (el company ja ha jugat), el meu equip ENCARA NO
    // guanya la 2a baza i tinc una carta top (7 oros, 7 espases, As bastos
    // o As espases). En un 50% dels casos, pregunte "Què tens?" abans de
    // tirar la carta top:
    //   - si el company "Algo tinc" → trucarà abans de jugar.
    //   - si el company "No tinc res" → tira la carta top sense trucar.
    {
      const lostFirstTrickB = !!firstTrick &&
        firstTrick.winner !== undefined &&
        firstTrick.parda !== true &&
        teamOf(firstTrick.winner!) !== myTeam;
      if (lostFirstTrickB && currentTrick) {
        const partnerPlayedHereB = currentTrick.cards.some(
          (tc) => tc.player === partner,
        );
        const hasTopCard = hand.some(
          (c) =>
            (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
            (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
        );
        if (partnerPlayedHereB && hasTopCard) {
          const leader = currentTrick.cards.reduce(
            (best, tc) =>
              best === null || cardStrength(tc.card) > cardStrength(best.card)
                ? tc
                : best,
            null as typeof currentTrick.cards[number] | null,
          );
          const myTeamWinsNow = !!leader && teamOf(leader.player) === myTeam;
          if (!myTeamWinsNow) {
            return Math.random() < 0.5;
          }
        }
      }
    }
    // OBLIGACIÓ: hem perdut la 1a baza, sóc el primer de la meua parella
    // a tirar en la 2a, i un rival ja ha jugat una carta top (≥80) o un
    // 3 (str=70) que el bot pot superar. He de consultar OBLIGATÒRIAMENT
    // al company abans de cremar la meua carta top: així sabrem si val
    // la pena guanyar la baza o cedir-la perquè el company té una carta
    // millor reservada.
    if (currentTrick && isBotOpeningForTeam(m, bot)) {
      const lostFirstTrick = !!firstTrick &&
        firstTrick.winner !== undefined &&
        firstTrick.parda !== true &&
        teamOf(firstTrick.winner!) !== myTeam;
      if (lostFirstTrick) {
        const rivalCards = currentTrick.cards.filter(
          (tc) => teamOf(tc.player) !== myTeam,
        );
        const rivalBest = rivalCards.length > 0
          ? Math.max(...rivalCards.map((tc) => cardStrength(tc.card)))
          : -1;
        const rivalPlayedTopOrThree = rivalCards.some(
          (tc) => cardStrength(tc.card) >= 80 || tc.card.rank === 3,
        );
        const canBeat = hand.some((c) => cardStrength(c) > rivalBest);
        if (rivalPlayedTopOrThree && canBeat) return true;
      }
    }
    // Quedan 2 cartas
    if (top - low < 25) return false; // similares, sin duda
    return Math.random() < clamp(0.65);
  }

  // 3a baza: queda 1 carta, no hay decisión
  return false;
}

/**
 * Conjunt de frases informatives que pot dir el company de manera
 * espontània (sense haver-li preguntat res). S'utilitza per saber
 * quines preguntes ja tenen resposta implícita i, per tant, NO ha
 * de tornar a fer el bot.
 */
const SPONTANEOUS_INFO_PHRASES: readonly ChatPhraseId[] = [
  "vine-a-mi", "vine-a-vore", "vine-al-meu-tres", "vine-al-teu-tres",
  "tinc-bona", "tinc-un-tres", "a-tu", "no-tinc-res",
];

/**
 * Donada una llista de frases que el company ha dit espontàniament,
 * retorna el conjunt de preguntes que el bot NO hauria de fer perquè
 * la seua resposta ja es coneix.
 */
export function questionsAnsweredBy(
  partnerSpoken: readonly ChatPhraseId[] | undefined,
): Set<ChatPhraseId> {
  const blocked = new Set<ChatPhraseId>();
  if (!partnerSpoken || partnerSpoken.length === 0) return blocked;
  const said = partnerSpoken.filter((p) => SPONTANEOUS_INFO_PHRASES.includes(p));
  if (said.length === 0) return blocked;

  // Qualsevol frase informativa espontània respon les preguntes obertes
  // "Què tens?" i "Puc anar a tu?".
  blocked.add("que-tens");
  blocked.add("puc-anar");

  for (const p of said) {
    switch (p) {
      case "tinc-un-tres":
        // Confirma que té un 3 i que NO té cap altra carta top → respon
        // "Portes un tres?" (sí) i "Tens més d'un tres?" (no).
        blocked.add("portes-un-tres");
        blocked.add("tens-mes-dun-tres");
        break;
      case "tinc-bona":
        // Té carta top de truc → respon "Tens més d'un tres?" (sí/algo tinc).
        blocked.add("tens-mes-dun-tres");
        break;
      case "vine-al-meu-tres":
        // Confirma que té un 3 amb context tàctic → respon "Portes un tres?".
        blocked.add("portes-un-tres");
        break;
      case "no-tinc-res":
      case "a-tu":
        // No té res rellevant → respon "Portes un tres?" (no) i
        // "Tens més d'un tres?" (no).
        blocked.add("portes-un-tres");
        blocked.add("tens-mes-dun-tres");
        break;
      // "vine-a-mi", "vine-a-vore", "vine-al-teu-tres": no afegeixen
      // bloquejos addicionals més enllà de "que-tens"/"puc-anar".
      default:
        break;
    }
  }
  return blocked;
}

/**
 * Elige aleatoriamente una pregunta apropiada al contexto.
 * Si `partnerSpoken` conté frases informatives ja dites pel company de
 * manera espontània, exclou les preguntes la resposta de les quals ja
 * es coneix. Si totes queden excloses, retorna `null` perquè el caller
 * decidisca (típicament, usar la informació espontània com a `advice`).
 */
export function pickQuestion(
  m: MatchState,
  bot: PlayerId,
  partnerSpoken?: readonly ChatPhraseId[],
): ChatPhraseId | null {
  const r = m.round;
  const trickIdx = r.tricks.length - 1;
  const hand = r.hands[bot] ?? [];
  const hasAceEspases = hand.some((c) => c.rank === 1 && c.suit === "espases");
  // Cas especial: 2a baza, hem guanyat la 1a, sóc el 2n de la meua
  // parella en tirar (el company ja ha jugat) i tinc un 3 → la
  // pregunta tàcticament correcta és "Què tens?" (vull saber si val
  // la pena trucar abans de jugar el 3).
  {
    const trick2 = r.tricks[r.tricks.length - 1];
    const first2 = r.tricks[0];
    const myTeam2 = teamOf(bot);
    const wonFirst2 =
      !!first2 &&
      first2.parda !== true &&
      first2.winner !== undefined &&
      teamOf(first2.winner!) === myTeam2;
    if (trickIdx === 1 && wonFirst2 && trick2) {
      const partnerPlayedQT = trick2.cards.some(
        (tc) => tc.player === partnerOf(bot),
      );
      const isTopCardQT = (rank: number, suit: string) =>
        (rank === 7 && (suit === "oros" || suit === "espases")) ||
        (rank === 1 && (suit === "bastos" || suit === "espases"));
      const hasThreeQT = hand.some((c) => c.rank === 3);
      const hasTopQT = hand.some((c) => isTopCardQT(c.rank, c.suit));
      if (partnerPlayedQT && (hasThreeQT || hasTopQT)) {
        const blockedQT = questionsAnsweredBy(partnerSpoken);
        if (!blockedQT.has("que-tens")) return "que-tens";
      }
    }
  }
  // Cas especial: 2a baza, hem PERDUT la 1a, sóc el 2n de la meua parella
  // (el company ja ha jugat), el meu equip encara no guanya la 2a i tinc
  // una carta top → pregunta "Què tens?" abans de decidir si trucar.
  {
    const trick2L = r.tricks[r.tricks.length - 1];
    const first2L = r.tricks[0];
    const myTeam2L = teamOf(bot);
    const lostFirst2L =
      !!first2L &&
      first2L.parda !== true &&
      first2L.winner !== undefined &&
      teamOf(first2L.winner!) !== myTeam2L;
    if (trickIdx === 1 && lostFirst2L && trick2L) {
      const partnerPlayedQT = trick2L.cards.some(
        (tc) => tc.player === partnerOf(bot),
      );
      const hasTopQT = hand.some(
        (c) =>
          (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
          (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
      );
      if (partnerPlayedQT && hasTopQT) {
        const leaderL = trick2L.cards.reduce(
          (best, tc) =>
            best === null || cardStrength(tc.card) > cardStrength(best.card)
              ? tc
              : best,
          null as typeof trick2L.cards[number] | null,
        );
        const myTeamWinsNowL = !!leaderL && teamOf(leaderL.player) === myTeam2L;
        if (!myTeamWinsNowL) {
          const blockedQT = questionsAnsweredBy(partnerSpoken);
          if (!blockedQT.has("que-tens")) return "que-tens";
        }
      }
    }
  }
  const hasAceBastos = hand.some((c) => c.rank === 1 && c.suit === "bastos");
  const hasThree = hand.some((c) => c.rank === 3);
  // "Carta bona de truc" = 3, manilla d'oros (7 oros), manilla d'espases
  // (7 espases), As bastos o As espases.
  const goodTrucCards = hand.filter(
    (c) =>
      c.rank === 3 ||
      (c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
      (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases")),
  );

  // Preguntes sobre 3 ("Portes un tres?" / "Tens més d'un tres?"):
  // són pròpies de la 2a baza (saber si el company pot empardar amb un 3
  // per assegurar el truc). En la 1a baza només tenen sentit si:
  //   (a) Tinc l'As d'espases SENSE cap altra carta bona de truc → vull
  //       saber si guanyar la baza amb la espasa pot tindre sentit
  //       perquè el company porte 3.
  //   (b) Tinc l'As d'espases I un 3 → puc guanyar la 1a amb la espasa
  //       i intentar empardar la 2a/3a amb el meu 3 i el del company.
  // Fora d'aquests casos, mai s'inclouen al pool de la 1a baza.
  const aceEspasesAlone =
    hasAceEspases && goodTrucCards.length === 1; // només l'As d'espases
  const aceEspasesWithThree = hasAceEspases && hasThree;
  const threeQuestionsAllowedFirstTrick =
    aceEspasesAlone || aceEspasesWithThree;

  // Si en la 1a baza algun rival ja ha jugat una carta top (força ≥ 80:
  // 7 oros, 7 espases, As bastos o As espases), no té sentit preguntar pel
  // 3 del company: o bé el bot pot guanyar amb una carta encara més alta,
  // o bé hauria de demanar "Que tens?" / "Puc anar a tu?". Així evitem
  // preguntes irrellevants com "Portes un tres?" davant d'una carta forta.
  const currentTrick = r.tricks[r.tricks.length - 1];
  const myTeam = teamOf(bot);
  const rivalPlayedTopFirstTrick =
    trickIdx === 0 &&
    !!currentTrick &&
    currentTrick.cards.some(
      (tc) => teamOf(tc.player) !== myTeam && cardStrength(tc.card) >= 80,
    );

  const portesUnTresAllowed =
    trickIdx === 1 ||
    (trickIdx === 0 && threeQuestionsAllowedFirstTrick && !rivalPlayedTopFirstTrick) ||
    // Fora de la 1a/2a baza (cas anòmal): manté el comportament anterior
    // de permetre-ho si obre per a l'equip i té un as fort.
    (isBotOpeningForTeam(m, bot) && (hasAceEspases || hasAceBastos));

  // Cas especial: 2a baza, hem perdut la 1a i sóc el primer de la
  // meua pareja en obrir-la. En aquest cas la pregunta tàcticament
  // útil és "Tens més d'un tres?" (saber si el company té carta top
  // per a guanyar la baza), no "Portes un tres?" (un 3 sol no
  // assegura la baza si el rival pot superar-lo).
  const firstTrickForLost = r.tricks[0];
  const lostFirstTrick2 =
    trickIdx === 1 &&
    !!firstTrickForLost &&
    firstTrickForLost.parda !== true &&
    firstTrickForLost.winner !== undefined &&
    teamOf(firstTrickForLost.winner!) !== myTeam &&
    isBotOpeningForTeam(m, bot);

  // Si en la 2a baza un rival ja ha tirat una carta a la mesa, la
  // pregunta correcta depèn d'aqueixa carta:
  //   · Top (≥80): "Puc anar a tu?" (saber si el company en té una de
  //     més forta per cedir-li la baza).
  //   · 3 sense cap top a la mesa: "Tens més d'un tres?" (saber si pot
  //     superar el 3 amb una carta top).
  let lostFirstQuestion: ChatPhraseId = "tens-mes-dun-tres";
  if (lostFirstTrick2 && currentTrick) {
    const rivalCardsLost = currentTrick.cards.filter(
      (tc) => teamOf(tc.player) !== myTeam,
    );
    const rivalHasTop = rivalCardsLost.some(
      (tc) => cardStrength(tc.card) >= 80,
    );
    const rivalHasThree = rivalCardsLost.some((tc) => tc.card.rank === 3);
    if (rivalHasTop) lostFirstQuestion = "puc-anar";
    else if (rivalHasThree) lostFirstQuestion = "tens-mes-dun-tres";
  }

  // En la 1a baza només incloem "tens-mes-dun-tres" al pool si compleix
  // la mateixa condició estricta.
  const basePool: ChatPhraseId[] =
    trickIdx === 0
      ? threeQuestionsAllowedFirstTrick && !rivalPlayedTopFirstTrick
        ? ["puc-anar", "que-tens", "tens-mes-dun-tres"]
        : ["puc-anar", "que-tens"]
      : lostFirstTrick2
        ? [lostFirstQuestion]
        : ["que-tens", "puc-anar"];
  const pool: ChatPhraseId[] = lostFirstTrick2
    ? basePool
    : portesUnTresAllowed
      ? [...basePool, "portes-un-tres"]
      : basePool;
  // Filtra les preguntes la resposta de les quals el company ja ha
  // donat espontàniament: el bot no pot preguntar res que el seu
  // company haja contestat abans que ell preguntara.
  const blocked = questionsAnsweredBy(partnerSpoken);
  const filtered = blocked.size > 0 ? pool.filter((q) => !blocked.has(q)) : pool;
  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)]!;
}

/** Context opcional per a refinar les respostes del mode sincer. */
export interface PartnerAnswerContext {
  /** Algun rival del `partner` ha dit "No tinc res" en la 1a baza. */
  rivalSaidNoTincRes?: boolean;
  /** Algun rival ha dit que no té envit o que no vol envidar
   *  (resposta "no" a "Tens envit?" / "Vols que envide?", o "No vull"). */
  rivalsSaidNoEnvit?: boolean;
}

/** El compañero (sea bot o humano) responde según su mano restante. */
export function partnerAnswerFor(
  m: MatchState,
  partner: PlayerId,
  question: ChatPhraseId,
  bluffRate: number = 0,
  _ctx: PartnerAnswerContext = {},
): ChatPhraseId {
  const _result = _partnerAnswerForRaw(m, partner, question, bluffRate, _ctx);
  // Prohibició: si en la primera baza ja s'ha jugat l'As d'espases, cap
  // bot pot dir "A tu!". Substituïm la frase per "No tinc res", que és
  // semànticament equivalent (no té res que aporte) i ja forma part del
  // vocabulari acceptat.
  if (_result === "a-tu" && asEspasesPlayedFirstTrick(m.round)) {
    return "no-tinc-res";
  }
  return _result;
}

function _partnerAnswerForRaw(
  m: MatchState,
  partner: PlayerId,
  question: ChatPhraseId,
  bluffRate: number = 0,
  _ctx: PartnerAnswerContext = {},
): ChatPhraseId {
  const r = m.round;
  const hand = r.hands[partner];
  const envit = playerTotalEnvit(r, partner);
  // Comptatge de cartes per força (només cartes que encara estan a la mà).
  // Terminologia: la "manilla" d'un coll és el 7 d'eixe coll. En Truc Valencià
  // només les manilles d'espases (90) i d'oros (85) tenen força afegida; les
  // de copes i bastos valen com un 7 normal. Les cartes que autoritzen un
  // "Vine a mi!" en mode sincer són les ≥ 90: As d'espases (100), As de
  // bastos (95) i manilla d'espases (7 espases, 90). La manilla d'oros (7
  // oros, 85) sola no autoritza "Vine a mi!" — només "Algo tinc".
  const topCards = hand.filter((c) => cardStrength(c) >= 80).length; // afegeix la manilla d'oros
  const threes = hand.filter((c) => c.rank === 3).length;
  // "Carta bona de truc" = 3, 7 oros, 7 espases, As bastos, As espases (strength ≥ 70).
  // Si no se'n té cap, mai s'ha de respondre "Vine a vore" — cal dir "No tinc res" o "A tu!".
  const hasTrucCard = topCards >= 1 || threes >= 1;


  // Decideix si el bot mentirà en aquesta resposta (segons el perfil
  // d'honestedat). En mode "sincero" mai menteix.
  const lie = bluffRate > 0 && Math.random() < bluffRate;

  // Si l'envit ja s'ha cantat (envitState.kind !== "none") o ja s'ha
  // resolt en aquesta ronda, el bot NO pot tornar a dir "Envida!": com
  // a molt diu "Sí" (afirmant que té envit). Així evitem que un bot del
  // mateix equip que ja ha envidat semble cantar un nou "Envida!".
  const envitAlreadyCalled = m.round.envitState.kind !== "none" || m.round.envitResolved;

  if (question === "tens-envit") {
    let truth: ChatPhraseId;
    if (envit >= 31) {
      // Sincer (bluffRate === 0): sempre avisa amb "Envida!" perquè el
      // company envide; mai amaga la jugada.
      truth = bluffRate === 0 ? "envida" : (Math.random() < 0.5 ? "envida" : "si");
    } else if (envit === 30) {
      truth = Math.random() < 0.25 ? "si-tinc-n" : "si";
    } else {
      truth = "no";
    }
    if (envitAlreadyCalled && truth === "envida") truth = "si";
    if (lie) {
      if (truth === "no") return "si";
      return "no";
    }
    return truth;
  }

  // "Vols que envide?" → resposta segons l'envit total:
  //  - ≥31 → "Sí" o "Envida!" (tria aleatòria).
  //  - 29 o 30 → normalment "No", a vegades "Tinc {n}" revelant el valor.
  //  - <29 → "No".
  if (question === "vols-envide") {
    let truth: ChatPhraseId;
    if (envit >= 31) {
      // Sincer: sempre "Envida!" per indicar al company que envide.
      truth = bluffRate === 0 ? "envida" : (Math.random() < 0.5 ? "envida" : "si");
    } else if (envit === 30 && _ctx.rivalsSaidNoEnvit) {
      // Els rivals ja han confessat que no tenen envit (o que no
      // volen envidar). Amb 30 podem envidar amb tranquil·litat: ho
      // fem en un 70% dels casos, deixant un marge per a respostes
      // més prudents (revelar el número o dir que no).
      const roll = Math.random();
      if (roll < 0.7) truth = bluffRate === 0 ? "envida" : (Math.random() < 0.5 ? "envida" : "si");
      else if (roll < 0.9) truth = "si-tinc-n";
      else truth = "no";
    } else if (envit === 29 || envit === 30) {
      truth = Math.random() < 0.25 ? "si-tinc-n" : "no";
    } else {
      truth = "no";
    }
    if (envitAlreadyCalled && truth === "envida") truth = "si";
    if (lie) {
      if (truth === "no") return "si";
      return "no";
    }
    return truth;
  }
  //  - envit > 0 i ≤ 31 → SEMPRE "No".
  //  - envit = 33 → SEMPRE "Sí".
  //  - envit = 32 i sóc mà sobre el rival que va envidar → "Sí".
  //  - en qualsevol altre cas → "No".
  if (question === "vols-tornar-envidar") {
    let manoPriorityOverCaller = false;
    if (m.round.envitState.kind === "pending") {
      const caller = m.round.envitState.calledBy;
      let p: PlayerId = m.round.mano;
      for (let i = 0; i < 4; i++) {
        if (p === partner) { manoPriorityOverCaller = true; break; }
        if (p === caller) { manoPriorityOverCaller = false; break; }
        p = ((p + 1) % 4) as PlayerId;
      }
    }
    let truth: ChatPhraseId;
    if (envit >= 33) truth = "si";
    else if (envit === 32 && manoPriorityOverCaller) truth = "si";
    else truth = "no";
    if (lie) return truth === "no" ? "si" : "no";
    return truth;
  }

  // "Quant envit tens?" → resposta única "Tinc {n}" amb el valor real.
  // El caller s'encarrega de passar la variable {n} amb l'envit del company.
  if (question === "quant-envit") {
    return "si-tinc-n";
  }

  // "Portes un tres?":
  //  - Si té As d'espases o As de bastos → "Vine a mi!".
  //  - Si té una altra carta top (7 d'espases, 7 d'oros) → "Algo tinc".
  //  - Si té un 3 (sense top) → "Sí".
  //  - Altrament → "No".
  if (question === "portes-un-tres") {
    const hasTopAce = hand.some(
      (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
    );
    let truth: ChatPhraseId;
    if (hasTopAce) truth = "vine-a-mi";
    else if (topCards >= 1) truth = "tinc-bona";
    else if (threes >= 1) truth = "si";
    else truth = "no";
    if (lie) {
      if (truth === "no") return "si";
      if (truth === "si") return "no";
      return "no";
    }
    return truth;
  }
  if (question === "tens-mes-dun-tres") {
    // Regla estricta segons el jugador:
    //  - Té top card (7 oros/espases o As bastos/espases) →
    //      "Sí" o "Algo tinc" (equivalents, tria aleatòria).
    //  - No té top card però té un 3 → "Tinc un 3" o "No".
    //  - No té res del que es pregunta → "No".
    let answer: ChatPhraseId;
    if (topCards >= 1) {
      answer = Math.random() < 0.5 ? "si" : "tinc-bona";
    } else if (threes >= 1) {
      answer = Math.random() < 0.5 ? "tinc-un-tres" : "no";
    } else {
      answer = "no";
    }
    if (lie) {
      // Mentides coherents amb les úniques respostes possibles a la pregunta.
      // Només s'aplica fora del mode Sincero (bluffRate > 0).
      if (answer === "no") return Math.random() < 0.5 ? "si" : "tinc-bona";
      if (answer === "si" || answer === "tinc-bona") return "no";
      // tinc-un-tres → menteix dient "no"
      return "no";
    }
    return answer;
  }
  if (question === "que-tens") {
    // Mode sincer:
    //  - Si té qualsevol carta top de truc (As d'espases, As de bastos,
    //    7 d'espases o 7 d'oros) → SEMPRE "Algo tinc" (tinc-bona).
    //    Així, si després li pregunten "Puc anar a tu?", la resposta
    //    determinista coincidirà amb la ja dita.
    //  - Si només té un 3 → "Tinc un 3".
    //  - Altrament → "No tinc res" o "A tu".
    let answer: ChatPhraseId;
    if (topCards >= 1) {
      answer = "tinc-bona";
    } else if (threes >= 1) {
      // Té un 3 sense cap top card: l'única resposta possible és "Tinc un 3".
      // Mai "Vine a vore!" ni "Vine al meu tres" — un 3 sol no justifica
      // demanar al company que vinga.
      answer = "tinc-un-tres";
    } else {
      // Sense 3 ni cap top card: pot dir "No tinc res" o "A tu" indistintament.
      answer = Math.random() < 0.5 ? "no-tinc-res" : "a-tu";
    }
    if (lie) return (answer === "no-tinc-res" || answer === "a-tu") ? "tinc-bona" : "no-tinc-res";
    return answer;
  }
  // "puc-anar"
  // Regla obligatòria: si el bot té l'As d'espases o l'As de bastos,
  // SEMPRE respon "Vine a mi!" a "Puc anar a tu?", independentment
  // de cartes jugades pels rivals o de qualsevol altra consideració.
  {
    const hasTopAcePuc = hand.some(
      (c) => c.rank === 1 && (c.suit === "espases" || c.suit === "bastos"),
    );
    if (hasTopAcePuc) {
      if (lie) return "a-tu";
      return "vine-a-mi";
    }
  }
  // Si en aquesta baza ja hi ha alguna carta jugada per un rival, la
  // resposta depèn estrictament de si el company pot guanyar-la o no.
  // Mai diem "Tinc un 3" ni "Algo tinc" si el 3 / la carta top no
  // serveix per a superar la carta ja jugada: el company demana saber
  // si pot anar a buscar-lo, no què té a la mà.
  {
    const myTeamP = teamOf(partner);
    const curTrick = r.tricks[r.tricks.length - 1];
    const rivalPlayedCards = (curTrick?.cards ?? []).filter(
      (tc) => teamOf(tc.player) !== myTeamP,
    );
    if (rivalPlayedCards.length > 0) {
      const highestRival = Math.max(
        ...rivalPlayedCards.map((tc) => cardStrength(tc.card)),
      );
      // Comprova si la carta més alta del rival ja és imbatible per
      // qualsevol carta que encara puga aparèixer (cartes no jugades
      // en cap baza d'aquesta ronda). Si ho és, ningú pot guanyar la
      // baza, així que no té sentit dir "A tu!" (que implica que el
      // company se'n faça càrrec). En aquest cas diem "No tinc res".
      const playedIds = new Set<string>();
      for (const t of r.tricks) for (const tc of t.cards) playedIds.add(tc.card.id);
      let maxRemaining = -1;
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          if (rank === 1 && suit !== "espases" && suit !== "bastos") continue;
          const id = `${rank}-${suit}`;
          if (playedIds.has(id)) continue;
          const s = cardStrength({ suit, rank, id });
          if (s > maxRemaining) maxRemaining = s;
        }
      }
      const rivalUnbeatable = maxRemaining <= highestRival;
      const foldPhrase: ChatPhraseId = rivalUnbeatable ? "no-tinc-res" : "a-tu";
      const canBeatWithTop = topCards >= 1 && hand.some(
        (c) =>
          ((c.rank === 7 && (c.suit === "oros" || c.suit === "espases")) ||
            (c.rank === 1 && (c.suit === "bastos" || c.suit === "espases"))) &&
          cardStrength(c) > highestRival,
      );
      const canBeatWithThree =
        threes >= 1 &&
        hand.some((c) => c.rank === 3 && cardStrength(c) > highestRival);
      if (canBeatWithTop) {
        if (lie) return foldPhrase;
        return "vine-a-mi";
      }
      // En la 1a baza, si només té un 3 (cap top) i el 3 supera la
      // millor carta del rival, mai diu "Vine a mi!": diu "Tinc un 3".
      // Si tampoc el 3 supera, diu "A tu" (o "No tinc res" si la
      // carta del rival ja és imbatible).
      if (r.tricks.length === 1 && topCards === 0) {
        if (lie) return "vine-a-mi";
        return canBeatWithThree ? "tinc-un-tres" : foldPhrase;
      }
      const canBeat = hand.some((c) => cardStrength(c) > highestRival);
      if (canBeat) {
        if (lie) return foldPhrase;
        return "vine-a-mi";
      }
      if (lie) return "vine-a-mi";
      return foldPhrase;
    }
  }
  // Mode sincer (cap carta rival jugada encara en aquesta baza):
  //  - Si té qualsevol carta top de truc (As d'espases, As de bastos,
  //    7 d'espases o 7 d'oros) → SEMPRE "Algo tinc" (tinc-bona). Així
  //    si abans s'ha demanat "Que tens?", la resposta a "Puc anar a tu?"
  //    serà la mateixa que la ja establerta.
  //  - Si només té un 3 → "Tinc un 3".
  //  - Sense res → "A tu".
  if (hasTrucCard) {
    let answer: ChatPhraseId;
    if (topCards >= 1) {
      answer = "tinc-bona";
    } else if (threes >= 1) {
      // Només té un 3 com a millor carta i cap carta de truc bona:
      // l'única resposta possible és "Tinc un 3". Mai "Vine al meu tres"
      // — un 3 sol no és suficient per a demanar que el company vinga.
      answer = "tinc-un-tres";
    } else {
      answer = "a-tu";
    }
    if (lie) return "a-tu";
    return answer;
  }
  // Sense cap carta bona de truc: mai "vine-a-vore". Com a resposta a
  // "Puc anar a tu?", el company sempre respon "A tu!" (no "No tinc res":
  // "No tinc res" només és vàlid com a resposta a "Què tens?").
  if (lie) return "vine-a-mi";
  return "a-tu";
}

/**
 * Converteix la resposta del company en consell tàctic per a triar carta.
 * Si es passa la `question` original, també interpreta correctament les
 * respostes curtes "Sí" i "No" (que altrament serien neutres).
 */
export function adviceFromAnswer(
  answer: ChatPhraseId,
  question?: ChatPhraseId,
): PartnerAdvice {
  // Respostes "Sí"/"No": el sentit depèn de la pregunta.
  if (answer === "si" || answer === "no") {
    const positive = answer === "si";
    switch (question) {
      // Preguntes on un "Sí" significa que el company té cartes fortes.
      case "puc-anar":
      case "que-tens":
      case "portes-un-tres":
      case "tens-mes-dun-tres":
        return positive ? "strong" : "weak";
      // "Tens envit?" no afecta directament la tria de carta de truc.
      case "tens-envit":
      default:
        return "neutral";
    }
  }

  switch (answer) {
    case "vine-a-mi":
    case "vine-al-meu-tres":
    case "tinc-bona":
      return "strong";
    case "tinc-un-tres":
      // El company té un 3 però no ha confirmat carta top: és força
      // mitjana. Permet que l'obridor afine la decisió (p. ex., tirar
      // la pròpia carta top per pressionar i reservar el seu 3).
      return "three";
    case "no-tinc-res":
      return "weak";
    case "a-tu":
      // Quan es respon a "puc-anar" o "que-tens", "A tu" equival a "No tinc res".
      if (question === "puc-anar" || question === "que-tens") return "weak";
      return "neutral";
    case "vine-a-vore":
    case "vine-al-teu-tres":
    default:
      return "neutral";
  }
}