/**
 * Hook compartit que deriva el "flash" transitori d'un cant a partir del
 * `match.round.log`. Els cartells centrals i la veu del cant es serialitzen
 * en una cua: cada nou cartell apareix sincronitzat amb el seu àudio i no
 * en pot mostrar-se un altre fins que la veu del cant precedent ha acabat.
 * Així mai s'escolten dues veus alhora i el ritme visual segueix la veu real.
 */
import { useEffect, useRef, useState } from "react";
import { speakShout } from "@/lib/speech";
import { SHOUT_FLASH_GAP_MS, SHOUT_FLASH_HOLD_MS } from "./chatTimings";
import { computeShoutDisplay } from "./shoutDisplay";
import type { MatchState, PlayerId, ShoutKind } from "./types";

export interface ShoutFlash {
  player: PlayerId;
  what: ShoutKind;
  labelOverride?: string;
}

const QUESTION_SHOUTS: ReadonlySet<ShoutKind> = new Set([
  "envit", "renvit", "falta-envit",
  "truc", "retruc", "quatre", "joc-fora",
]);

/** Cants que es locuten en veu alta exactament quan apareix el cartell central. */
const SPOKEN_SHOUTS: ReadonlySet<ShoutKind> = new Set([
  "truc", "retruc", "quatre", "joc-fora",
  "envit", "renvit", "falta-envit",
  "vull", "no-vull",
]);

/**
 * Hook que retorna la llista de flashes actius. Sempre hi ha com a molt
 * un flash visible alhora, sincronitzat amb la reproducció de la veu.
 */
