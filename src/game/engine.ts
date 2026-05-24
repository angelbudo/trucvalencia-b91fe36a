import { buildDeck, cardStrength, bestEnvit, playerTotalEnvit } from "./deck";
import {
  Action, Card, MatchState, PlayerId, RoundState,
  RoundSummary, ShoutKind, TeamId, TrucState,
  nextPlayer, partnerOf, teamOf,
} from "./types";

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function createMatch(
  opts: { targetCama?: number; targetCames?: number; firstDealer?: PlayerId; rng?: () => number } = {}
): MatchState {
  const targetCama = opts.targetCama ?? 12;
  const targetCames = opts.targetCames ?? 2;
  const dealer = (opts.firstDealer ?? 3) as PlayerId;
  const round = dealRound(dealer, opts.rng);
  return {
    scores: { nos: { males: 0, bones: 0 }, ells: { males: 0, bones: 0 } },
    camesWon: { nos: 0, ells: 0 },
    cames: 0,
    targetCama,
    targetCames,
    round,
    dealer,
    history: [],
  };
}

/** Total de punts dins la cama actual per a un equip (capat a 24). */
export function teamCamaTotal(s: { males: number; bones: number }): number {
  return Math.min(s.males + s.bones, 24);
}

/**
 * "Match point" de la cama: algun equip està a 1 punt de tancar la cama
 * (té `bones === targetCama - 1`). En aquesta situació l'envit només pot
 * valdre 1 punt — querit o no querit — perquè és tot el que falta al líder
 * per tancar la cama. A més, no es pot pujar (renvit / falta-envit).
 */
export function isCamaMatchPoint(m: MatchState): boolean {
  const t = m.targetCama;
  return m.scores.nos.bones >= t - 1 || m.scores.ells.bones >= t - 1;
}

/** Suma punts a un equip propagant males → bones, i retorna si ha guanyat la cama. */
function addPointsToTeam(
  scores: Record<TeamId, { males: number; bones: number }>,
  team: TeamId,
  points: number,
  targetCama: number,
): boolean {
  if (points <= 0) return false;
  const s = scores[team];
  let remaining = points;
  if (s.males < targetCama) {
    const room = targetCama - s.males;
    const add = Math.min(room, remaining);
    s.males += add;
    remaining -= add;
  }
  if (remaining > 0) {
    s.bones = Math.min(targetCama, s.bones + remaining);
  }
  return s.bones >= targetCama;
}

export function dealRound(dealer: PlayerId, rng?: () => number): RoundState {
  const deck = shuffle(buildDeck(), rng);
  const hands: Record<PlayerId, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  const mano = nextPlayer(dealer);
  let p = mano;
  for (let i = 0; i < 12; i++) {
    hands[p].push(deck[i]!);
    p = nextPlayer(p);
  }
  return {
    hands,
    mano,
    turn: mano,
    tricks: [{ cards: [] }],
    trucState: { kind: "none", level: 0 },
    envitState: { kind: "none" },
    envitResolved: false,
    phase: "envit",
    log: [{ type: "deal", dealer }],
  };
}

/**
 * Determina si el guanyador del truc ja està matemàticament decidit a
 * partir de les cartes ja jugades + la mà coneguda del jugador `viewer`.
 * Conservador: les cartes desconegudes (no jugades i no a la mà del
 * viewer) es consideren totes en mans de l'equip rival al viewer en el
 * pitjor cas. Si tot i així el resultat del truc està forçat, retorna
 * el TeamId guanyador. Si no està decidit (o el round no està en una
 * fase de joc), retorna undefined.
 *
 * Cobreix els escenaris habituals on no té sentit cantar/pujar truc:
 *  - El meu equip ja ha guanyat la 1a baza i la 2a està garantida per
 *    al meu equip (millor carta sobre la mesa és del meu equip, i cap
 *    rival pot superar-la amb cartes restants desconegudes).
 *  - 1-1 sense pardes i la 3a baza ja està garantida per a un equip.
 *  - Pardes que combinades amb la baza actual garanteixen el resultat.
 */
