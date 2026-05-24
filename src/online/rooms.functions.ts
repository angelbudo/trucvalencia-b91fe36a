// Client-side wrapper for rooms server functions.
// Calls the `rooms-rpc` edge function with { fn, data } body.
import { supabase } from "@/integrations/supabase/client";
import type { PlayerId } from "@/game/types";
import type { Action } from "@/game/types";
import type { RoomFullDTO, SeatKind } from "./types";
import type { ChatPhraseId } from "@/game/phrases";
import { reportRpcError, reportRpcOk } from "./diagnostics";

function isNotImplementedError(message: string) {
  return message === "not_implemented" || message.includes("not_implemented");
}

async function rpc<T>(fn: string, data: unknown): Promise<T> {
  try {
    const { data: result, error } = await supabase.functions.invoke("rooms-rpc", {
      body: { fn, data },
    });
    if (error) {
      // Try to extract message from edge function response body
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const j = await ctx.json();
          if (j?.error) throw new Error(j.error);
        } catch (e) {
          if (e instanceof Error && e.message && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
      throw new Error(error.message || "Error de connexió");
    }
    if (result && typeof result === "object" && "error" in result && (result as any).error) {
      throw new Error((result as any).error);
    }
    reportRpcOk();
    return result as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (fn === "listMyActiveRooms" && isNotImplementedError(msg)) {
      reportRpcError(
        `rpc:${fn}`,
        "rooms-rpc desplegada todavía es la Fase 1; se omite la lista de partidas activas hasta redeploy.",
      );
      return { rooms: [] } as T;
    }
    if (fn === "listLobbyRooms" && isNotImplementedError(msg)) {
      reportRpcError(
        `rpc:${fn}`,
        "rooms-rpc desplegada todavía es la Fase 1; se muestra el lobby vacío hasta redeploy.",
      );
      return { rooms: [] } as T;
    }
    reportRpcError(`rpc:${fn}`, msg);
    throw e;
  }
}

/**
 * The original TanStack Start `serverFn` exposed handlers as
 * `someFn({ data: {...} })`. We replicate that signature here so that the
 * existing call sites do not need to change.
 */
function makeFn<I, O>(fn: string) {
  return ({ data }: { data: I }) => rpc<O>(fn, data);
}

export interface CreateRoomInput {
  hostDevice: string;
  hostName: string;
  targetCames: number;
  targetCama?: number;
  turnTimeoutSec?: number;
  initialMano: PlayerId;
  seatKinds: SeatKind[];
  hostSeat: PlayerId;
  /** Optional slug to scope the generated room code to a specific sala. */
  salaSlug?: string;
  /** Optional explicit 6-char code to use (must be free). If taken or invalid,
   *  the server falls back to generating one within `salaSlug`. */
  requestedCode?: string;
}
export const createRoom = makeFn<CreateRoomInput, { code: string; roomId: string }>("createRoom");

export interface SetRoomSettingsInput {
  roomId: string;
  deviceId: string;
  targetCames?: number;
  targetCama?: number;
  turnTimeoutSec?: number;
}
export const setRoomSettings = makeFn<SetRoomSettingsInput, { ok: true }>("setRoomSettings");

export interface JoinRoomInput {
  code: string;
  deviceId: string;
  name: string;
  preferredSeat?: PlayerId | null;
}
export const joinRoom = makeFn<JoinRoomInput, { roomId: string; code: string; seat: PlayerId }>("joinRoom");

export interface GetRoomInput {
  code: string;
  deviceId?: string | null;
}
export const getRoom = makeFn<GetRoomInput, RoomFullDTO>("getRoom");

export interface StartMatchInput {
  roomId: string;
  deviceId: string;
}
export const startMatch = makeFn<StartMatchInput, { ok: true }>("startMatch");

export interface SubmitActionInput {
  roomId: string;
  deviceId: string;
  action: Action;
}
export const submitAction = makeFn<SubmitActionInput, { ok: boolean; stale?: boolean }>("submitAction");

export interface UpdatePlayerNameInput {
  roomId: string;
  deviceId: string;
  name: string;
}
export const updatePlayerName = makeFn<UpdatePlayerNameInput, { ok: true }>("updatePlayerName");

export interface HeartbeatInput {
  roomId: string;
  deviceId: string;
}
export const heartbeat = makeFn<HeartbeatInput, { ok: true }>("heartbeat");
export const advanceBots = makeFn<HeartbeatInput, { ok: true }>("advanceBots");

export interface SetSeatKindInput {
  roomId: string;
  deviceId: string;
  seat: PlayerId;
  kind: SeatKind;
}
export const setSeatKind = makeFn<SetSeatKindInput, { ok: true }>("setSeatKind");

export interface LeaveRoomInput {
  roomId: string;
  deviceId: string;
}
export const leaveRoom = makeFn<LeaveRoomInput, { ok: true; abandoned?: boolean }>("leaveRoom");

export interface RematchStayInput {
  roomId: string;
  deviceId: string;
}
export const rematchStay = makeFn<RematchStayInput, { ok: true; status: "playing" | "lobby" }>("rematchStay");

export interface LobbyRoomDTO {
  id: string;
  code: string;
  status: "lobby" | "playing" | "finished" | "abandoned";
  targetCames: number;
  targetCama: number;
  turnTimeoutSec: number;
  seatKinds: SeatKind[];
  hostDevice: string;
  players: { seat: PlayerId; name: string; isOnline: boolean }[];
}
export const listLobbyRooms = makeFn<Record<string, never>, { rooms: LobbyRoomDTO[] }>("listLobbyRooms");

export interface SendChatPhraseInput {
  roomId: string;
  deviceId: string;
  phraseId: ChatPhraseId;
}
export const sendChatPhrase = makeFn<SendChatPhraseInput, { ok: true }>("sendChatPhrase");

export interface SendTextMessageInput {
  roomId: string;
  deviceId: string;
  text: string;
}
export const sendTextMessage = makeFn<SendTextMessageInput, { ok: true }>("sendTextMessage");

export interface FlagPlayerInChatInput {
  roomId: string;
  deviceId: string;
  targetSeat: PlayerId;
  reason?: string | null;
  messageId?: number | null;
  messageText?: string | null;
}
export interface FlagPlayerInChatResult {
  ok: true;
  expiresAt: string;
  muteMinutes: number;
  reporterCount: number;
}
export const flagPlayerInChat = makeFn<FlagPlayerInChatInput, FlagPlayerInChatResult>(
  "flagPlayerInChat",
);

export type ChatFlagStatus = "pending" | "approved" | "dismissed";

export interface AdminChatFlagDTO {
  id: number;
  roomId: string;
  roomCode: string;
  targetSeat: PlayerId;
  targetName: string;
  targetDeviceId: string;
  reporterDeviceId: string;
  reporterName: string;
  reason: string | null;
  messageId: number | null;
  messageText: string | null;
  status: ChatFlagStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface AdminListChatFlagsInput {
  password: string;
  status?: ChatFlagStatus | "all";
}
export const adminListChatFlags = makeFn<
  AdminListChatFlagsInput,
  { ok: true; flags: AdminChatFlagDTO[] }
>("adminListChatFlags");

export interface AdminDecideChatFlagInput {
  password: string;
  flagId: number;
  decision: ChatFlagStatus;
  moderatorTag?: string;
  /** Optional moderator note recorded in the audit log (max 500 chars). */
  note?: string;
}
export const adminDecideChatFlag = makeFn<
  AdminDecideChatFlagInput,
  { ok: true; flag: unknown; auditError: string | null }
>("adminDecideChatFlag");

export interface AdminChatFlagAuditEntryDTO {
  id: number;
  flagId: number;
  roomId: string;
  targetSeat: number;
  targetDeviceId: string;
  reporterDeviceId: string;
  messageId: number | null;
  messageText: string | null;
  reason: string | null;
  decision: ChatFlagStatus;
  moderatorTag: string;
  flagCreatedAt: string;
  flagExpiresAt: string;
  decidedAt: string;
}
export interface AdminListChatFlagAuditInput {
  password: string;
  flagId?: number;
  roomId?: string;
  limit?: number;
}
export const adminListChatFlagAudit = makeFn<
  AdminListChatFlagAuditInput,
  { ok: true; entries: AdminChatFlagAuditEntryDTO[] }
>("adminListChatFlagAudit");

export interface AdminCloseRoomInput {
  roomId: string;
  password: string;
}
export const adminCloseRoom = makeFn<AdminCloseRoomInput, { ok: true }>("adminCloseRoom");

export interface MyActiveRoomDTO {
  id: string;
  code: string;
  status: "playing";
  targetCames: number;
  updatedAt: string;
  mySeat: PlayerId | null;
}
export const listMyActiveRooms = makeFn<{ deviceId: string }, { rooms: MyActiveRoomDTO[] }>(
  "listMyActiveRooms",
);

export interface SetPausedInput {
  roomId: string;
  deviceId: string;
  paused: boolean;
}
export const setPaused = makeFn<SetPausedInput, { ok: true; paused: boolean }>("setPaused");

export type ProposalKind = "pause" | "restart" | "resume";
export interface PendingProposal {
  kind: ProposalKind;
  proposerSeat: PlayerId;
  proposerName: string;
  createdAt: string;
  expiresAt: string;
  votes: Record<string, "accepted" | "rejected" | "pending">;
}
export interface ProposeActionInput {
  roomId: string;
  deviceId: string;
  kind: ProposalKind;
}
export const proposeAction = makeFn<
  ProposeActionInput,
  { ok: true; proposal?: PendingProposal }
>("proposeAction");

export interface RespondProposalInput {
  roomId: string;
  deviceId: string;
  accept: boolean;
}
export const respondProposal = makeFn<
  RespondProposalInput,
  { ok: true; status: "executed" | "rejected" | "pending"; proposal?: PendingProposal }
>("respondProposal");

export interface CancelProposalInput {
  roomId: string;
}
export const cancelProposal = makeFn<CancelProposalInput, { ok: true }>("cancelProposal");