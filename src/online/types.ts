import type { MatchState, PlayerId } from "@/game/types";

export type SeatKind = "human" | "bot" | "empty";

export type ProposalKind = "pause" | "restart" | "resume";

export interface PendingProposalDTO {
  kind: ProposalKind;
  proposerSeat: PlayerId;
  proposerName: string;
  createdAt: string;
  expiresAt: string;
  votes: Record<string, "accepted" | "rejected" | "pending">;
}

export interface RoomDTO {
  id: string;
  code: string;
  status: "lobby" | "playing" | "finished" | "abandoned";
  targetCames: number;
  /** Punts per cama (9 o 12). */
  targetCama: number;
  /** Temps màxim per torn en segons. */
  turnTimeoutSec: number;
  initialMano: PlayerId;
  seatKinds: SeatKind[];
  hostDevice: string;
  /** MatchState amb les mans dels altres jugadors ocultades. */
  matchState: MatchState | null;
  /** Timestamp ISO del moment en què el servidor va anclar el torn actual. */
  turnStartedAt: string | null;
  /** Si no és nul, la partida està pausada per a tots els jugadors. */
  pausedAt: string | null;
  /** Proposta col·lectiva pendent (pausa/reiniciar). */
  pendingProposal: PendingProposalDTO | null;
}

export interface RoomPlayerDTO {
  seat: PlayerId;
  name: string;
  deviceId: string;
  isOnline: boolean;
  /** Timestamp ISO de l'últim heartbeat del jugador. Permet derivar
   *  un estat de presència més fi (en línia / inactiu / desconnectat). */
  lastSeen: string;
}

export interface RoomFullDTO {
  room: RoomDTO;
  players: RoomPlayerDTO[];
  /** Seient assignat al device_id que ha consultat (si en té). */
  mySeat: PlayerId | null;
}