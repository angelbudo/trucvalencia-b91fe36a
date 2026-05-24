// Tipus base del Truc Valencià

export type Suit = "oros" | "copes" | "espases" | "bastos";
export type Rank = 1 | 3 | 4 | 5 | 6 | 7;

export interface Card {
  suit: Suit;
  rank: Rank;
  /** ID únic per renderitzar (ex: "1-espases") */
  id: string;
}

export type PlayerId = 0 | 1 | 2 | 3;
/** Equips: 0 i 2 = Nosaltres ; 1 i 3 = Ells */
export type TeamId = "nos" | "ells";

export const teamOf = (p: PlayerId): TeamId => (p % 2 === 0 ? "nos" : "ells");
export const partnerOf = (p: PlayerId): PlayerId => ((p + 2) % 4) as PlayerId;
export const nextPlayer = (p: PlayerId): PlayerId => ((p + 1) % 4) as PlayerId;

// ---------- Estat dels cants ----------
export type TrucLevel = 0 | 2 | 3 | 4 | 24;
export type EnvitState =
  | { kind: "none" }
  | {
      kind: "pending";
      level: 2 | 4 | "falta";
      calledBy: PlayerId;
      awaitingTeam: TeamId;
      rejectedBy?: PlayerId[];
      /** Nivell d'envit ja "acceptat implícitament" abans d'aquesta pujada.
       *  S'usa per calcular els punts si el rival no vol una falta-envit:
       *  0 = falta directa (1 pt), 2 = després d'envit (2 pts), 4 = després de renvit (4 pts). */
      prevAcceptedLevel?: 0 | 2 | 4;
    }
  | { kind: "accepted"; points: number; wonBy?: TeamId }
  | { kind: "rejected"; points: number; wonBy: TeamId };

export type TrucState =
  | { kind: "none"; level: 0 }
  | { kind: "pending"; level: 2 | 3 | 4 | 24; calledBy: PlayerId; awaitingTeam: TeamId; rejectedBy?: PlayerId[] }
  | { kind: "accepted"; level: 2 | 3 | 4 | 24 }
  | { kind: "rejected"; pointsAwarded: number; wonBy: TeamId };

export interface TrickCard {
  player: PlayerId;
  card: Card;
  /** Si la carta s'ha jugat tapada (boca avall). En aquest cas no compta
   *  per a la força de la baza ni per al càlcul de l'envit del jugador. */
  covered?: boolean;
}

export interface Trick {
  cards: TrickCard[];
  winner?: PlayerId;
  parda?: boolean;
}

export type GamePhase =
  | "dealing"
  | "envit"
  | "playing"
  | "round-end"
  | "game-end";

export interface RoundState {
  hands: Record<PlayerId, Card[]>;
  mano: PlayerId;
  turn: PlayerId;
  tricks: Trick[];
  trucState: TrucState;
  deferredTruc?: { level: 2 | 3 | 4 | 24; calledBy: PlayerId; awaitingTeam: TeamId };
  envitState: EnvitState;
  envitResolved: boolean;
  phase: GamePhase;
  log: GameEvent[];
  /** Si està definit, aquest jugador ha cantat envit/renvit/falta-envit
   *  com a "primer de la pareja" i queda obligat a cantar truc en quant
   *  l'envit es resolga: cap altra acció (jugar carta, cap altre crit) és
   *  legal per a ell fins que l'haja cantat. */
  chainedTrucPending?: PlayerId;
}

/** Punts dins de la cama actual per a un equip: 0..12 males + 0..12 bones. */
export interface TeamCamaScore {
  males: number;
  bones: number;
}

export interface MatchState {
  /** Punts de la cama actual, independents per equip. */
  scores: Record<TeamId, TeamCamaScore>;
  /** Cames guanyades per cada equip durant la partida. */
  camesWon: Record<TeamId, number>;
  /** Compatibilitat: cames totals jugades (= camesWon.nos + camesWon.ells). */
  cames: number;
  /** Punts per cada meitat de la cama (males = 12, bones = 12). */
  targetCama: number;
  /** Cames a guanyar per acabar la partida. */
  targetCames: number;
  round: RoundState;
  dealer: PlayerId;
  history: RoundSummary[];
  /** Si la partida s'ha guanyat per "joc fora" (tanca tota la partida). */
  jocForaWinner?: TeamId;
}

export interface RoundSummary {
  trucPoints: number;
  envitPoints: number;
  trucWinner?: TeamId;
  envitWinner?: TeamId;
  /** Nivell del cant d'envit (2 = envit, 4 = renvit, "falta" = falta envit). */
  envitLevel?: 2 | 4 | "falta";
  /** True si el rival no ha volgut l'envit. */
  envitRejected?: boolean;
  /** Nivell del cant de truc (0 = sense cant, 2/3/4/24). */
  trucLevel?: 0 | 2 | 3 | 4 | 24;
  /** True si el rival no ha volgut el truc. */
  trucRejected?: boolean;
}

export type GameEvent =
  | { type: "deal"; dealer: PlayerId }
  | { type: "play"; player: PlayerId; card: Card }
  | { type: "trick-end"; winner?: PlayerId; parda: boolean }
  | { type: "shout"; player: PlayerId; what: ShoutKind }
  | { type: "round-end"; summary: RoundSummary }
  | { type: "game-end"; winner: TeamId };

export type ShoutKind =
  | "envit" | "renvit" | "falta-envit"
  | "vull" | "no-vull"
  | "truc" | "retruc" | "quatre" | "joc-fora"
  | "passe" | "so-meues";

export type Action =
  | { type: "play-card"; cardId: string; covered?: boolean }
  | { type: "shout"; what: ShoutKind };