export function useShoutFlashes(match: MatchState | null, disabled = false): ShoutFlash[] {
  const [flashes, setFlashes] = useState<ShoutFlash[]>([]);
  const visibleRef = useRef<ShoutFlash[]>([]);
  const lastSeenIdxRef = useRef<number>(-1);
  const timersRef = useRef<number[]>([]);
  const roundKeyRef = useRef<string | null>(null);
  // Cua serial: cada nou flash s'encola darrere de l'anterior i només
  // apareix quan l'àudio del cant precedent ha acabat de sonar.
  const queueTailRef = useRef<Promise<void>>(Promise.resolve());
  const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    if (disabled || !match) {
      visibleRef.current = [];
      setFlashes([]);
      return;
    }
    // Vegeu el comentari original sobre `roundKey` i `round-end`/`game-end`:
    // durant aquestes fases la mà visible és l'anterior, així que normalitzem
    // restant 1 a `history.length` per no reprocessar els shouts ja vistos.
    const isRoundEnd =
      match.round.phase === "round-end" || match.round.phase === "game-end";
    const historyLenForKey = isRoundEnd
      ? Math.max(0, match.history.length - 1)
      : match.history.length;
    // No incloem `match.cames` a la clau: les cames només canvien entre
    // rondes (mai dins una ronda). Si les inclo\u00edssem, en arribar a
    // `game-end` el comptador puja i la clau canviaria \u2192 es resetejaria
    // `lastSeenIdxRef` i es tornarien a reproduir tots els cants de la
    // \u00faltima m\u00e0 (veu inclosa). A m\u00e9s, si la fase \u00e9s `game-end` no cal
    // processar res nou: tots els cants ja s'han locutat durant la m\u00e0.
    if (match.round.phase === "game-end") return;
    const roundKey = `${historyLenForKey}-${match.round.mano}`;
    if (roundKeyRef.current !== roundKey) {
      roundKeyRef.current = roundKey;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      lastSeenIdxRef.current = -1;
      // Invalida la cua actual i comença una de nova per la nova ronda.
      cancelTokenRef.current.cancelled = true;
      cancelTokenRef.current = { cancelled: false };
      queueTailRef.current = Promise.resolve();
      visibleRef.current = [];
      setFlashes([]);
    }
    const log = match.round.log;
    const start = lastSeenIdxRef.current + 1;
    const token = cancelTokenRef.current;
    for (let i = start; i < log.length; i++) {
      const ev = log[i];
      lastSeenIdxRef.current = i;
      if (ev.type === "trick-end") {
        queueTailRef.current = queueTailRef.current.then(async () => {
          if (token.cancelled) return;
          const hadVisible = visibleRef.current.length > 0;
          if (hadVisible) {
            visibleRef.current = [];
            setFlashes([]);
            await new Promise<void>((r) => {
              const t = window.setTimeout(r, SHOUT_FLASH_GAP_MS) as unknown as number;
              timersRef.current.push(t);
            });
          }
        });
        continue;
      }
      if (ev.type !== "shout") continue;
      const display = computeShoutDisplay(match);
      const labelOverride = display.shoutLabelByPlayer[ev.player] ?? undefined;
      const hidesAutomatically = !QUESTION_SHOUTS.has(ev.what);
      const player = ev.player;
      const what = ev.what;

      queueTailRef.current = queueTailRef.current.then(async () => {
        if (token.cancelled) return;
        // REGLA INTRENCABLE: no es pot mostrar un cartell central nou si
        // el cartell anterior encara està visible. Si hi ha algun flash
        // visible, l'amaguem i esperem 1s sencer abans de mostrar-ne un
        // de nou. Així mai dos cartells es solapen i sempre hi ha un
        // respir clar entre cants.
        const hadVisible = visibleRef.current.length > 0;
        if (hadVisible) {
          visibleRef.current = [];
          setFlashes([]);
        }
        if (hadVisible) {
          await new Promise<void>((r) => {
            const t = window.setTimeout(r, SHOUT_FLASH_GAP_MS) as unknown as number;
            timersRef.current.push(t);
          });
          if (token.cancelled) return;
        }
        // Avança l'àudio respecte al cartell perquè la veu i el cartell
        // s'experimenten alhora. Per als cants de truc retardem 100ms l'àudio
        // (lead menor) perquè la veu de "Truque" coincidisca amb el cartell.
        const TRUC_SHOUTS: ReadonlySet<ShoutKind> = new Set([
          "truc", "retruc", "quatre", "joc-fora",
        ]);
        // Per als cants de "Vull" / "No vull" la veu s'ha d'escoltar exactament
        // quan apareix el cartell central (sense avançar-la). Per a la resta de
        // cants mantenim un petit "lead" perquè la veu i el cartell coincidisquen
        // perceptualment (la veu té un xicotet retard d'arrencada del TTS).
        const SYNC_WITH_CARD: ReadonlySet<ShoutKind> = new Set(["vull", "no-vull"]);
        const AUDIO_LEAD_MS = SYNC_WITH_CARD.has(what)
          ? 0
          : (TRUC_SHOUTS.has(what) ? 600 : 700);
        const speakNow = () =>
          SPOKEN_SHOUTS.has(what)
            ? speakShout(what, labelOverride).catch(() => undefined)
            : Promise.resolve();
        let speakPromise: Promise<void>;
        if (AUDIO_LEAD_MS > 0) {
          speakPromise = speakNow();
          await new Promise<void>((r) => {
            const t = window.setTimeout(r, AUDIO_LEAD_MS) as unknown as number;
            timersRef.current.push(t);
          });
          if (token.cancelled) return;
          visibleRef.current = [{ player, what, labelOverride }];
          setFlashes(visibleRef.current);
        } else {
          // Mostrem el cartell i disparem la veu al mateix instant.
          visibleRef.current = [{ player, what, labelOverride }];
          setFlashes(visibleRef.current);
          speakPromise = speakNow();
        }
        const startedAt = Date.now();
        await speakPromise;
        if (token.cancelled) return;
        if (hidesAutomatically) {
          // Garanteix una visibilitat mínima del cartell central (1.6s)
          // encara que l'àudio falle, no estiga disponible o siga molt curt
          // (TTS fire-and-forget). Així "Vull!" / "No vull" sempre es
          // veuen el temps suficient per a llegir-los.
          const elapsed = Date.now() - startedAt;
          const remaining = SHOUT_FLASH_HOLD_MS - elapsed;
          if (remaining > 0) {
            await new Promise<void>((r) => {
              const t = window.setTimeout(r, remaining) as unknown as number;
              timersRef.current.push(t);
            });
            if (token.cancelled) return;
          }
          visibleRef.current = [];
          setFlashes([]);
          // Gap obligatori d'1s després que el cartell desaparega — així
          // cap cartell nou pot aparèixer abans que passe aquest segon.
          await new Promise<void>((r) => {
            const t = window.setTimeout(r, SHOUT_FLASH_GAP_MS) as unknown as number;
            timersRef.current.push(t);
          });
        }
      });
    }
  }, [match, disabled]);

  // Neteja en desmuntar.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      cancelTokenRef.current.cancelled = true;
      visibleRef.current = [];
    };
  }, []);

  return flashes;
}

/**
 * Compatibilitat enrere: retorna només el flash més recent (l'últim de la
 * llista) per a llocs que encara consumeixen un únic flash.
 */
export function useShoutFlash(_match: MatchState | null): ShoutFlash | null {
  return null;
}

/** Derives the latest flash from a list — does not run any effects. */
export function latestShoutFlash(list: ShoutFlash[]): ShoutFlash | null {
  return list.length === 0 ? null : list[list.length - 1];
}