export function isTrucDecided(r: RoundState, viewer: PlayerId): TeamId | undefined {
  if (r.phase === "game-end" || r.phase === "round-end") return undefined;
  if (r.tricks.length === 0) return undefined;

  const myTeam = teamOf(viewer);
  const oppTeam: TeamId = myTeam === "nos" ? "ells" : "nos";

  // ----- Bazas tancades: comptem wins i pardes -----
  const closedTricks = r.tricks.slice(0, -1);
  const currentTrick = r.tricks[r.tricks.length - 1]!;

  let winsNos = 0, winsElls = 0;
  const pardas: boolean[] = [];
  const closedWinners: (PlayerId | undefined)[] = [];
  for (const t of closedTricks) {
    pardas.push(!!t.parda);
    closedWinners.push(t.winner);
    if (!t.parda && t.winner !== undefined) {
      if (teamOf(t.winner) === "nos") winsNos++;
      else winsElls++;
    }
  }

  // Comptes ja resolts pel motor: si algun equip ja té 2 wins o regles
  // de parda ja s'han aplicat, la ronda hauria estat tancada. Aquí
  // assumim que encara no s'ha tancat però per coherència gestionem.
  if (winsNos >= 2) return "nos";
  if (winsElls >= 2) return "ells";

  // ----- Cartes restants desconegudes per al viewer -----
  // Mazo complet menys cartes jugades menys cartes a la mà del viewer.
  const playedIds = new Set<string>();
  for (const t of r.tricks) {
    for (const tc of t.cards) playedIds.add(tc.card.id);
  }
  const myHandIds = new Set<string>((r.hands[viewer] ?? []).map((c) => c.id));
  const fullDeck = buildDeck();
  const unknownCards = fullDeck.filter(
    (c) => !playedIds.has(c.id) && !myHandIds.has(c.id),
  );

  // Cartes restants per equips, considerant el cas pitjor:
  //  - Cartes meves: les sé.
  //  - Cartes desconegudes: assumeix que TOTES són en mans rivals
  //    (compromís amb el meu company: també desconegut, així que el
  //    pitjor cas és que el company no en té cap d'útil).
  // Aquesta sobreaproximació mai diu "decidit" quan no ho està.
  const myRemaining = r.hands[viewer] ?? [];
  const oppWorstCaseCards = unknownCards;
  const oppWorstCaseByStr = [...oppWorstCaseCards].sort(
    (a, b) => cardStrength(b) - cardStrength(a),
  );

  // ----- Helper: ¿qui guanyaria la baza actual en el pitjor cas? -----
  // Retorna {forcedWinnerTeam | "parda" | undefined} segons si el
  // resultat de la baza en curs està garantit.
  function currentTrickGuaranteed(): TeamId | "parda" | undefined {
    // Jugadors que encara no han jugat en aquesta baza.
    const playedHerePlayers = new Set(currentTrick.cards.map((tc) => tc.player));
    const yetToPlay: PlayerId[] = [];
    // Determinem l'ordre: el primer en jugar va ser qui obrí; els
    // següents per ordre. Els que falten són els que no han jugat.
    for (let i = 0; i < 4; i++) {
      const p = i as PlayerId;
      if (!playedHerePlayers.has(p)) yetToPlay.push(p);
    }
    // Ordre real depèn de qui ha obert; per al càlcul de "garantit"
    // n'hi ha prou amb saber qui falta.

    // Si la baza encara no ha començat, no podem garantir res sobre
    // ella sense saber qui obre i quina carta tira; això pot afectar
    // el resultat global del truc però ho gestionem fora.
    if (currentTrick.cards.length === 0) return undefined;

    // Millor carta i millor jugador a la mesa actual.
    let bestStr = -1;
    let bestPlayer: PlayerId | null = null;
    for (const tc of currentTrick.cards) {
      const s = cardStrength(tc.card);
      if (s > bestStr) { bestStr = s; bestPlayer = tc.player; }
    }
    if (bestPlayer === null) return undefined;
    const bestTeam = teamOf(bestPlayer);

    // Recopilem les cartes que els jugadors que falten *podrien* tirar.
    // Per cada jugador que falta:
    //  - si és viewer → sap quines cartes té (myRemaining).
    //  - si no → en el pitjor cas, agafem les més fortes del
    //    oppWorstCaseByStr per al rival, i res per al company (worst
    //    case per al viewer).
    const oppPool = [...oppWorstCaseByStr];
    const candidatesByPlayer: Record<PlayerId, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const p of yetToPlay) {
      if (p === viewer) {
        candidatesByPlayer[p] = [...myRemaining];
      } else if (teamOf(p) === oppTeam) {
        // Rival: assumeix que té totes les cartes desconegudes (podria
        // jugar-ne qualsevol). Per "pot superar" només cal que en
        // tinga UNA que ho faça; les agafem totes del pool.
        candidatesByPlayer[p] = oppPool;
      } else {
        // Company del viewer (no és viewer ni rival): desconegut. En
        // el pitjor cas no aporta res útil → cartes "buides" → no
        // pot superar. Però tampoc pot superar la millor del rival.
        candidatesByPlayer[p] = [];
      }
    }

    // ¿Algú dels que falten pot superar la millor actual?
    let canBeBeaten = false;
    let beatenByOppOnly = true; // si només els rivals poden batre.
    
    for (const p of yetToPlay) {
      const cards = candidatesByPlayer[p];
      const beats = cards.some((c) => cardStrength(c) > bestStr);
      if (beats) {
        canBeBeaten = true;
        if (teamOf(p) !== myTeam) beatenByOppOnly = beatenByOppOnly && true;
      }
    }

    // ¿Algú pot empatar (parda) la millor actual?
    let canBeTied = false;
    for (const p of yetToPlay) {
      const cards = candidatesByPlayer[p];
      if (cards.some((c) => cardStrength(c) === bestStr)) {
        canBeTied = true;
        break;
      }
    }

    // Cas A: ningú la pot superar i ningú la pot empatar →
    //   guanya la baza l'equip de bestPlayer.
    if (!canBeBeaten && !canBeTied) return bestTeam;

    // Cas B: ningú la pot superar però algú la pot empatar (parda
    // possible). El resultat és bestTeam o parda — no està garantit.
    if (!canBeBeaten && canBeTied) return undefined;

    // Cas C: la millor actual és del meu equip i només els rivals
    // poden batre-la. Però si el meu equip té un jugador per jugar
    // que la pot superar TAMBÉ, no canvia (encara és del meu equip).
    // Ja sabem canBeBeaten=true → no garantit a favor de bestTeam.
    // Tot i això, podria ser que TOTS els jugadors que falten siguen
    // del meu equip i la millor actual sigui meva → guanya el meu equip.
    const remainingOpps = yetToPlay.filter((p) => teamOf(p) === oppTeam);
    if (remainingOpps.length === 0 && bestTeam === myTeam) {
      // Cap rival pot tirar; mateix equip. Resultat: meu equip guanya
      // la baza (o parda si algú del meu equip empata, però fins i
      // tot la parda és informació útil — retornem undefined si hi
      // ha possibilitat de parda per ser conservadors).
      if (canBeTied) return undefined;
      return myTeam;
    }

    return undefined;
  }

  const guaranteed = currentTrickGuaranteed();

  // ----- Combinació amb les bazas tancades per resoldre el truc -----
  // Estat actual: winsNos, winsElls, pardas[].
  // Si la baza en curs està garantida, simulem com si ja estiguera
  // tancada amb aquest resultat i comprovem si el truc queda decidit.
  function resolveWith(
    extraWinTeam: TeamId | "parda" | undefined,
  ): TeamId | undefined {
    let wN = winsNos, wE = winsElls;
    const newPardas = [...pardas];
    const newWinners = [...closedWinners];
    if (extraWinTeam === "nos") { wN++; newPardas.push(false); newWinners.push(undefined); }
    else if (extraWinTeam === "ells") { wE++; newPardas.push(false); newWinners.push(undefined); }
    else if (extraWinTeam === "parda") { newPardas.push(true); newWinners.push(undefined); }
    else return undefined;

    const totalTricks = newPardas.length;
    if (wN >= 2 && wN > wE) return "nos";
    if (wE >= 2 && wE > wN) return "ells";
    // Regla 2: 1a parda + 2a amb winner → guanya el winner.
    if (totalTricks >= 2 && newPardas[0] && !newPardas[1]) {
      // Necessitem el winner real de la baza 2; si extraWinTeam ho
      // representa i és el segon trick (totalTricks===2) ho tenim.
      // Si no, busquem entre closed.
      const w2 = totalTricks === 2 ? extraWinTeam : (newWinners[1] !== undefined ? teamOf(newWinners[1]!) : undefined);
      if (w2 === "nos" || w2 === "ells") return w2;
    }
    // Regla 3: 2a parda + 1a amb winner → guanya el de la 1a.
    if (totalTricks >= 2 && !newPardas[0] && newPardas[1]) {
      const w1 = newWinners[0] !== undefined ? teamOf(newWinners[0]!) : undefined;
      if (w1) return w1;
    }
    // Regla 4: si totes són pardes i és la 3a, guanya equip de la mà.
    if (totalTricks === 3) {
      if (newPardas[0] && newPardas[1] && newPardas[2]) return teamOf(r.mano);
      // 1-1 amb 3a parda: guanya qui va guanyar la 1a.
      if (newPardas[2] && wN === wE) {
        const w1 = newWinners[0] !== undefined ? teamOf(newWinners[0]!) : undefined;
        if (w1) return w1;
      }
      // 3a no parda i 1a/2a no decideixen: guanya qui té més wins.
      if (!newPardas[2]) {
        if (wN > wE) return "nos";
        if (wE > wN) return "ells";
        return teamOf(r.mano);
      }
    }
    return undefined;
  }

  // 1) Si la baza en curs ja garantix un equip o parda, resol amb això.
  if (guaranteed === "nos" || guaranteed === "ells" || guaranteed === "parda") {
    const direct = resolveWith(guaranteed);
    if (direct) {
      // Però encara podrien faltar bazas posteriors. Si encara podem
      // jugar-ne més (totalTricks < 3), cal verificar que aquestes
      // bazas futures NO poden canviar el resultat.
      const tricksAfter = (closedTricks.length + 1);
      if (tricksAfter >= 3) return direct;
      // Si sumant la baza en curs ja són 2 i una de les regles dóna
      // ganador definitiu (2 wins o parda+win), retornem direct.
      // Cas: 2 wins per al mateix equip → segur.
      // Cas: parda + win → segur (regla 2/3 ja resolen).
      // Cas: 1-1 sense pardas → no segur (depèn de la 3a).
      let wN = winsNos, wE = winsElls;
      const newPardas = [...pardas];
      if (guaranteed === "nos") wN++;
      else if (guaranteed === "ells") wE++;
      else newPardas.push(true);
      if (guaranteed !== "parda") newPardas.push(false);
      // Després de la baza en curs:
      if (wN >= 2 && wN > wE) return "nos";
      if (wE >= 2 && wE > wN) return "ells";
      // Parda + win en alguna combinació de les dos primeres: ja resolt
      // pel motor (regla 2/3) — retorna direct.
      if (newPardas.length >= 2 && (newPardas[0] || newPardas[1])) {
        if (newPardas[0] !== newPardas[1]) return direct; // 1 parda + 1 win
      }
      // 1-1 sense pardas: no decidit; depèn 3a.
      // Caiem al següent bloc.
    }
  }

  // 2) Cas avançat: la baza en curs no està garantida, però potser el
  // pool de cartes restants és tan limitat que el truc està decidit
  // independentment del resultat de la baza actual i de les futures.
  // Aquesta anàlisi és costosa; per ara la deixem desactivada (només
  // detectem casos coberts per l'apartat 1).

  return undefined;
}

