/**
 * Càlcul pur de l'estat visual dels cants ("carteles" de truc/envit, V/X
 * d'envit, família del cartell, parpadeig "pendent" mentre s'espera
 * resposta del rival, etc.) a partir d'un MatchState.
 *
 * Aquest mòdul és l'única font de veritat del que veu la UI per a aquests
 * carteles. Tant la partida local (offline) com la partida online han
 * d'utilitzar-lo perquè el tablero es vegi exactament igual.
 *
 * Recorre `match.round.log` i replica les mateixes transicions que abans
 * vivien dins del `setMatch(...)` de `useTrucMatch`. La idea: donat el
 * mateix `MatchState`, la sortida és sempre idèntica.
 */
import type { MatchState, PlayerId, ShoutKind } from "./types";

export interface ShoutDisplay {
  /** Cant actual del jugador (només família "truc" — "envit" viu a part). */
  lastShoutByPlayer: Record<PlayerId, ShoutKind | null>;
  /** Etiqueta sobreescrita ("Truc i passe!", etc.). */
  shoutLabelByPlayer: Record<PlayerId, string | null>;
  /** El cant del jugador ja ha estat acceptat (sense pulsació d'espera). */
  acceptedShoutByPlayer: Record<PlayerId, boolean>;
  /** Família del cant per posicionar el cartell (amunt = envit, avall = truc). */
  shoutFamilyByPlayer: Record<PlayerId, "envit" | "truc" | null>;
  /** Cartell persistent d'envit per al jugador que l'ha cantat. */
  envitShoutByPlayer: Record<PlayerId, ShoutKind | null>;
  /** Etiqueta sobreescrita per al cartell d'envit (rarament usada). */
  envitShoutLabelByPlayer: Record<PlayerId, string | null>;
  /** Resultat de l'envit per al cantador: pending / volgut / no-volgut. */
  envitOutcomeByPlayer: Record<PlayerId, { outcome: "pending" | "volgut" | "no-volgut" } | null>;
}

const ENVIT_QUESTION_SHOUTS: ReadonlySet<ShoutKind> = new Set([
  "envit", "renvit", "falta-envit",
]);
const TRUC_QUESTION_SHOUTS: ReadonlySet<ShoutKind> = new Set([
  "truc", "retruc", "quatre", "joc-fora",
]);
const RESPONSE_SHOUTS: ReadonlySet<ShoutKind> = new Set([
  "vull", "no-vull", "retruc", "quatre", "joc-fora", "renvit", "falta-envit",
]);

function emptyDisplay(): ShoutDisplay {
  return {
    lastShoutByPlayer: { 0: null, 1: null, 2: null, 3: null },
    shoutLabelByPlayer: { 0: null, 1: null, 2: null, 3: null },
    acceptedShoutByPlayer: { 0: false, 1: false, 2: false, 3: false },
    shoutFamilyByPlayer: { 0: null, 1: null, 2: null, 3: null },
    envitShoutByPlayer: { 0: null, 1: null, 2: null, 3: null },
    envitShoutLabelByPlayer: { 0: null, 1: null, 2: null, 3: null },
    envitOutcomeByPlayer: { 0: null, 1: null, 2: null, 3: null },
  };
}

/**
 * Calcula el "label override" per a un cant de truc en posició no-peu
 * (afegeix " i passe!"). Mateixa regla que `dispatch` al hook offline.
 */
function trucPasseLabel(
  what: "truc" | "retruc" | "quatre" | "joc-fora",
): string {
  const base: Record<string, string> = {
    truc: "Truque",
    retruc: "Retruque",
    quatre: "Quatre val",
    "joc-fora": "Joc fora",
  };
  return `${base[what]} i passe!`;
}

/**
 * Reconstrueix l'estat visual recorrent el log d'esdeveniments del round
 * actual. Manté els mateixos invariants que el `dispatch` del client
 * offline (vegeu `useTrucMatch.ts`).
 */
