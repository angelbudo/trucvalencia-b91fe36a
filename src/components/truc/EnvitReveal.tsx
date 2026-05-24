import { memo, useEffect, useState } from "react";
import { MatchState, PlayerId, TeamId, teamOf } from "@/game/types";
import { playerEnvitBreakdown } from "@/game/deck";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";
import { usePausableTimers } from "./usePausableTimers";

interface EnvitRevealProps {
  match: MatchState;
  perspectiveSeat?: PlayerId;
  /** Equip guanyador de l'envit (per a destacar les seues cartes). */
  winnerTeam: TeamId;
  /** Quan és cert, les transicions internes es congelen i es reprenen
   *  exactament des del mateix punt en desactivar la pausa. */
  paused?: boolean;
}

type RelPos = 0 | 1 | 2 | 3;

/** Origen aproximat d'on viuen les cartes JUGADES de cada jugador
 *  (coincideix amb POSITION_BY_REL de TableSurface). */
const PLAYED_ORIGIN: Record<RelPos, { x: string; y: string }> = {
  0: { x: "50%", y: "72%" },
  1: { x: "72%", y: "50%" },
  2: { x: "50%", y: "28%" },
  3: { x: "28%", y: "50%" },
};

/** Origen aproximat d'on viuen les cartes a la MÀ (face-down) de cada
 *  jugador. Per a HUMAN (rel 0), la mà està fora d'aquest contenidor; usem
 *  un punt molt baix perquè la carta entre des de la zona de la mà. */
const HAND_ORIGIN: Record<RelPos, { x: string; y: string }> = {
  0: { x: "50%", y: "100%" },
  1: { x: "96%", y: "50%" },
  2: { x: "50%", y: "6%" },
  3: { x: "4%", y: "50%" },
};

/** Punt de convergència on s'agrupen les cartes d'envit del jugador. */
const MEET_POINT: Record<RelPos, { x: string; y: string }> = {
  0: { x: "50%", y: "80%" },
  1: { x: "76%", y: "50%" },
  2: { x: "50%", y: "20%" },
  3: { x: "24%", y: "50%" },
};

/** Posició del nombre guanyador d'envit relativa al meet-point del guanyador. */
const NUMBER_OFFSET: Record<RelPos, { x: string; y: string }> = {
  0: { x: "0px", y: "-72px" },
  1: { x: "-90px", y: "0px" },
  2: { x: "0px", y: "72px" },
  3: { x: "90px", y: "0px" },
};

function EnvitRevealComponent({ match, perspectiveSeat = 0, winnerTeam, paused = false }: EnvitRevealProps) {
  const r = match.round;

  // Fase d'animació: 0 = entrada/flip, 1 = convergència
  const [phase, setPhase] = useState<0 | 1>(0);
  // Opacitat de l'enfosquiment del fons. Comença a 0 (sense oscuriment),
  // puja a 0.2 (20%) quan arrenca l'animació i torna a 0 abans de desmuntar.
  const [dimOpacity, setDimOpacity] = useState(0);
  const { start } = usePausableTimers(paused);
  useEffect(() => {
    start([
      { at: 16, fn: () => setDimOpacity(0.2) },
      { at: 700, fn: () => setPhase(1) },
      { at: 2600, fn: () => setDimOpacity(0) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const breakdown = ([0, 1, 2, 3] as PlayerId[]).map((p) => ({
    player: p,
    ...playerEnvitBreakdown(r, p),
  }));

  // Equip guanyador: el(s) jugador(s) amb el millor valor dins l'equip guanyador.
  const winningTeamPlayers = breakdown.filter((b) => teamOf(b.player) === winnerTeam);
  const winningValue = Math.max(...winningTeamPlayers.map((b) => b.value));
  const winningPlayer = winningTeamPlayers.find((b) => b.value === winningValue);

  return (
    <div
      className="absolute inset-0 z-40 pointer-events-none"
      aria-label="Revelació de l'envit"
      style={{ perspective: "1000px" }}
    >
      {/* Enfosquiment del fons per a destacar les cartes del envit. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-black transition-opacity duration-500 ease-out"
        style={{ opacity: dimOpacity, zIndex: 0 }}
      />
      {breakdown.map((b) => {
        const relPos = (((b.player - perspectiveSeat) + 4) % 4) as RelPos;
        const meet = MEET_POINT[relPos];
        const playedOrigin = PLAYED_ORIGIN[relPos];
        const handOrigin = HAND_ORIGIN[relPos];
        const isWinner = b.player === winningPlayer?.player;
        const numOffset = NUMBER_OFFSET[relPos];

        return (
          <div key={`envit-reveal-${b.player}`}>
            {b.cards.map((c, i) => {
              const wasPlayed = b.playedIds.has(c.id);
              const origin = wasPlayed ? playedOrigin : handOrigin;
              // Cartes solapades horitzontalment: una a l'esquerra i l'altra
              // a la dreta però compartint una part central (carta sm = 44px;
              // separem 26px perquè es vegen totes dues).
              const fanOffset = (i - (b.cards.length - 1) / 2) * 26;
              const dxFan = fanOffset;
              const dyFan = 0;

              return (
                <div
                  key={`envit-card-${b.player}-${c.id}`}
                  className="absolute transition-all duration-700 ease-out"
                  style={{
                    left: phase === 0 ? origin.x : `calc(${meet.x} + ${dxFan}px)`,
                    top: phase === 0 ? origin.y : `calc(${meet.y} + ${dyFan}px)`,
                    transform: "translate(-50%, -50%)",
                    zIndex: isWinner ? 50 : 40,
                  }}
                >
                  <div
                    className={cn(
                      "rounded-card",
                      isWinner && phase === 1 && "animate-pulse-gold",
                    )}
                    style={{
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {/* Si la carta encara estava a la ma del jugador (no
                        s'havia jugat), mostrem un flip 3D real: cara
                        boca avall (back) -> cara boca amunt (face). Aixi
                        les cartes que si compten per a l'envit es veuen
                        correctament durant la revelacio en lloc d'una
                        carta mirall confusa. Les cartes ja jugades
                        descobertes es renderitzen directament boca amunt. */}
                    {wasPlayed ? (
                      <PlayingCard suit={c.suit} rank={c.rank} size="sm" />
                    ) : (
                      <div
                        className="animate-card-flip relative"
                        style={{
                          transformOrigin: "center",
                          transformStyle: "preserve-3d",
                          width: 44,
                          height: 64,
                        }}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                          }}
                        >
                          <PlayingCard suit={c.suit} rank={c.rank} size="sm" />
                        </div>
                        <div
                          className="absolute inset-0"
                          style={{
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            transform: "rotateY(180deg)",
                          }}
                        >
                          <PlayingCard faceDown size="sm" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Número de l'envit guanyador, prop de les cartes guanyadores. */}
            {isWinner && (
              <div
                className="absolute transition-all duration-700 ease-out"
                style={{
                  left: phase === 0 ? meet.x : `calc(${meet.x} + ${numOffset.x})`,
                  top: phase === 0 ? meet.y : `calc(${meet.y} + ${numOffset.y})`,
                  transform: "translate(-50%, -50%)",
                  opacity: phase === 1 ? 1 : 0,
                  zIndex: 60,
                }}
              >
                <div
                  className="font-display font-black text-4xl leading-none tabular-nums text-primary tabular-nums"
                  style={{
                    WebkitTextStroke: "2px rgba(0,0,0,0.85)",
                    paintOrder: "stroke fill",
                    textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 0 18px hsl(var(--primary) / 0.7)",
                  }}
                >
                  {b.value}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const EnvitReveal = memo(EnvitRevealComponent);