export function legalActions(m: MatchState, player: PlayerId): Action[] {
  const r = m.round;
  if (r.phase === "game-end" || r.phase === "round-end") return [];

  // Obligació encadenada "Envit i truca": si aquest jugador té pendent
  // l'auto-truc i l'envit ja s'ha resolt, només pot cantar truc — cap
  // altra acció (jugar carta, altres crits) és legal.
  if (
    r.chainedTrucPending === player &&
    r.envitState.kind !== "pending" &&
    r.trucState.kind !== "pending"
  ) {
    if (r.turn === player) {
      return [{ type: "shout", what: "truc" }];
    }
    return [];
  }

  if (
    r.trucState.kind === "pending" &&
    teamOf(player) === r.trucState.awaitingTeam &&
    !(r.trucState.rejectedBy ?? []).includes(player)
  ) {
    let acts = responseActions(r.trucState.level, "truc");
    // Si el truc ja est\u00e0 matem\u00e0ticament decidit, no es pot pujar
    // (retruc/quatre/joc-fora). Es mant\u00e9 vull/no-vull per respondre.
    // Nom\u00e9s amaguem les pujades quan el guanyador for\u00e7at \u00e9s el MEU
    // equip (no t\u00e9 sentit pujar quan ja he guanyat). Si l'equip
    // for\u00e7at \u00e9s el rival, mantenim les opcions per si vull arriscar.
    if (isTrucDecided(r, player) === teamOf(player)) {
      acts = acts.filter(
        (a) => !(a.type === "shout" && (a.what === "retruc" || a.what === "quatre" || a.what === "joc-fora")),
      );
    }
    // "Truc i passe!" en la 1a baza: el rival pot envidar (o falta-envit)
    // ABANS de respondre al truc, mentre encara no haja jugat la seua
    // carta i l'envit no estiga resolt. Si envida, el truc queda diferit
    // (deferredTruc) i es resoldrà l'envit primer.
    const firstTrick0 = r.tricks[0];
    const playerHasPlayed0 = !!firstTrick0 && firstTrick0.cards.some((tc) => tc.player === player);
    if (
      !r.envitResolved &&
      r.envitState.kind === "none" &&
      r.tricks.length === 1 &&
      !playerHasPlayed0
    ) {
      acts.push({ type: "shout", what: "envit" });
      // Match-point de cama: no es pot tirar la falta (val 1 igualment).
      if (!isCamaMatchPoint(m)) acts.push({ type: "shout", what: "falta-envit" });
    }
    return acts;
  }

  if (
    r.envitState.kind === "pending" &&
    teamOf(player) === r.envitState.awaitingTeam &&
    !(r.envitState.rejectedBy ?? []).includes(player)
  ) {
    let acts = responseActions(r.envitState.level, "envit");
    // Match-point de cama: l'envit val 1 punt sí o sí; no es pot pujar.
    if (isCamaMatchPoint(m)) {
      acts = acts.filter(
        (a) => !(a.type === "shout" && (a.what === "renvit" || a.what === "falta-envit")),
      );
    }
    return acts;
  }

  if (r.turn !== player) {
    return [];
  }

  const actions: Action[] = [];

  const noPending = r.trucState.kind !== "pending" && r.envitState.kind !== "pending";
  if (noPending && (r.phase === "playing" || r.phase === "envit")) {
    for (const c of r.hands[player]) actions.push({ type: "play-card", cardId: c.id });
  }

  if (noPending) {
    const t = r.trucState;
    // Nom\u00e9s amaguem les accions de truc quan el MEU equip ja t\u00e9
    // garantit el truc independentment del que jugue jo o el meu
    // company. Casos coberts:
    //  A) S\u00f3c l'\u00faltim a tirar de la baza i amb les cartes a la mesa
    //     ja guanyem el truc (guanyem la baza, o la empardem havent
    //     guanyat la 1a).
    //  B) Ja hem guanyat una baza i el meu company ha jugat la carta
    //     m\u00e9s alta que quedava per jugar, fent imposible perdre.
    // Si el rival t\u00e9 el truc garantit, mantenim les opcions.
    const trucDecided = isTrucDecided(r, player) === teamOf(player);
    if (trucDecided) {
      // No afegim cap acci\u00f3 de truc/retruc/quatre/joc-fora.
    } else if (t.kind === "none") {
      actions.push({ type: "shout", what: "truc" });
    } else if (t.kind === "accepted") {
      let lastCaller: PlayerId | null = null;
      for (let i = r.log.length - 1; i >= 0; i--) {
        const ev = r.log[i]!;
        if (ev.type === "shout" && (ev.what === "truc" || ev.what === "retruc" || ev.what === "quatre")) {
          lastCaller = ev.player;
          break;
        }
      }
      if (lastCaller !== null && teamOf(player) !== teamOf(lastCaller)) {
        if (t.level === 2) actions.push({ type: "shout", what: "retruc" });
        else if (t.level === 3) actions.push({ type: "shout", what: "quatre" });
        else if (t.level === 4) actions.push({ type: "shout", what: "joc-fora" });
      }
    }
  }

  const firstTrick = r.tricks[0]!;
  // Tant la mà com el peu poden envidar mentre no hagen jugat la seua
  // carta a la primera baza i no s'haja resolt encara l'envit. La mà
  // (primer jugador de la pareja) només envidarà amb intenció de trucar
  // a continuació; eixa restricció es modela a la capa de bot/UI, no al
  // motor — el motor només decideix què és legal.
  const playerHasPlayed = firstTrick.cards.some(tc => tc.player === player);
  // Prohibit envit després de "voler" el truc (truc acceptat).
  const trucAccepted = r.trucState.kind === "accepted";
  const envitAllowed =
    !r.envitResolved &&
    !trucAccepted &&
    r.tricks.length === 1 &&
    !playerHasPlayed &&
    noPending;
  if (envitAllowed) {
    if (r.envitState.kind === "none") {
      actions.push({ type: "shout", what: "envit" });
      // Match-point de cama: no es pot tirar la falta (val 1 igualment).
      if (!isCamaMatchPoint(m)) actions.push({ type: "shout", what: "falta-envit" });
    }
  }

  return actions;
}

