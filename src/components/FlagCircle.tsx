/**
 * Bandera circular per a un idioma. Mostra la bandera dins d'un cercle amb
 * vora suau, recortada amb `clipPath` perquè s'ajuste perfectament al disc.
 *  - "ca" → Senyera de la Comunitat Valenciana (franges verticals).
 *  - "es" → Bandera d'Espanya (franges horitzontals).
 */
import type * as React from "react";
import type { GameLanguage } from "@/lib/gameSettings";

interface Props {
  lang: GameLanguage;
  size?: number;
  className?: string;
}

export function FlagCircle({ lang, size = 18, className }: Props) {
  const id = `flag-clip-${lang}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {lang === "ca" ? (
          <g transform="rotate(-90 12 12)">
            <SenyeraValenciana />
          </g>
        ) : (
          <BanderaEspanya />
        )}
      </g>
      <circle
        cx="12"
        cy="12"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Senyera Coronada (Comunitat Valenciana). Simplificació estilitzada:
 *  - Banda blava vertical a l'esquerra (~22% d'amplada) amb una corona daurada.
 *  - 4 franges verticals alternant groc / roig al cos principal.
 * No reproduïm la corona heràldica completa, només un símbol circular daurat
 * dins de la franja blava perquè es lliga clarament amb la senyera valenciana.
 */
function SenyeraValenciana() {
  // Senyera Coronada: franja blava vertical a dalt (a l'asta), perpendicular
  // a les franges horitzontals grogues i roges del cos principal.
  // Banda blava ocupa la part superior (y ∈ [0, 6)).
  // Cos: 4 franges roges + 4 grogues alternant horitzontalment (y ∈ [6, 24)).
  const bodyTop = 6;
  const bodyH = 24 - bodyTop; // 18
  const stripeW = 24 / 8; // 8 franges verticals al cos
  const stripes: React.ReactElement[] = [];
  for (let i = 0; i < 8; i++) {
    stripes.push(
      <rect
        key={i}
        x={i * stripeW}
        y={bodyTop}
        width={stripeW}
        height={bodyH}
        fill={i % 2 === 0 ? "#FFD700" : "#DA121A"}
      />,
    );
  }
  return (
    <>
      {/* Cos amb franges verticals groc/roig */}
      {stripes}
      {/* Banda blava superior, perpendicular a les franges */}
      <rect x="0" y="0" width="24" height={bodyTop} fill="#0042A6" />
      {/* Corona estilitzada centrada a la franja blava */}
      <g transform="translate(12 3)">
        <circle r="1.6" fill="#FFD700" stroke="#8B6914" strokeWidth="0.3" />
        <path
          d="M -1.2 -0.4 L -0.8 -1.4 L -0.4 -0.6 L 0 -1.6 L 0.4 -0.6 L 0.8 -1.4 L 1.2 -0.4 Z"
          fill="#FFD700"
          stroke="#8B6914"
          strokeWidth="0.25"
          strokeLinejoin="round"
        />
      </g>
    </>
  );
}

/**
 * Bandera d'Espanya horizontal: roig (1) / groc (2) / roig (1) en alçada.
 * Cantó d'or amb les armes en versió molt simplificada (sols un escut central).
 */
function BanderaEspanya() {
  return (
    <>
      {/* Franja roja superior (1/4) */}
      <rect x="0" y="0" width="24" height="6" fill="#AA151B" />
      {/* Franja groga central (2/4) */}
      <rect x="0" y="6" width="24" height="12" fill="#F1BF00" />
      {/* Franja roja inferior (1/4) */}
      <rect x="0" y="18" width="24" height="6" fill="#AA151B" />
    </>
  );
}