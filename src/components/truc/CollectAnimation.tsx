import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlayerId, Rank, Suit } from "@/game/types";
import { PlayingCard } from "./PlayingCard";
import { getMuted } from "@/lib/speech";

// Context d'àudio compartit entre repartiments / recollides.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/** So suau de cartes lliscant cap al mazo. */
function playCollectSound() {
  if (getMuted()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.45;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.16;
      const t = i / len;
      const env = Math.pow(t, 0.5) * Math.pow(1 - t, 1.4) * 3.2;
      data[i] = pink * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1800, now);
    bp.frequency.exponentialRampToValueAtTime(600, now + dur * 0.9);
    bp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur + 0.02);
  } catch {
    // Ignora errors silenciosament.
  }
}

/**
 * Cada item porta posicions ABSOLUTES en píxels (relatives a la finestra,
 * com retorna `getBoundingClientRect`). L'overlay es renderitza com a
 * `position: fixed; inset: 0`, així que aquestes coordenades són directament
 * els valors `left`/`top` del card animat.
 *
 * `width` i `height` són la mida de la carta original perquè el clon a
 * l'overlay quedi exactament superposat sobre l'element original (sense
 * cap salt de píxels).
 */
export interface CollectedCard {
  id: string;
  player: PlayerId;
  suit: Suit;
  rank: Rank;
  /** True si la carta es trobava encara a la mà del jugador (no jugada). */
  inHand?: boolean;
  /** Posició inicial mesurada del centre de la carta (px, viewport). */
  startX: number;
  startY: number;
  /** Mida real de la carta original (px). */
  width: number;
  height: number;
  /** Rotació inicial (CSS, p.ex. "4deg"). */
  startRot: string;
  /** Mostra la carta boca avall a l'animació. */
  faceDown?: boolean;
  /** Tamany visual: "sm" o "md". */
  size: "sm" | "md";
}

interface CollectAnimationProps {
  /** Clau única d'aquesta recollida (canvia entre mans). */
  collectKey: string;
  /** Llista de cartes amb les seues posicions absolutes mesurades. */
  cards: CollectedCard[];
  /** Posició destí del mazo (centre, px viewport). */
  dealerX: number;
  dealerY: number;
  /** Confirma que els clons ja estan muntats sobre les cartes originals. */
  onReady?: () => void;
  /** Notifica que tota l'animació ha acabat. */
  onComplete: () => void;
}

const STAGGER_MS = 90;
const FLY_DURATION_MS = 850;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Anima les cartes des de les seues posicions reals (mesurades del DOM
 * just abans d'arrencar) cap al seient del dealer, com si recollira les
 * cartes per a barrejar i repartir de nou. Sense flickers ni salts: cada
 * carta arrenca a la coordenada exacta on estava l'original.
 */
export function CollectAnimation({
  collectKey,
  cards,
  dealerX,
  dealerY,
  onReady,
  onComplete,
}: CollectAnimationProps) {
  const [phase, setPhase] = useState<"start" | "fly">("start");
  const completedRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    completedRef.current = false;
    setPhase("start");
    // Per evitar el "flash"/desaparició de les cartes originals abans que
    // els clons estiguen pintats: esperem un frame perquè els clons en
    // fase "start" (a la posició exacta on estan les cartes reals) es
    // dibuixin a la pantalla, i només llavors avisem `onReady` perquè el
    // pare amagui els originals. Així no hi ha cap frame en què res sigui
    // visible: primer apareix el clon damunt l'original, i tot seguit
    // l'original desapareix substituït pel clon que ja està al mateix lloc.
    // Al frame següent arrenquem la transició de vol.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      onReady?.();
      raf2 = window.requestAnimationFrame(() => {
        setPhase("fly");
        playCollectSound();
      });
    });
    const totalMs = (cards.length > 0 ? (cards.length - 1) * STAGGER_MS : 0) + FLY_DURATION_MS + 80;
    const t = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, totalMs);
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectKey]);

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {cards.map((c, idx) => {
        const delay = idx * STAGGER_MS;
        // Mida intrínseca del PlayingCard segons "size" (vegeu PlayingCard.tsx).
        const intrinsicW = c.size === "sm" ? 44 : 64;
        const intrinsicH = c.size === "sm" ? 64 : 92;
        const style: React.CSSProperties = phase === "fly"
          ? {
              left: `${dealerX}px`,
              top: `${dealerY}px`,
              width: `${intrinsicW}px`,
              height: `${intrinsicH}px`,
              transform: "translate(-50%, -50%) rotate(-6deg) scale(0.88)",
              opacity: 0,
              transition: `left ${FLY_DURATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, top ${FLY_DURATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, transform ${FLY_DURATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, opacity 260ms ease-out ${delay + FLY_DURATION_MS - 260}ms`,
            }
          : {
              left: `${c.startX}px`,
              top: `${c.startY}px`,
              width: `${intrinsicW}px`,
              height: `${intrinsicH}px`,
              transform: `translate(-50%, -50%) rotate(${c.startRot})`,
              opacity: 1,
              transition: "none",
            };
        return (
          <div
            key={c.id}
            className="absolute will-change-transform"
            style={style}
          >
            <div className="card-shadow w-full h-full">
              <PlayingCard
                suit={c.faceDown ? undefined : c.suit}
                rank={c.faceDown ? undefined : c.rank}
                faceDown={c.faceDown}
                size={c.size}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}