function responseActions(level: TrucState["kind"] extends infer _ ? any : never, kind: "truc" | "envit"): Action[] {
  const acts: Action[] = [
    { type: "shout", what: "vull" },
    { type: "shout", what: "no-vull" },
  ];
  if (kind === "truc") {
    if (level === 2) acts.push({ type: "shout", what: "retruc" });
    if (level === 3) acts.push({ type: "shout", what: "quatre" });
    if (level === 4) acts.push({ type: "shout", what: "joc-fora" });
  } else {
    if (level === 2) {
      acts.push({ type: "shout", what: "renvit" });
      acts.push({ type: "shout", what: "falta-envit" });
    }
    if (level === 4) acts.push({ type: "shout", what: "falta-envit" });
  }
  return acts;
}

export function applyAction(m: MatchState, player: PlayerId, action: Action): MatchState {
  const next: MatchState = {
    ...m,
    scores: {
      // Clonem profundament els subobjectes per equip: `addPointsToTeam`
      // muta `s.males`/`s.bones` i sense aquest clonatge la referència
      // seria compartida amb el `m` original. En React StrictMode el
      // reducer s'executa dues vegades i això acabaria duplicant els
      // punts sumats al marcador.
      nos: { ...m.scores.nos },
      ells: { ...m.scores.ells },
    },
    // Clonamos `history` y `camesWon` porque `finishRound` los muta
    // (push del summary, increment de cames). Si no se clonaran, en
    // React StrictMode (donde el updater de `setState` se ejecuta dos
    // veces) la segunda invocación volvería a empujar el summary sobre
    // la MISMA referencia que la primera, duplicando el cartel de
    // puntos en pantalla y los puntos contabilizados.
    history: [...m.history],
    camesWon: { ...m.camesWon },
    round: {
      ...m.round,
      hands: { ...m.round.hands },
      tricks: m.round.tricks.map(t => ({ ...t, cards: [...t.cards] })),
      log: [...m.round.log],
    },
  };

  if (action.type === "play-card") {
    return doPlayCard(next, player, action.cardId, action.covered === true);
  }
  return doShout(next, player, action.what);
}

