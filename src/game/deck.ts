import type { Card, PlayerId, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["oros", "copes", "espases", "bastos"];
export const RANKS: Rank[] = [1, 3, 4, 5, 6, 7];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (rank === 1 && suit !== "espases" && suit !== "bastos") continue;
      deck.push({ suit, rank, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

export function cardStrength(c: Card): number {
  if (c.rank === 1 && c.suit === "espases") return 100;
  if (c.rank === 1 && c.suit === "bastos") return 95;
  if (c.rank === 7 && c.suit === "espases") return 90;
  if (c.rank === 7 && c.suit === "oros") return 85;
  if (c.rank === 3) return 70;
  if (c.rank === 7) return 60;
  if (c.rank === 6) return 50;
  if (c.rank === 5) return 40;
  if (c.rank === 4) return 30;
  return 0;
}

export function envitValue(c: Card): number {
  if (c.rank === 1) return 1;
  return c.rank;
}

/**
 * Calcula l'envit total d'un jugador en una ronda, considerant tant les
 * cartes que encara té a la mà com les que ja ha jugat. Aquest és el valor
 * "honest" que un bot ha d'usar per a respondre "¿Tens envit?" o per a
 * decidir si envidar — perquè l'envit es calcula sobre les 3 cartes
 * originals de la mà, no sobre les que queden.
 *
 * IMPORTANT: aquesta funció és l'origen de veritat compartit entre client
 * i edge function. Qualsevol decisió relacionada amb "envit" ha d'usar-la
 * per garantir paritat.
 */
export function playerTotalEnvit(
  round: { hands: Record<PlayerId, Card[]>; tricks: { cards: { player: PlayerId; card: Card; covered?: boolean }[] }[] },
  player: PlayerId,
): number {
  const hand = round.hands[player] ?? [];
  // Covered cards (played face-down voluntarily) are excluded from envit.
  const played: Card[] = round.tricks
    .flatMap((t) => t.cards)
    .filter((tc) => tc.player === player && !tc.covered)
    .map((tc) => tc.card);
  return bestEnvit([...hand, ...played]);
}

export function bestEnvit(hand: Card[]): number {
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit)!.push(c);
  }
  let best = 0;
  let hasPair = false;
  for (const cards of bySuit.values()) {
    if (cards.length >= 2) {
      hasPair = true;
      const top2 = [...cards].sort((a, b) => envitValue(b) - envitValue(a)).slice(0, 2);
      best = Math.max(best, 20 + envitValue(top2[0]!) + envitValue(top2[1]!));
    }
  }
  if (!hasPair && hand.length > 0) {
    const highest = Math.max(...hand.map(envitValue));
    best = 10 + highest;
  }
  return best;
}

/** Retorna les cartes que conformen el millor envit d'una mà
 *  (parella del mateix coll amb major valor sumat, o la carta més alta si no
 *  hi ha parella), juntament amb el seu valor d'envit. */
export function bestEnvitCards(hand: Card[]): { value: number; cards: Card[] } {
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit)!.push(c);
  }
  let bestValue = 0;
  let bestCards: Card[] = [];
  let hasPair = false;
  for (const cards of bySuit.values()) {
    if (cards.length >= 2) {
      hasPair = true;
      const sorted = [...cards].sort((a, b) => envitValue(b) - envitValue(a));
      const top2 = sorted.slice(0, 2);
      const val = 20 + envitValue(top2[0]!) + envitValue(top2[1]!);
      if (val > bestValue) {
        bestValue = val;
        bestCards = top2;
      }
    }
  }
  if (!hasPair && hand.length > 0) {
    const highest = [...hand].sort((a, b) => envitValue(b) - envitValue(a))[0]!;
    bestValue = 10 + envitValue(highest);
    bestCards = [highest];
  }
  return { value: bestValue, cards: bestCards };
}

/** Versió que considera tant les cartes a la mà com les ja jugades.
 *  Retorna també un Set amb els ids de les cartes ja jugades a la mesa,
 *  perquè el consumidor sàpiga quines del breakdown estan boca amunt
 *  (jugades) i quines encara boca avall (a la mà).
 *
 *  IMPORTANT: per al càlcul de l'envit considerem TOTES les cartes
 *  originals del jugador (mà actual + totes les jugades, incloent les
 *  cobertes). Això és perquè l'envit es calcula sobre les 3 cartes
 *  inicials, no sobre les que queden visibles. Si excloíem les cobertes,
 *  podia passar que `bestEnvitCards` retornés cartes equivocades quan
 *  el jugador havia cobert una de les cartes que formaven part del seu
 *  envit (p. ex. animació del final de ronda mostrant cartes que en
 *  realitat no formaven part de l'envit cantat).
 */
export function playerEnvitBreakdown(
  round: { hands: Record<PlayerId, Card[]>; tricks: { cards: { player: PlayerId; card: Card; covered?: boolean }[] }[] },
  player: PlayerId,
): { value: number; cards: Card[]; playedIds: Set<string> } {
  const hand = round.hands[player] ?? [];
  // Covered cards (played face-down voluntarily) are excluded from envit calculation.
  const uncoveredPlayed: Card[] = round.tricks
    .flatMap((t) => t.cards)
    .filter((tc) => tc.player === player && !tc.covered)
    .map((tc) => tc.card);
  // playedIds: uncovered played cards animate from the table position
  const playedIds = new Set(uncoveredPlayed.map((c) => c.id));
  const result = bestEnvitCards([...hand, ...uncoveredPlayed]);
  return { ...result, playedIds };
}

/**
 * Retorna `true` si l'As d'espases (la carta més forta del truc) ja s'ha
 * jugat en la primera baza de la ronda actual. S'usa per a prohibir que
 * cap bot diga "A tu!" en aqueix context: una vegada vista la carta més
 * forta, "A tu!" ja no aporta cap informació útil.
 */
export function asEspasesPlayedFirstTrick(round: {
  tricks: { cards: { card: Card }[] }[];
}): boolean {
  const first = round.tricks[0];
  if (!first) return false;
  return first.cards.some(
    (tc) => tc.card.rank === 1 && tc.card.suit === "espases",
  );
}


export const SUIT_SYMBOL: Record<Suit, string> = {
  oros: "🪙",
  copes: "🍷",
  espases: "⚔️",
  bastos: "🌳",
};

export const SUIT_NAME: Record<Suit, string> = {
  oros: "Oros",
  copes: "Copes",
  espases: "Espases",
  bastos: "Bastos",
};

export const RANK_NAME: Record<Rank, string> = {
  1: "As",
  3: "Tres",
  4: "Quatre",
  5: "Cinc",
  6: "Sis",
  7: "Set",
};