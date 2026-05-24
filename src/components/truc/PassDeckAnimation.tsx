import { useEffect, useRef, useState } from "react";
import { PlayerId } from "@/game/types";
import { PlayingCard } from "./PlayingCard";
import { getMuted } from "@/lib/speech";

// Context d'àudio compartit (reutilitzat).
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

/** So suau de paquet de cartes lliscant per la taula. */
function playPassDeckSound() {
  if (getMuted()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.55;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      const t = i / len;
      // Atac suau, sosteniment durant el lliscament i caiguda al final.
      const env = Math.pow(t, 0.35) * Math.pow(1 - t, 1.1) * 3.0;
      data[i] = pink * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(1600, now + dur * 0.85);
    bp.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.09;
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur + 0.02);

    // Petit "tap" final quan el mazo arriba al repartidor.
    const tapStart = now + dur * 0.92;
    const tapDur = 0.06;
    const tapLen = Math.floor(ctx.sampleRate * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, ctx.sampleRate);
    const tdata = tapBuf.getChannelData(0);
    for (let i = 0; i < tapLen; i++) {
      const t = i / tapLen;
      const env = Math.exp(-t * 30);
      const tone = Math.sin(2 * Math.PI * 95 * (i / ctx.sampleRate));
      tdata[i] = (tone * 0.7 + (Math.random() * 2 - 1) * 0.45) * env;
    }
    const tap = ctx.createBufferSource();
    tap.buffer = tapBuf;
    const tapGain = ctx.createGain();
    tapGain.gain.value = 0.5;
    tap.connect(tapGain);
    tapGain.connect(ctx.destination);
    tap.start(tapStart);
    tap.stop(tapStart + tapDur + 0.02);
  } catch {
    // Ignora errors silenciosament.
  }
}

/** Posicions per seient (0..3) en perspectiva del jugador local (rel). */
const SEAT_POS_BY_REL: Record<0 | 1 | 2 | 3, { x: string; y: string; rot: string }> = {
  0: { x: "50%", y: "88%", rot: "0deg" },
  1: { x: "92%", y: "50%", rot: "-90deg" },
  2: { x: "50%", y: "12%", rot: "180deg" },
  3: { x: "8%", y: "50%", rot: "90deg" },
};

interface PassDeckAnimationProps {
  /** Clau única — canvia entre repartiments. */
  passKey: string;
  /** El nou repartidor (qui rebrà el mazo). */
  dealer: PlayerId;
  /** Seient (0..3) en perspectiva inferior. Per defecte 0. */
  perspectiveSeat?: PlayerId;
  /** Notifica que l'animació ha acabat. */
  onComplete: () => void;
}

const FLY_DURATION_MS = 650;
/** Nombre de cartes que dibuixem apilades per simular el mazo. */
const DECK_VISUAL_CARDS = 5;

/**
 * Anima un petit "mazo" (pila de cartes boca avall) que llisca des del
 * jugador situat a la dreta del repartidor (= dealer anterior, qui
 * acaba de repartir) cap al nou repartidor. En sentit antihorari per
 * a passar el torn de repartir, com es fa físicament.
 */
export function PassDeckAnimation({
  passKey,
  dealer,
  perspectiveSeat = 0,
  onComplete,
}: PassDeckAnimationProps) {
  const [phase, setPhase] = useState<"start" | "fly">("start");
  const completedRef = useRef(false);

  const relOf = (p: PlayerId) => (((p - perspectiveSeat) + 4) % 4) as 0 | 1 | 2 | 3;
  // L'origen és el jugador anterior al dealer (qui li passa el mazo).
  const prevDealer = (((dealer - 1) + 4) % 4) as PlayerId;
  const origin = SEAT_POS_BY_REL[relOf(prevDealer)];
  const target = SEAT_POS_BY_REL[relOf(dealer)];

  useEffect(() => {
    completedRef.current = false;
    const raf = window.requestAnimationFrame(() => {
      setPhase("fly");
      playPassDeckSound();
    });
    const t = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, FLY_DURATION_MS + 120);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passKey]);

  const pos = phase === "fly" ? target : origin;
  const containerStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    transform: `translate(-50%, -50%) rotate(${pos.rot})`,
    transition:
      phase === "fly"
        ? `left ${FLY_DURATION_MS}ms cubic-bezier(0.45, 0.05, 0.35, 1), top ${FLY_DURATION_MS}ms cubic-bezier(0.45, 0.05, 0.35, 1), transform ${FLY_DURATION_MS}ms cubic-bezier(0.45, 0.05, 0.35, 1)`
        : "none",
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      <div className="absolute will-change-transform" style={containerStyle}>
        {/* Pila de cartes lleugerament desplaçades per simular volum. */}
        <div className="relative" style={{ width: 64, height: 92 }}>
          {Array.from({ length: DECK_VISUAL_CARDS }).map((_, i) => {
            const offset = i - (DECK_VISUAL_CARDS - 1) / 2;
            const cardStyle: React.CSSProperties = {
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translate(${offset * 0.8}px, ${offset * -0.8}px) rotate(${offset * 0.6}deg)`,
            };
            return (
              <div key={i} style={cardStyle} className="card-shadow">
                <PlayingCard faceDown size="md" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}