function doPlayCard(m: MatchState, player: PlayerId, cardId: string, covered = false): MatchState {
  const r = m.round;
  if (r.turn !== player) return m;
  const hand = r.hands[player];
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx === -1) return m;
  const card = hand[idx]!;
  r.hands[player] = [...hand.slice(0, idx), ...hand.slice(idx + 1)];

  const trick = r.tricks[r.tricks.length - 1]!;
  trick.cards.push({ player, card, covered: covered || undefined });
  r.log.push({ type: "play", player, card });

  if (r.tricks.length === 1 && !r.envitResolved && r.envitState.kind === "none") {
    const peuNos: PlayerId = teamOf(r.mano) === "nos" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const peuElls: PlayerId = teamOf(r.mano) === "ells" ? partnerOf(r.mano) : partnerOf(nextPlayer(r.mano));
    const peusPlayed = trick.cards.some(tc => tc.player === peuNos) && trick.cards.some(tc => tc.player === peuElls);
    if (peusPlayed) {
      r.envitResolved = true;
      r.envitState = { kind: "rejected", points: 0, wonBy: "nos" };
    }
  }

  if (r.phase === "envit") r.phase = "playing";

  if (trick.cards.length === 4) {
    resolveTrick(m);
  } else {
    r.turn = nextPlayer(player);
  }

  if (r.tricks.length >= 1) maybeFinishRound(m);
  return m;
}

function resolveTrick(m: MatchState) {
  const r = m.round;
  const trick = r.tricks[r.tricks.length - 1]!;
  let bestStrength = -1;
  let bestPlayers: PlayerId[] = [];
  for (const tc of trick.cards) {
    // Una carta tapada no té cap valor (per davall del 4); si tothom va
    // tapat, no hi ha guanyador i la baza queda parda.
    const s = tc.covered ? -1 : cardStrength(tc.card);
    if (s > bestStrength) { bestStrength = s; bestPlayers = [tc.player]; }
    else if (s === bestStrength) bestPlayers.push(tc.player);
  }
  if (bestPlayers.length > 1) {
    const teams = new Set(bestPlayers.map(teamOf));
    if (teams.size === 1) {
      const first = trick.cards.find(tc => bestPlayers.includes(tc.player))!;
      trick.winner = first.player;
      r.log.push({ type: "trick-end", winner: first.player, parda: false });
    } else {
      trick.parda = true;
      r.log.push({ type: "trick-end", parda: true });
    }
  } else {
    trick.winner = bestPlayers[0]!;
    r.log.push({ type: "trick-end", winner: bestPlayers[0]!, parda: false });
  }

  // Leader of the next trick:
  // - If this trick has a winner, that player leads the next trick.
  // - If this trick is parda, the mano always leads the next trick
  //   (regardless of who won previous tricks).
  const nextStarter: PlayerId = trick.winner ?? r.mano;
  if (r.tricks.length < 3 && r.hands[0].length + r.hands[1].length + r.hands[2].length + r.hands[3].length > 0) {
    const played = r.tricks.filter(t => t.cards.length === 4);
    const pardaAt = played.map(t => !!t.parda);
    const winsNos = played.filter(t => !t.parda && t.winner !== undefined && teamOf(t.winner!) === "nos").length;
    const winsElls = played.filter(t => !t.parda && t.winner !== undefined && teamOf(t.winner!) === "ells").length;
    let decided = false;
    if (winsNos >= 2 || winsElls >= 2) decided = true;
    if (played.length === 2 && pardaAt[0] !== pardaAt[1]) decided = true;
    if (!decided) {
      r.tricks.push({ cards: [] });
      r.turn = nextStarter;
    }
  }
}

function maybeFinishRound(m: MatchState) {
  const r = m.round;
  // Defensa: si la ronda ja s'ha tancat, no recalculem ni resumarrem (evita
  // duplicar punts al marcador i múltiples entrades a `history`).
  if (r.phase === "round-end" || r.phase === "game-end") return;
  if (r.log.some((ev) => ev.type === "round-end" || ev.type === "game-end")) return;
  const playedTricks = r.tricks.filter(t => t.cards.length === 4);
  if (playedTricks.length === 0) return;

  const wins: Record<TeamId, number> = { nos: 0, ells: 0 };
  const pardaAt: boolean[] = [];
  for (const t of playedTricks) {
    pardaAt.push(!!t.parda);
    if (!t.parda && t.winner !== undefined) wins[teamOf(t.winner)]++;
  }

  let trucWinner: TeamId | undefined;

  // Regla 1: si guanyes 2 mans, guanyes el truc.
  if (wins.nos >= 2 && wins.nos > wins.ells) trucWinner = "nos";
  else if (wins.ells >= 2 && wins.ells > wins.nos) trucWinner = "ells";

  // Regla 2: si la 1a baza és parda, la guanya qui guanye la 2a baza.
  if (!trucWinner && playedTricks.length >= 2 && pardaAt[0] && !pardaAt[1]) {
    const w = playedTricks[1]!.winner;
    if (w !== undefined) trucWinner = teamOf(w);
  }

  // Regla 3: si la 2a baza queda parda (i la 1a no), guanya qui va guanyar la 1a.
  if (!trucWinner && playedTricks.length >= 2 && !pardaAt[0] && pardaAt[1]) {
    const w = playedTricks[0]!.winner;
    if (w !== undefined) trucWinner = teamOf(w);
  }

  // Regla 4: 1a i 2a pardes → es juga la 3a; guanya qui la guanye.
  // Si la 3a també queda parda (totes 3 pardes), guanya l'equip de la mà.
  // Regla 5: si la 3a baza queda parda i hi ha 1-1 a les dues primeres,
  // guanya l'equip que va guanyar la 1a baza (NO la mà).
  if (!trucWinner && playedTricks.length === 3) {
    if (pardaAt[0] && pardaAt[1]) {
      if (!pardaAt[2] && playedTricks[2]!.winner !== undefined) {
        trucWinner = teamOf(playedTricks[2]!.winner!);
      } else {
        trucWinner = teamOf(r.mano);
      }
    } else if (wins.nos > wins.ells) trucWinner = "nos";
    else if (wins.ells > wins.nos) trucWinner = "ells";
    else if (pardaAt[2] && !pardaAt[0] && playedTricks[0]!.winner !== undefined) {
      // 1-1 amb 3a parda: guanya qui va guanyar la 1a baza.
      trucWinner = teamOf(playedTricks[0]!.winner!);
    } else if (pardaAt[2] && pardaAt[0] && !pardaAt[1] && playedTricks[1]!.winner !== undefined) {
      // (Defensa) 1a parda, 2a amb winner i 3a parda — ja resolta per regla 2,
      // però per coherència: guanya qui va guanyar la 2a.
      trucWinner = teamOf(playedTricks[1]!.winner!);
    } else trucWinner = teamOf(r.mano);
  }

  if (trucWinner) finishRound(m, trucWinner);
}