export function computeShoutDisplay(match: MatchState): ShoutDisplay {
  const out = emptyDisplay();
  const r = match.round;

  // Estat acumulat necessari per decidir "Truc i passe!" i la família
  // heretada per `vull`/`no-vull`.
  let envitResolved = false;
  let envitInPlay = false;     // hi ha algun envit en curs (pending o accepted/rejected ja registrat)
  let envitAwaitingResponse = false; // hi ha un envit cantat que encara no ha rebut vull/no-vull
  let tricksPlayed = 0;        // bazas tancades dins del round
  let trickHasPlays = false;   // alguna carta jugada en la baza actual
  const mano = r.mano;

  // Mentre la ronda està en `round-end` volem que els bocadillos de cada
  // jugador (Truc, Envit, Retruc, Vull, No vull, ...) es queden visibles
  // al costat del jugador que els va cantar durant la pausa de 3s previa
  // al repartiment de la nova mà. Per això, anem desant el darrer
  // "snapshot" no-buit dels camps relacionats amb carteles ABANS de cada
  // `trick-end` (que els netejaria) i, si en acabar la fase el resultat
  // queda buit, el restaurem.
  const isRoundEnd = r.phase === "round-end";
  type ShoutSnapshot = {
    lastShoutByPlayer: ShoutDisplay["lastShoutByPlayer"];
    shoutLabelByPlayer: ShoutDisplay["shoutLabelByPlayer"];
    acceptedShoutByPlayer: ShoutDisplay["acceptedShoutByPlayer"];
    shoutFamilyByPlayer: ShoutDisplay["shoutFamilyByPlayer"];
  };
  let lastNonEmptyShoutSnapshot: ShoutSnapshot | null = null;
  const snapshotShouts = (): ShoutSnapshot => ({
    lastShoutByPlayer: { ...out.lastShoutByPlayer },
    shoutLabelByPlayer: { ...out.shoutLabelByPlayer },
    acceptedShoutByPlayer: { ...out.acceptedShoutByPlayer },
    shoutFamilyByPlayer: { ...out.shoutFamilyByPlayer },
  });
  const hasAnyShout = (): boolean =>
    ([0, 1, 2, 3] as PlayerId[]).some((pid) => out.lastShoutByPlayer[pid] !== null);

  for (const ev of r.log) {
    if (ev.type === "play") {
      trickHasPlays = true;
      continue;
    }
    if (ev.type === "trick-end") {
      tricksPlayed += 1;
      trickHasPlays = false;
      // Desa el darrer snapshot amb cants visibles abans (per compatibilitat
      // amb la restauració a `round-end`). Ara els carteles de truc NO
      // s'esborren a `trick-end`: han de mantindre's visibles —juntament
      // amb la V verda d'acceptació— fins al final de la mà. Això
      // replica el comportament que ja té l'envit i el que demana
      // l'usuari: el cartell d'un cant de truc (truc, retruc, quatre val,
      // joc fora) acompanyat de la seua V queda visible fins que la
      // ronda acaba o fins que el mateix jugador puja el cant a un
      // nivell superior (cas que ja es gestiona en el bloc del nou cant).
      if (isRoundEnd && hasAnyShout()) {
        lastNonEmptyShoutSnapshot = snapshotShouts();
      }
      continue;
    }
    if (ev.type !== "shout") continue;

    const player = ev.player;
    const what = ev.what;

    // ---- ENVIT family ----
    if (ENVIT_QUESTION_SHOUTS.has(what)) {
      envitInPlay = true;
      envitAwaitingResponse = true;
      // Renvit / falta-envit: qualsevol envit pendent passa a "volgut".
      if (what === "renvit" || what === "falta-envit") {
        for (const pid of [0, 1, 2, 3] as PlayerId[]) {
          if (out.envitOutcomeByPlayer[pid]?.outcome === "pending") {
            out.envitOutcomeByPlayer[pid] = { outcome: "volgut" };
          }
        }
      }
      out.envitOutcomeByPlayer[player] = { outcome: "pending" };
      out.envitShoutByPlayer[player] = what;
      out.envitShoutLabelByPlayer[player] = null;
      out.shoutFamilyByPlayer[player] = "envit";
      // Una nova "pregunta" reseteja l'estat acceptat.
      out.acceptedShoutByPlayer = { 0: false, 1: false, 2: false, 3: false };
      continue;
    }

    // ---- TRUC family (call) ----
    if (TRUC_QUESTION_SHOUTS.has(what)) {
      // "Truc i passe!" si és al primer trick, sense envit resolt ni en joc,
      // i el cantador NO és el peu del seu equip.
      let labelOverride: string | null = null;
      const isFirstTrick = tricksPlayed === 0 && !trickHasPlays;
      // El "i passe!" només pot acompanyar el cant inicial de truc, mai
      // les escalades (retruc / quatre val / joc fora) — un retruc ja és
      // resposta a un truc i tanca la possibilitat d'envit.
      if (what === "truc" && isFirstTrick && !envitResolved && !envitInPlay) {
        const peuManoTeam = ((mano + 2) % 4) as PlayerId;
        const peuOtherTeam = ((mano + 3) % 4) as PlayerId;
        const callerIsPeu = player === peuManoTeam || player === peuOtherTeam;
        if (!callerIsPeu) {
          labelOverride = trucPasseLabel("truc");
        }
      }
      // Quan es fa un retruc/quatre/joc-fora, qualsevol cantador previ de
      // truc del rival queda implícitament acceptat (igual que un renvit
      // converteix l'envit pendent en "volgut"). Per això marquem la
      // seua V verda abans de registrar el nou cant. El nou cant queda
      // pendent (sense V) fins que arribe `vull`.
      const isEscalation = what === "retruc" || what === "quatre" || what === "joc-fora";
      if (isEscalation) {
        for (const pid of [0, 1, 2, 3] as PlayerId[]) {
          const cur = out.lastShoutByPlayer[pid];
          if (cur && TRUC_QUESTION_SHOUTS.has(cur) && pid !== player) {
            out.acceptedShoutByPlayer[pid] = true;
          }
        }
      } else {
        // Cant inicial de truc: cap altre cartell de truc previ pendent
        // (no hauria de ser possible). Per coherència, neteja l'estat
        // acceptat sense tocar els cartells.
        out.acceptedShoutByPlayer = { 0: false, 1: false, 2: false, 3: false };
      }
      out.lastShoutByPlayer[player] = what;
      out.shoutLabelByPlayer[player] = labelOverride;
      out.shoutFamilyByPlayer[player] = "truc";
      // El nou cant és pendent: assegurem que el seu acceptat és false.
      out.acceptedShoutByPlayer[player] = false;
      continue;
    }

    // ---- Responses (vull / no-vull) ----
    if (what === "vull" || what === "no-vull") {
      // Determina si la resposta és a un envit pendent (encara sense
      // resposta) o a un truc pendent. Ull: `envitOutcomeByPlayer` pot
      // mantindre entrades "pending" fins al bloc post-loop tot i que
      // l'envit ja s'haja resolt al log; per això usem un flag explícit
      // que es neteja en rebre la primera resposta a l'envit.
      const isEnvitResponse = envitAwaitingResponse;

      if (isEnvitResponse) {
        // Família del cartell hereta envit.
        out.shoutFamilyByPlayer[player] = "envit";
        envitResolved = true;
        envitInPlay = false;
        envitAwaitingResponse = false;
        continue;
      }

      // Resposta a un truc.
      if (what === "vull") {
        // Marca el cantador del truc com a acceptat (manté el cartell).
        for (const pid of [0, 1, 2, 3] as PlayerId[]) {
          const cur = out.lastShoutByPlayer[pid];
          if (cur && TRUC_QUESTION_SHOUTS.has(cur)) {
            out.acceptedShoutByPlayer[pid] = true;
          }
        }
      } else {
        // No-vull: esborra els cartells de truc pendent.
        for (const pid of [0, 1, 2, 3] as PlayerId[]) {
          const cur = out.lastShoutByPlayer[pid];
          if (cur && TRUC_QUESTION_SHOUTS.has(cur)) {
            out.lastShoutByPlayer[pid] = null;
            out.shoutLabelByPlayer[pid] = null;
            out.shoutFamilyByPlayer[pid] = null;
          }
        }
      }
      // No s'escriu cap cartell "vull"/"no-vull" sobre el responder: el
      // cartell ha de quedar-se en el cantador del truc (amb la V verda
      // si és "vull"). Sobreescriure'l ací esborraria un cartell de truc
      // legítim quan el responder és també un cantador previ (p. ex. el
      // qui va dir "truc" i ara accepta el "retruc" del rival).
      continue;
    }

    // Altres (passe, so-meues): no afecten els carteles.
    void RESPONSE_SHOUTS;
  }

  // Resol l'outcome final dels envits a partir del kind final de l'envitState.
  // Així replicem la regla original: només marquem volgut/no-volgut quan
  // l'envit ha quedat realment resolt al motor.
  const envSt = r.envitState;
  if (envSt.kind === "accepted" || envSt.kind === "rejected") {
    const result: "volgut" | "no-volgut" = envSt.kind === "accepted" ? "volgut" : "no-volgut";
    for (const pid of [0, 1, 2, 3] as PlayerId[]) {
      if (out.envitOutcomeByPlayer[pid]?.outcome === "pending") {
        out.envitOutcomeByPlayer[pid] = { outcome: result };
      }
    }
  }

  // Si estem a `round-end` i el processament del log ha deixat els
  // bocadillos buits (per ex. perquè la mà ha acabat amb un `trick-end`
  // que els ha netejat), restaurem el darrer snapshot amb cants visibles.
  // Així els carteles de Truc / Envit / Retruc / Vull / No vull es queden
  // junts al costat de cada jugador durant els 3s de pausa abans del
  // següent repartiment.
  if (isRoundEnd && !hasAnyShout() && lastNonEmptyShoutSnapshot) {
    out.lastShoutByPlayer = lastNonEmptyShoutSnapshot.lastShoutByPlayer;
    out.shoutLabelByPlayer = lastNonEmptyShoutSnapshot.shoutLabelByPlayer;
    out.acceptedShoutByPlayer = lastNonEmptyShoutSnapshot.acceptedShoutByPlayer;
    out.shoutFamilyByPlayer = lastNonEmptyShoutSnapshot.shoutFamilyByPlayer;
  }

  return out;
}