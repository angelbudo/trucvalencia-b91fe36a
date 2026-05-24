/**
 * Selector único (single source of truth) per a derivar la vista visual
 * de les mans (`handsView`) i la `match` visual durant la transició entre
 * rondes (`collectingVisualMatch`).
 *
 * Aquesta funció és **purament derivada**: només llig refs/flags i no
 * muta res. Tant el mode "només bots" com el mode online consumeixen el
 * mateix `<TrucBoard>`, que és l'únic que crida aquest selector. Així
 * qualsevol canvi en la lògica de visualització queda automàticament
 * compartit pels dos modes i no es poden desincronitzar.
 *
 * Reglas:
 *  - Mentre s'està fent la recollida (`collecting`) o estem en el "gap"
 *    pendent (snapshot capturat però encara sense `dealing`/`passing`),
 *    mantenim la `match` i les mans del snapshot anterior.
 *  - Durant el repartiment (`dealing`), congelem les mans al snapshot
 *    inicial capturat al `dealingHandsRef`.
 *  - En qualsevol altre cas, fem servir l'estat actual del round (`r.hands`).
 *
 * IMPORTANT: aquest fitxer és l'**única** font on viu aquesta derivació.
 * NO duplicar aquesta lògica enlloc més. Si cal canviar el comportament,
 * cal canviar-lo aquí i els tests de paritat ho verificaran.
 */

import type { MatchState, PlayerId, Card } from "./types";

export type HandsByPlayer = Record<PlayerId, Card[]>;

export interface HandsViewSelectorInput {
  /** Estat de la ronda actual (font de les mans "noves"). */
  currentHands: HandsByPlayer;
  /** Match actual (la nova ronda ja propagada). */
  match: MatchState;
  /** True mentre l'animació de recollida està en curs. */
  collecting: boolean;
  /** True mentre l'animació de repartiment està en curs. */
  dealing: boolean;
  /** True mentre l'animació de pase del mazo està en curs. */
  passing: boolean;
  /**
   * Snapshot de la `match` al final de la ronda anterior. `null` quan no
   * hi ha ronda anterior pendent de visualitzar.
   */
  lastRoundVisualMatch: MatchState | null;
  /**
   * True quan tenim snapshot de cartes capturat al final de ronda
   * (lastRoundSnapshotRef.current != null). Es passa com a booleà per
   * evitar acoplar el selector al tipus intern del snapshot.
   */
  hasLastRoundSnapshot: boolean;
  /**
   * Mans congelades al moment d'arrencar el repartiment. `null` quan no
   * estem repartint.
   */
  dealingHands: HandsByPlayer | null;
}

export interface HandsViewSelectorOutput {
  /** True quan estem en el gap entre fi de ronda i arrencada de la recollida. */
  hasPendingCollectSnapshot: boolean;
  /** Match a mostrar al `<TableSurface>` durant la transició (o null). */
  collectingVisualMatch: MatchState | null;
  /** Vista efectiva de les mans per a cada seient. */
  handsView: HandsByPlayer;
}

/**
 * Cache referencial: quan dos `HandsByPlayer` són shallow-equal (mateixos
 * arrays per a cada PlayerId), retornem el primer per preservar la identitat
 * i evitar que `useMemo` invalide els fills. Els arrays interns ja són
 * estables si vénen del mateix snapshot/dealing/round, per tant n'hi ha prou
 * amb comparar per referència element a element.
 */
let lastOutput: HandsViewSelectorOutput | null = null;

function shallowEqualHands(a: HandsByPlayer, b: HandsByPlayer): boolean {
  if (a === b) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k as unknown as PlayerId] !== b[k as unknown as PlayerId]) return false;
  }
  return true;
}

/** Test-only: clear the memo cache so unit tests don't leak state. */
export function __resetHandsViewSelectorCache() {
  lastOutput = null;
}

export function selectHandsView(input: HandsViewSelectorInput): HandsViewSelectorOutput {
  const {
    currentHands,
    collecting,
    dealing,
    passing,
    lastRoundVisualMatch,
    hasLastRoundSnapshot,
    dealingHands,
  } = input;

  const hasPendingCollectSnapshot =
    !!lastRoundVisualMatch && hasLastRoundSnapshot && !dealing && !passing;

  const collectingVisualMatch =
    collecting || hasPendingCollectSnapshot ? lastRoundVisualMatch : null;

  const nextHandsView: HandsByPlayer = collectingVisualMatch
    ? collectingVisualMatch.round.hands
    : dealing && dealingHands
      ? dealingHands
      : currentHands;

  // Si la sortida és equivalent a l'anterior, reutilitza-la per estabilitzar
  // la identitat de `handsView` i de l'objecte sencer.
  if (
    lastOutput &&
    lastOutput.hasPendingCollectSnapshot === hasPendingCollectSnapshot &&
    lastOutput.collectingVisualMatch === collectingVisualMatch &&
    shallowEqualHands(lastOutput.handsView, nextHandsView)
  ) {
    return lastOutput;
  }

  // Si només canvien els objectes contenidors però els arrays per seient són
  // els mateixos, preserva la identitat del map de mans anterior.
  const handsView =
    lastOutput && shallowEqualHands(lastOutput.handsView, nextHandsView)
      ? lastOutput.handsView
      : nextHandsView;

  lastOutput = { hasPendingCollectSnapshot, collectingVisualMatch, handsView };
  return lastOutput;
}