function finishRound(m: MatchState, trucWinner: TeamId) {
  const r = m.round;
  // Defensa: no tanquem dues vegades la mateixa ronda (evita duplicar punts).
  if (r.phase === "round-end" || r.phase === "game-end") return;
  if (r.log.some((ev) => ev.type === "round-end" || ev.type === "game-end")) return;

  // Esbrina el màxim nivell d'envit cantat aquesta ronda (per al cartell del marcador).
  let envitLevel: 2 | 4 | "falta" | undefined;
  for (const ev of r.log) {
    if (ev.type === "shout") {
      if (ev.what === "envit" && envitLevel === undefined) envitLevel = 2;
      else if (ev.what === "renvit") envitLevel = 4;
      else if (ev.what === "falta-envit") envitLevel = "falta";
    }
  }
  // Màxim nivell de truc cantat (2/3/4/24).
  let trucLevelCalled: 0 | 2 | 3 | 4 | 24 = 0;
  for (const ev of r.log) {
    if (ev.type === "shout") {
      if (ev.what === "truc" && trucLevelCalled < 2) trucLevelCalled = 2;
      else if (ev.what === "retruc") trucLevelCalled = 3;
      else if (ev.what === "quatre") trucLevelCalled = 4;
      else if (ev.what === "joc-fora") trucLevelCalled = 24;
    }
  }

  let trucPoints = 1;
  let jocFora = false;
  let trucRejected = false;
  if (r.trucState.kind === "accepted") {
    if (r.trucState.level === 24) {
      // "Joc fora" acceptat: tanca tota la partida.
      jocFora = true;
      trucPoints = 0; // no s'utilitza per a punts; va directe a la victòria
    } else {
      trucPoints = r.trucState.level;
    }
  } else if (r.trucState.kind === "rejected") {
    trucPoints = r.trucState.pointsAwarded;
    trucWinner = r.trucState.wonBy;
    trucRejected = true;
  }

  let envitWinner: TeamId | undefined;
  let envitPoints = 0;
  let envitRejected = false;
  if (r.envitState.kind === "accepted") {
    envitPoints = r.envitState.points;
    envitWinner = computeEnvitWinner(r);
  } else if (r.envitState.kind === "rejected") {
    envitPoints = r.envitState.points;
    envitWinner = r.envitState.wonBy;
    // points === 0 vol dir que ningú no ha cantat envit (cas implícit); no és "no querit".
    envitRejected = envitPoints > 0;
  }

  const summary: RoundSummary = {
    trucPoints,
    envitPoints,
    trucWinner,
    envitWinner,
    envitLevel,
    envitRejected,
    trucLevel: trucLevelCalled,
    trucRejected,
  };
  r.log.push({ type: "round-end", summary });
  m.history.push(summary);
  r.phase = "round-end";

  // Resolució de "joc fora": guanya tota la partida.
  if (jocFora) {
    m.jocForaWinner = trucWinner;
    r.phase = "game-end";
    r.log.push({ type: "game-end", winner: trucWinner });
    return;
  }

  // Aplica envit primer (si s'ha cantat) i comprova cama; després truc.
  // L'envit es resol abans del truc en l'ordre tradicional.
  const apply = (team: TeamId, pts: number): boolean => {
    if (pts <= 0) return false;
    return addPointsToTeam(m.scores, team, pts, m.targetCama);
  };

  // Helper: simula si afegir `pts` a `team` tancaria la cama (bones >= targetCama),
  // sense mutar el marcador real.
  const wouldClose = (team: TeamId, pts: number): boolean => {
    if (pts <= 0) return false;
    const s = m.scores[team];
    let remaining = pts;
    let males = s.males;
    if (males < m.targetCama) {
      const room = m.targetCama - males;
      const add = Math.min(room, remaining);
      males += add;
      remaining -= add;
    }
    return s.bones + remaining >= m.targetCama;
  };

  let camaClosedBy: TeamId | undefined;
  if (envitWinner && envitPoints > 0) {
    // Regla "11 buenes" / match-point de cama: si algun equip està a 1 punt
    // de tancar la cama, els punts d'envit es capen a 1 perquè no es puga
    // "saltar" el truc amb un envit gros quan ja s'està a tocar.
    let pts = envitPoints;
    const matchPoint =
      m.scores[envitWinner].bones >= m.targetCama - 1 ||
      m.scores.nos.bones >= m.targetCama - 1 ||
      m.scores.ells.bones >= m.targetCama - 1;
    if (matchPoint) {
      pts = Math.min(pts, 1);
    }
    // PREFERÈNCIA D'ENVIT SOBRE TRUC: si tant l'envit (valor original,
    // sense capar) com el truc tancarien la cama per a equips distints,
    // l'envit té preferència → no capem l'envit perquè puga tancar de
    // fet la cama. Així l'equip que ha guanyat l'envit guanya la cama.
    if (
      matchPoint &&
      trucWinner &&
      trucPoints > 0 &&
      trucWinner !== envitWinner &&
      wouldClose(envitWinner, envitPoints) &&
      wouldClose(trucWinner, trucPoints)
    ) {
      pts = envitPoints;
    }
    if (apply(envitWinner, pts)) camaClosedBy = envitWinner;
  }
  if (!camaClosedBy && trucPoints > 0) {
    if (apply(trucWinner, trucPoints)) camaClosedBy = trucWinner;
  } else if (camaClosedBy && trucPoints > 0 && trucWinner !== camaClosedBy) {
    // Si l'envit ja ha tancat cama, el truc d'aquesta ronda no compta
    // (la cama ja està decidida).
  }

  if (camaClosedBy) {
    m.camesWon[camaClosedBy] += 1;
    m.cames = m.camesWon.nos + m.camesWon.ells;
    if (m.camesWon[camaClosedBy] >= m.targetCames) {
      r.phase = "game-end";
      r.log.push({ type: "game-end", winner: camaClosedBy });
    } else {
      // Nova cama: tots dos equips comencen de zero (males/bones independents).
      m.scores.nos = { males: 0, bones: 0 };
      m.scores.ells = { males: 0, bones: 0 };
    }
  }
}

function computeEnvitWinner(r: RoundState): TeamId | undefined {
  // IMPORTANT: usar `playerTotalEnvit` (cartes en mà + ja jugades), no
  // `bestEnvit(r.hands[p])`, perquè l'envit es resol sobre les 3 cartes
  // originals. Si s'havien jugat cartes abans (p. ex. envit deferit
  // després del truc), `bestEnvit` només sobre la mà donaria un valor
  // erroni i podria triar el guanyador equivocat.
  const envits: Record<PlayerId, number> = {
    0: playerTotalEnvit(r, 0),
    1: playerTotalEnvit(r, 1),
    2: playerTotalEnvit(r, 2),
    3: playerTotalEnvit(r, 3),
  };
  // Regla: guanya l'envit el jugador amb la millor puntuació. En cas d'empat
  // (entre companys o entre rivals), guanya el jugador empatat més pròxim al
  // mà (recorreguent en ordre mà → mà+1 → mà+2 → mà+3). El punt va al seu equip.
  let bestPlayer: PlayerId = r.mano;
  let bestScore = envits[r.mano];
  let p: PlayerId = nextPlayer(r.mano);
  for (let i = 1; i < 4; i++) {
    if (envits[p] > bestScore) {
      bestScore = envits[p];
      bestPlayer = p;
    }
    // Si envits[p] === bestScore, no actualitzem: el primer trobat (més pròxim
    // al mà) manté la prioritat.
    p = nextPlayer(p);
  }
  return teamOf(bestPlayer);
}

function doShout(m: MatchState, player: PlayerId, what: ShoutKind): MatchState {
  const r = m.round;
  r.log.push({ type: "shout", player, what });

  // Helper local: el jugador `p` és el "primer de la pareja" en l'ordre
  // de tirada partint de la mà. Si ho és, en cantar envit/renvit/falta
  // queda obligat a cantar truc en quant l'envit es resolga.
  const isFirstOfPair = (p: PlayerId): boolean => {
    const distP = (p - r.mano + 4) % 4;
    const distPartner = (((p + 2) % 4) - r.mano + 4) % 4;
    return distP < distPartner;
  };

  switch (what) {
    case "truc":
    case "retruc":
    case "quatre":
    case "joc-fora": {
      const levelMap: Record<string, 2 | 3 | 4 | 24> = { truc: 2, retruc: 3, quatre: 4, "joc-fora": 24 };
      const level = levelMap[what]!;
      r.trucState = { kind: "pending", level, calledBy: player, awaitingTeam: teamOf(player) === "nos" ? "ells" : "nos" };
      r.turn = nextRespondent(player);
      // Si aquest jugador tenia l'obligació encadenada de truc (havia
      // envidat com a primer de la pareja), ja l'ha complida.
      if (r.chainedTrucPending === player) r.chainedTrucPending = undefined;
      break;
    }
    case "envit": {
      if (r.trucState.kind === "pending") {
        r.deferredTruc = {
          level: r.trucState.level,
          calledBy: r.trucState.calledBy,
          awaitingTeam: r.trucState.awaitingTeam,
        };
        r.trucState = { kind: "none", level: 0 };
      }
      r.envitState = { kind: "pending", level: 2, calledBy: player, awaitingTeam: teamOf(player) === "nos" ? "ells" : "nos", prevAcceptedLevel: 0 };
      r.turn = nextRespondent(player);
      // "Envit i truca": si el cantador és primer de la pareja i no hi
      // ha truc diferit ja en joc, queda obligat a cantar truc després.
      if (!r.deferredTruc && isFirstOfPair(player)) {
        r.chainedTrucPending = player;
      }
      break;
    }
    case "renvit": {
      const prevLvl = r.envitState.kind === "pending" && typeof r.envitState.level === "number" ? r.envitState.level : 2;
      r.envitState = { kind: "pending", level: 4, calledBy: player, awaitingTeam: teamOf(player) === "nos" ? "ells" : "nos", prevAcceptedLevel: prevLvl };
      r.turn = nextRespondent(player);
      if (!r.deferredTruc && isFirstOfPair(player)) {
        r.chainedTrucPending = player;
      }
      break;
    }
    case "falta-envit": {
      if (r.trucState.kind === "pending") {
        r.deferredTruc = {
          level: r.trucState.level,
          calledBy: r.trucState.calledBy,
          awaitingTeam: r.trucState.awaitingTeam,
        };
        r.trucState = { kind: "none", level: 0 };
      }
      // Punts si el rival no vol la falta-envit:
      // - falta directa (sense envit previ acceptat encara): 1 punt
      // - falta després de envit (2): 2 punts
      // - falta després de renvit (4): 4 punts
      const prevLvl: 0 | 2 | 4 =
        r.envitState.kind === "pending" && typeof r.envitState.level === "number"
          ? (r.envitState.level as 2 | 4)
          : 0;
      r.envitState = { kind: "pending", level: "falta", calledBy: player, awaitingTeam: teamOf(player) === "nos" ? "ells" : "nos", prevAcceptedLevel: prevLvl };
      r.turn = nextRespondent(player);
      if (!r.deferredTruc && isFirstOfPair(player)) {
        r.chainedTrucPending = player;
      }
      break;
    }
    case "vull": {
      if (r.envitState.kind === "pending") {
        const level = r.envitState.level;
        // Càlcul de punts si s'accepta:
        // - envit (2) o renvit (4): valor literal
        // - falta-envit:
        //     · si tots dos equips estan en males → guanyar la falta = guanyar la cama
        //       (assignem prou punts perquè el guanyador tanqui la cama amb seguretat)
        //     · si algun equip ja està en bones → punts = el que li falta al líder
        //       (el que té més bones) per arribar a 12 bones
        let points: number;
        if (level === "falta") {
          const nosBones = m.scores.nos.bones;
          const ellsBones = m.scores.ells.bones;
          const anyInBones = nosBones > 0 || ellsBones > 0;
          if (anyInBones) {
            const leaderBones = Math.max(nosBones, ellsBones);
            points = Math.max(1, m.targetCama - leaderBones);
          } else {
            // Ambdós en males → assegurem tancar la cama amb el guanyador.
            // 24 punts són suficients per omplir males (12) i bones (12).
            points = m.targetCama * 2;
          }
        } else {
          points = level;
        }
        // Match-point de cama: l'envit val 1 punt sí o sí.
        if (isCamaMatchPoint(m)) points = 1;
        r.envitState = { kind: "accepted", points };
        r.envitResolved = true;
        if (r.deferredTruc) {
          r.trucState = {
            kind: "pending",
            level: r.deferredTruc.level,
            calledBy: r.deferredTruc.calledBy,
            awaitingTeam: r.deferredTruc.awaitingTeam,
          };
          r.turn = nextRespondent(r.deferredTruc.calledBy);
          r.deferredTruc = undefined;
        } else if (r.chainedTrucPending !== undefined) {
          // "Envit i truca": el cantador d'envit (primer de la pareja)
          // truca automàticament en el moment que l'envit es resol.
          const caller = r.chainedTrucPending;
          r.log.push({ type: "shout", player: caller, what: "truc" });
          r.trucState = {
            kind: "pending",
            level: 2,
            calledBy: caller,
            awaitingTeam: teamOf(caller) === "nos" ? "ells" : "nos",
          };
          r.turn = nextRespondent(caller);
          r.chainedTrucPending = undefined;
        } else {
          r.turn = whoseTurnAfterCall(r);
        }
      } else if (r.trucState.kind === "pending") {
        r.trucState = { kind: "accepted", level: r.trucState.level };
        r.turn = whoseTurnAfterCall(r);
      }
      break;
    }
    case "no-vull": {
      if (r.envitState.kind === "pending") {
        const envit = r.envitState;
        const rejectedBy = [...(envit.rejectedBy ?? []), player];
        const teammates: PlayerId[] = ([0, 1, 2, 3] as PlayerId[]).filter(
          (p) => teamOf(p) === envit.awaitingTeam
        );
        const allRejected = teammates.every((p) => rejectedBy.includes(p));
        if (!allRejected) {
          r.envitState = { ...envit, rejectedBy };
          const pending = teammates.find((p) => !rejectedBy.includes(p))!;
          r.turn = pending;
          break;
        }
        // Punts atorgats si el rival no vol:
        // - envit (2) → 1 punt
        // - renvit (4) → 2 punts (el que ja estava acceptat com a envit)
        // - falta-envit → depèn del nivell previ acceptat:
        //     · directa (prev = 0) → 1 punt
        //     · després d'envit (prev = 2) → 2 punts
        //     · després de renvit (prev = 4) → 4 punts
        let prev: number;
        if (envit.level === 2) prev = 1;
        else if (envit.level === 4) prev = 2;
        else {
          const pa = (envit as { prevAcceptedLevel?: 0 | 2 | 4 }).prevAcceptedLevel ?? 0;
          prev = pa === 0 ? 1 : pa === 2 ? 2 : 4;
        }
        // Match-point de cama: l'envit no querit val 1 punt sí o sí.
        if (isCamaMatchPoint(m)) prev = 1;
        r.envitState = { kind: "rejected", points: prev, wonBy: teamOf(envit.calledBy) };
        r.envitResolved = true;
        if (r.deferredTruc) {
          r.trucState = {
            kind: "pending",
            level: r.deferredTruc.level,
            calledBy: r.deferredTruc.calledBy,
            awaitingTeam: r.deferredTruc.awaitingTeam,
          };
          r.turn = nextRespondent(r.deferredTruc.calledBy);
          r.deferredTruc = undefined;
        } else if (r.chainedTrucPending !== undefined) {
          // "Envit i truca": el cantador d'envit truca automàticament
          // encara que el rival haja dit "no vull" a l'envit.
          const caller = r.chainedTrucPending;
          r.log.push({ type: "shout", player: caller, what: "truc" });
          r.trucState = {
            kind: "pending",
            level: 2,
            calledBy: caller,
            awaitingTeam: teamOf(caller) === "nos" ? "ells" : "nos",
          };
          r.turn = nextRespondent(caller);
          r.chainedTrucPending = undefined;
        } else {
          r.turn = whoseTurnAfterCall(r);
        }
      } else if (r.trucState.kind === "pending") {
        const truc = r.trucState;
        const rejectedBy = [...(truc.rejectedBy ?? []), player];
        const teammates: PlayerId[] = ([0, 1, 2, 3] as PlayerId[]).filter(
          (p) => teamOf(p) === truc.awaitingTeam
        );
        const allRejected = teammates.every((p) => rejectedBy.includes(p));
        if (!allRejected) {
          r.trucState = { ...truc, rejectedBy };
          const pending = teammates.find((p) => !rejectedBy.includes(p))!;
          r.turn = pending;
          break;
        }
        const callerTeam = teamOf(truc.calledBy);
        const prevPts = truc.level === 2 ? 1 : truc.level === 3 ? 2 : truc.level === 4 ? 3 : 4;
        r.trucState = { kind: "rejected", pointsAwarded: prevPts, wonBy: callerTeam };
        finishRound(m, callerTeam);
      }
      break;
    }
    case "passe":
    case "so-meues": {
      break;
    }
  }
  return m;
}

function nextRespondent(caller: PlayerId): PlayerId {
  let p = nextPlayer(caller);
  while (teamOf(p) === teamOf(caller)) p = nextPlayer(p);
  return p;
}

function whoseTurnAfterCall(r: RoundState): PlayerId {
  const trick = r.tricks[r.tricks.length - 1]!;
  if (trick.cards.length === 0) {
    // Current trick hasn't started yet: the leader is the winner of the
    // previous completed trick. If there is no previous trick, or the
    // previous trick was parda, the leader is the mano.
    const prev = r.tricks[r.tricks.length - 2];
    if (prev && prev.winner !== undefined && !prev.parda) return prev.winner;
    return r.mano;
  }
  const last = trick.cards[trick.cards.length - 1]!;
  return nextPlayer(last.player);
}

export function startNextRound(m: MatchState): MatchState {
  if (m.round.phase === "game-end") return m;
  const newDealer = nextPlayer(m.dealer);
  return {
    ...m,
    dealer: newDealer,
    round: dealRound(newDealer),
  };
}