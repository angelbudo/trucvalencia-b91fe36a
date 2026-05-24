// Edge Function: rooms-rpc
// Fase 5 — Bots humanizados (3-tick consult + 7s freno 2º de pareja 1ª baza)
//          + Sistema de votación democrática (pausa/reanudar/nova partida)
//
// Despliegue:  supabase functions deploy rooms-rpc --no-verify-jwt
//
// Estructura:
//   supabase/functions/rooms-rpc/
//     index.ts        <- este archivo
//     _game/          <- copia espejo de src/game/
//
// Secrets requeridos:
//   ADMIN_PASSWORD
// Inyectados por Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

import { applyAction, legalActions, startNextRound } from "./_game/engine.ts";
import { botDecide } from "./_game/bot.ts";
import {
  shouldConsultPartner,
  pickQuestion,
  partnerAnswerFor,
  adviceFromAnswer,
  type PartnerAdvice,
} from "./_game/botConsult.ts";
import { partnerOf } from "./_game/types.ts";
import type { Action, MatchState, PlayerId } from "./_game/types.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const PRESENCE_ONLINE_MS = 35_000;

// Timings — mirroran src/game/chatTimings.ts
const CONSULT_QUESTION_DELAY_MS = 1000;
const CONSULT_ANSWER_DELAY_MS = 1300;
const CONSULT_DECIDE_DELAY_MS = 1500;
const SECOND_PLAYER_WAIT_MS = 7000;
const BOT_DELAY_MS = 1000;
const ROUND_END_DELAY_MS = 2000;

// Votaciones
const PROPOSAL_TTL_MS = 60_000;

function nowIso() {
  return new Date().toISOString();
}
function nowMs() {
  return Date.now();
}

type SeatKind = "human" | "bot" | "empty";

interface RoomRow {
  id: string;
  code: string;
  sala_slug: string | null;
  status: "lobby" | "playing" | "finished" | "abandoned";
  target_cames: number;
  target_cama: number;
  turn_timeout_sec: number;
  initial_mano: number;
  seat_kinds: SeatKind[];
  host_device: string;
  match_state: unknown;
  turn_started_at: string | null;
  paused_at: string | null;
  pending_proposal: unknown;
  created_at: string;
  updated_at: string;
}

interface PlayerRow {
  room_id: string;
  seat: number;
  device_id: string;
  name: string;
  last_seen: string;
}

function rowToRoomDTO(r: RoomRow) {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    targetCames: r.target_cames,
    targetCama: r.target_cama,
    turnTimeoutSec: r.turn_timeout_sec,
    initialMano: r.initial_mano,
    seatKinds: r.seat_kinds,
    hostDevice: r.host_device,
    matchState: r.match_state ?? null,
    turnStartedAt: r.turn_started_at,
    pausedAt: r.paused_at,
    pendingProposal: r.pending_proposal ?? null,
  };
}

function playerRowToDTO(p: PlayerRow) {
  const ageMs = Date.now() - new Date(p.last_seen).getTime();
  return {
    seat: p.seat,
    name: p.name,
    deviceId: p.device_id,
    isOnline: ageMs <= PRESENCE_ONLINE_MS,
    lastSeen: p.last_seen,
  };
}

async function fetchRoomById(roomId: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoomRow | null) ?? null;
}

async function fetchRoomByCode(code: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoomRow | null) ?? null;
}

async function fetchPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("room_players").select("*").eq("room_id", roomId)
    .order("seat", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PlayerRow[];
}

function requireAdmin(password: unknown) {
  const expected = Deno.env.get("ADMIN_PASSWORD");
  if (!expected) throw new Error("admin_not_configured");
  if (typeof password !== "string" || password !== expected) {
    throw new Error("forbidden");
  }
}

// ---------------------------------------------------------------------------
// createRoom / joinRoom / getRoom / lobby / heartbeat / leave / settings
// ---------------------------------------------------------------------------

const CreateRoomSchema = z.object({
  hostDevice: z.string().min(1),
  hostName: z.string().min(1).max(40),
  targetCames: z.number().int().min(1).max(10),
  targetCama: z.number().int().refine((n) => n === 9 || n === 12).optional(),
  turnTimeoutSec: z.number().int().min(5).max(180).optional(),
  initialMano: z.number().int().min(0).max(3),
  seatKinds: z.array(z.enum(["human", "bot", "empty"])).length(4),
  hostSeat: z.number().int().min(0).max(3),
  salaSlug: z.string().min(1).max(40).optional(),
  requestedCode: z.string().min(6).max(6).optional(),
});

async function createRoom(input: z.infer<typeof CreateRoomSchema>) {
  const seatKinds = [...input.seatKinds];
  if (seatKinds[input.hostSeat] !== "human") seatKinds[input.hostSeat] = "human";
  const code = input.requestedCode?.toUpperCase();
  if (!code) throw new Error("missing_requested_code");

  const exists = await fetchRoomByCode(code);
  if (exists) {
    await supabase.from("room_players").delete().eq("room_id", exists.id);
    const { error: delErr } = await supabase.from("rooms").delete().eq("id", exists.id);
    if (delErr) throw new Error(delErr.message);
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      code,
      sala_slug: input.salaSlug ?? null,
      status: "lobby",
      target_cames: input.targetCames,
      target_cama: input.targetCama ?? 12,
      turn_timeout_sec: input.turnTimeoutSec ?? 30,
      initial_mano: input.initialMano,
      seat_kinds: seatKinds,
      host_device: input.hostDevice,
    })
    .select("id, code").single();
  if (error) throw new Error(error.message);

  const { error: pErr } = await supabase.from("room_players").insert({
    room_id: room.id, seat: input.hostSeat,
    device_id: input.hostDevice, name: input.hostName, last_seen: nowIso(),
  });
  if (pErr) throw new Error(pErr.message);
  return { code: room.code as string, roomId: room.id as string };
}

const JoinRoomSchema = z.object({
  code: z.string().min(6).max(6),
  deviceId: z.string().min(1),
  name: z.string().min(1).max(40),
  preferredSeat: z.number().int().min(0).max(3).nullable().optional(),
});

async function joinRoom(input: z.infer<typeof JoinRoomSchema>) {
  const code = input.code.toUpperCase();
  const room = await fetchRoomByCode(code);
  if (!room) throw new Error("room_not_found");
  if (room.status === "finished" || room.status === "abandoned") throw new Error("room_closed");

  const players = await fetchPlayers(room.id);
  const mine = players.find((p) => p.device_id === input.deviceId);
  if (mine) {
    await supabase.from("room_players")
      .update({ name: input.name, last_seen: nowIso() })
      .eq("room_id", room.id).eq("seat", mine.seat);
    return { roomId: room.id, code: room.code, seat: mine.seat };
  }

  const occupied = new Set(players.map((p) => p.seat));
  const seatKinds = room.seat_kinds;
  let seat: number | null = null;
  if (input.preferredSeat != null && !occupied.has(input.preferredSeat) && seatKinds[input.preferredSeat] !== "bot") {
    seat = input.preferredSeat;
  } else {
    for (let i = 0; i < 4; i++) {
      if (occupied.has(i) || seatKinds[i] === "bot") continue;
      seat = i; break;
    }
  }
  if (seat == null) throw new Error("room_full");

  const { error } = await supabase.from("room_players").insert({
    room_id: room.id, seat, device_id: input.deviceId, name: input.name, last_seen: nowIso(),
  });
  if (error) throw new Error(error.message);
  if (seatKinds[seat] === "empty") {
    const next = [...seatKinds]; next[seat] = "human";
    await supabase.from("rooms").update({ seat_kinds: next }).eq("id", room.id);
  }
  return { roomId: room.id, code: room.code, seat };
}

const GetRoomSchema = z.object({
  code: z.string().min(6).max(6),
  deviceId: z.string().min(1).nullable().optional(),
});

async function getRoom(input: z.infer<typeof GetRoomSchema>) {
  const room = await fetchRoomByCode(input.code.toUpperCase());
  if (!room) throw new Error("room_not_found");
  const players = await fetchPlayers(room.id);
  const mySeat = input.deviceId
    ? players.find((p) => p.device_id === input.deviceId)?.seat ?? null
    : null;
  return { room: rowToRoomDTO(room), players: players.map(playerRowToDTO), mySeat };
}

async function listLobbyRooms(_input: unknown) {
  const { data, error } = await supabase.from("rooms").select("*")
    .eq("status", "lobby").order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  const rooms = (data ?? []) as RoomRow[];
  if (rooms.length === 0) return { rooms: [] };
  const ids = rooms.map((r) => r.id);
  const { data: pdata, error: pErr } = await supabase.from("room_players").select("*").in("room_id", ids);
  if (pErr) throw new Error(pErr.message);
  const byRoom = new Map<string, PlayerRow[]>();
  for (const p of (pdata ?? []) as PlayerRow[]) {
    const list = byRoom.get(p.room_id) ?? [];
    list.push(p); byRoom.set(p.room_id, list);
  }
  return {
    rooms: rooms.map((r) => ({
      id: r.id, code: r.code, status: r.status,
      targetCames: r.target_cames, targetCama: r.target_cama,
      turnTimeoutSec: r.turn_timeout_sec, seatKinds: r.seat_kinds, hostDevice: r.host_device,
      players: (byRoom.get(r.id) ?? []).map((p) => ({
        seat: p.seat, name: p.name,
        isOnline: Date.now() - new Date(p.last_seen).getTime() <= PRESENCE_ONLINE_MS,
      })),
    })),
  };
}

const ListMyActiveSchema = z.object({ deviceId: z.string().min(1) });
async function listMyActiveRooms(input: z.infer<typeof ListMyActiveSchema>) {
  const { data: prows, error } = await supabase
    .from("room_players").select("room_id, seat").eq("device_id", input.deviceId);
  if (error) throw new Error(error.message);
  const ids = (prows ?? []).map((p: any) => p.room_id);
  if (ids.length === 0) return { rooms: [] };
  const { data: rrows, error: rErr } = await supabase
    .from("rooms").select("id, code, status, target_cames, updated_at")
    .in("id", ids).eq("status", "playing");
  if (rErr) throw new Error(rErr.message);
  const seatByRoom = new Map<string, number>();
  for (const p of (prows ?? []) as { room_id: string; seat: number }[]) {
    seatByRoom.set(p.room_id, p.seat);
  }
  return {
    rooms: (rrows ?? []).map((r: any) => ({
      id: r.id, code: r.code, status: r.status,
      targetCames: r.target_cames, updatedAt: r.updated_at,
      mySeat: seatByRoom.get(r.id) ?? null,
    })),
  };
}

const HeartbeatSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
});

async function heartbeat(input: z.infer<typeof HeartbeatSchema>) {
  const { error } = await supabase.from("room_players")
    .update({ last_seen: nowIso() })
    .eq("room_id", input.roomId).eq("device_id", input.deviceId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function leaveRoom(input: z.infer<typeof HeartbeatSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) return { ok: true as const, abandoned: false };
  await supabase.from("room_players").delete()
    .eq("room_id", room.id).eq("device_id", input.deviceId);
  const remaining = await fetchPlayers(room.id);
  if (remaining.length === 0) {
    await supabase.from("rooms").delete().eq("id", room.id);
    return { ok: true as const, abandoned: true };
  }
  if (room.host_device === input.deviceId) {
    const newHost = remaining[0]!;
    await supabase.from("rooms").update({ host_device: newHost.device_id }).eq("id", room.id);
  }
  return { ok: true as const, abandoned: false };
}

const SetSettingsSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  targetCames: z.number().int().min(1).max(10).optional(),
  targetCama: z.number().int().refine((n) => n === 9 || n === 12).optional(),
  turnTimeoutSec: z.number().int().min(5).max(180).optional(),
});

async function setRoomSettings(input: z.infer<typeof SetSettingsSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (room.host_device !== input.deviceId) throw new Error("forbidden");
  if (room.status !== "lobby") throw new Error("not_in_lobby");
  const patch: Record<string, unknown> = {};
  if (input.targetCames != null) patch.target_cames = input.targetCames;
  if (input.targetCama != null) patch.target_cama = input.targetCama;
  if (input.turnTimeoutSec != null) patch.turn_timeout_sec = input.turnTimeoutSec;
  if (Object.keys(patch).length === 0) return { ok: true as const };
  const { error } = await supabase.from("rooms").update(patch).eq("id", room.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const SetSeatKindSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  seat: z.number().int().min(0).max(3),
  kind: z.enum(["human", "bot", "empty"]),
});

async function setSeatKind(input: z.infer<typeof SetSeatKindSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (room.host_device !== input.deviceId) throw new Error("forbidden");
  if (room.status !== "lobby") throw new Error("not_in_lobby");
  const players = await fetchPlayers(room.id);
  const occupied = players.find((p) => p.seat === input.seat);
  if (occupied && input.kind !== "human") throw new Error("seat_occupied_by_human");
  const next = [...room.seat_kinds]; next[input.seat] = input.kind;
  const { error } = await supabase.from("rooms").update({ seat_kinds: next }).eq("id", room.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const UpdateNameSchema = z.object({
  roomId: z.string().uuid(), deviceId: z.string().min(1), name: z.string().min(1).max(40),
});
async function updatePlayerName(input: z.infer<typeof UpdateNameSchema>) {
  const { error } = await supabase.from("room_players")
    .update({ name: input.name })
    .eq("room_id", input.roomId).eq("device_id", input.deviceId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const AdminCloseSchema = z.object({ roomId: z.string().uuid(), password: z.string().min(1) });
async function adminCloseRoom(input: z.infer<typeof AdminCloseSchema>) {
  requireAdmin(input.password);
  await supabase.from("rooms").delete().eq("id", input.roomId);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// startMatch
// ---------------------------------------------------------------------------

type Suit = "oros" | "copes" | "espases" | "bastos";
type Rank = 1 | 3 | 4 | 5 | 6 | 7;
interface Card { suit: Suit; rank: Rank; id: string }
const ENGINE_SUITS: Suit[] = ["oros", "copes", "espases", "bastos"];
const ENGINE_RANKS: Rank[] = [1, 3, 4, 5, 6, 7];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ENGINE_SUITS) {
    for (const rank of ENGINE_RANKS) {
      if (rank === 1 && suit !== "espases" && suit !== "bastos") continue;
      deck.push({ suit, rank, id: `${rank}-${suit}` });
    }
  }
  return deck;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildFreshMatchState(
  initialMano: 0 | 1 | 2 | 3,
  targetCama: number,
  targetCames: number,
): MatchState {
  const deck = shuffle(buildDeck());
  const hands: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  const mano = initialMano;
  const dealer = ((mano + 3) % 4) as 0 | 1 | 2 | 3;
  let p = mano;
  for (let i = 0; i < 12; i++) {
    hands[p]!.push(deck[i]!);
    p = ((p + 1) % 4) as 0 | 1 | 2 | 3;
  }
  return {
    scores: { nos: { males: 0, bones: 0 }, ells: { males: 0, bones: 0 } },
    camesWon: { nos: 0, ells: 0 },
    cames: 0,
    targetCama,
    targetCames,
    dealer,
    history: [],
    round: {
      hands, mano, turn: mano,
      tricks: [{ cards: [] }],
      trucState: { kind: "none", level: 0 },
      envitState: { kind: "none" },
      envitResolved: false,
      phase: "envit",
      log: [{ type: "deal", dealer }],
    },
  } as unknown as MatchState;
}

const StartMatchSchema = z.object({
  roomId: z.string().uuid(), deviceId: z.string().min(1),
});

async function startMatch(input: z.infer<typeof StartMatchSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (room.host_device !== input.deviceId) throw new Error("forbidden");
  if (room.status !== "lobby") throw new Error("not_in_lobby");

  const players = await fetchPlayers(room.id);
  const occupied = new Set(players.map((p) => p.seat));
  for (let i = 0; i < 4; i++) {
    if (room.seat_kinds[i] === "human" && !occupied.has(i)) throw new Error("seat_empty:" + i);
    if (room.seat_kinds[i] === "empty") throw new Error("seat_empty:" + i);
  }

  const matchState = buildFreshMatchState(
    room.initial_mano as 0 | 1 | 2 | 3,
    room.target_cama,
    room.target_cames,
  );
  const { error } = await supabase.from("rooms").update({
    status: "playing", match_state: matchState,
    turn_started_at: nowIso(), paused_at: null, pending_proposal: null,
  }).eq("id", room.id);
  if (error) throw new Error(error.message);
  return { ok: true as const, roomId: room.id, mano: room.initial_mano, turn: room.initial_mano };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const SendChatPhraseSchema = z.object({
  roomId: z.string().uuid(), deviceId: z.string().min(1), phraseId: z.string().min(1).max(80),
});

async function findPlayerSeat(roomId: string, deviceId: string): Promise<number> {
  const { data, error } = await supabase.from("room_players").select("seat")
    .eq("room_id", roomId).eq("device_id", deviceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_in_room");
  return data.seat as number;
}

async function sendChatPhrase(input: z.infer<typeof SendChatPhraseSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  const seat = await findPlayerSeat(input.roomId, input.deviceId);
  const { error } = await supabase.from("room_chat").insert({
    room_id: input.roomId, seat, phrase_id: input.phraseId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const SendTextMessageSchema = z.object({
  roomId: z.string().uuid(), deviceId: z.string().min(1), text: z.string().min(1).max(240),
});
async function sendTextMessage(input: z.infer<typeof SendTextMessageSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  const seat = await findPlayerSeat(input.roomId, input.deviceId);
  const text = input.text.trim();
  if (!text) throw new Error("empty_text");
  const { error } = await supabase.from("room_text_chat").insert({
    room_id: input.roomId, seat, device_id: input.deviceId, text,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// ===========================================================================
// MOTOR DE BOTS — humanizado (3 ticks por consulta + freno 1ª baza)
// ===========================================================================

/**
 * Replica `currentActor` del frontend. Prioriza pendientes de envit/truc
 * por equipo, y cae al `round.turn` para la fase de play.
 */
function currentActor(state: MatchState): PlayerId | null {
  const r = state.round;
  if (r.phase === "game-end" || r.phase === "round-end") return null;
  for (const p of [0, 1, 2, 3] as PlayerId[]) {
    if (legalActions(state, p).length === 0) continue;
    const team = p % 2 === 0 ? "nos" : "ells";
    if (
      (r.envitState.kind === "pending" && r.envitState.awaitingTeam === team) ||
      (r.trucState.kind === "pending" && r.trucState.awaitingTeam === team) ||
      r.turn === p
    ) {
      return p;
    }
  }
  return null;
}

/**
 * Side-channel del servidor en `match_state._srv`. Contiene:
 *   - nextBotAt: timestamp ms hasta el cual NO se debe actuar (espera humana)
 *   - consult: estado de la consulta bot↔bot en curso (3 fases)
 *   - waitKey: clave del freno de 7s ya consumido (para no repetirlo)
 */
type ConsultPhase = "question-shown" | "answer-shown";

interface ServerConsult {
  bot: PlayerId;
  partner: PlayerId;
  question: string;
  answer: string;
  advice: PartnerAdvice;
  phase: ConsultPhase;
  key: string;
}

interface ServerSide {
  nextBotAt?: number;
  consult?: ServerConsult;
  waitKey?: string;
}

function getSrv(state: MatchState): ServerSide {
  return ((state as any)._srv as ServerSide | undefined) ?? {};
}
function withSrv(state: MatchState, srv: ServerSide | null): MatchState {
  const copy: any = { ...state };
  if (srv && Object.keys(srv).length > 0) copy._srv = srv;
  else delete copy._srv;
  return copy as MatchState;
}

function actorKey(state: MatchState, bot: PlayerId): string {
  const r = state.round;
  const trickIdx = r.tricks.length - 1;
  const playedInTrick = r.tricks[trickIdx]?.cards.length ?? 0;
  return `${state.history.length}-${state.cames}-${r.mano}-${trickIdx}-${playedInTrick}-${bot}`;
}

/**
 * ¿Es este bot el "segundo de la pareja" en la 1ª baza, sin envit en
 * curso ni resuelto? En ese caso debe esperar SECOND_PLAYER_WAIT_MS por si
 * su compañero le pide envit.
 */
function shouldApplyFirstTrickWait(state: MatchState, actor: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "playing") return false;
  if (r.tricks.length !== 1) return false;
  if (r.envitState.kind === "pending") return false;
  if (r.envitState.kind === "accepted" || r.envitState.kind === "rejected") return false;
  if (r.trucState.kind === "pending") return false;
  const playedInTrick = r.tricks[0]?.cards.length ?? 0;
  // "Último de la pareja" = el compañero ya tiró carta en esta baza.
  const partner = partnerOf(actor);
  const partnerPlayed = (r.tricks[0]?.cards ?? []).some(
    (tc: any) => tc.player === partner,
  );
  if (!partnerPlayed) return false;
  // Asegurar que el bot todavía no ha tirado en esta baza.
  const meAlreadyPlayed = (r.tricks[0]?.cards ?? []).some(
    (tc: any) => tc.player === actor,
  );
  if (meAlreadyPlayed) return false;
  // Sólo cuando el bot es 2º o 4º en orden de tirada (último de pareja).
  // Heurística: si su compañero ya jugó y él aún no, es último de pareja.
  return playedInTrick >= 1;
}

interface BotStepResult {
  state: MatchState;
  chats: { seat: PlayerId; phraseId: string }[];
  changed: boolean;
  /** Cuándo se debería volver a llamar (ms desde ahora). */
  nextInMs?: number;
}

/**
 * Aplica COMO MUCHO un paso humanizado del motor de bots.
 * Reglas:
 *  - phase "game-end" => nada.
 *  - phase "round-end" => esperar ROUND_END_DELAY_MS y arrancar siguiente.
 *  - Si nextBotAt > now => esperar (no actuar).
 *  - Actor humano => nada.
 *  - Consulta en curso:
 *      · phase "question-shown": ahora se emite la RESPUESTA y
 *        se programa la DECISIÓN para dentro de CONSULT_DECIDE_DELAY_MS.
 *      · phase "answer-shown": se aplica la decisión cacheada y se limpia.
 *  - Actor bot sin consulta:
 *      · Si procede consulta: emite PREGUNTA y programa la respuesta.
 *      · Si es 2º de pareja en 1ª baza sin envit: programa espera 7s.
 *      · Si no: decisión directa tras BOT_DELAY_MS.
 */
function stepOneBotAction(state: MatchState, seatKinds: SeatKind[]): BotStepResult {
  if (state.round.phase === "game-end") {
    return { state, chats: [], changed: false };
  }
  const srv = { ...getSrv(state) };
  const t = nowMs();

  if (state.round.phase === "round-end") {
    if (srv.nextBotAt && srv.nextBotAt > t) {
      return { state, chats: [], changed: false, nextInMs: srv.nextBotAt - t };
    }
    if (!srv.nextBotAt) {
      // Primera vez que vemos round-end: programar arranque.
      const next = withSrv(state, { ...srv, nextBotAt: t + ROUND_END_DELAY_MS });
      return { state: next, chats: [], changed: true, nextInMs: ROUND_END_DELAY_MS };
    }
    const nextState = startNextRound(state);
    return {
      state: withSrv(nextState, { nextBotAt: nowMs() + BOT_DELAY_MS }),
      chats: [],
      changed: true,
      nextInMs: BOT_DELAY_MS,
    };
  }

  // Freno de humanización
  if (srv.nextBotAt && srv.nextBotAt > t) {
    return { state, chats: [], changed: false, nextInMs: srv.nextBotAt - t };
  }

  const actor = currentActor(state);
  if (actor == null) return { state, chats: [], changed: false };
  if (seatKinds[actor] !== "bot") {
    // Es humano: limpiamos cualquier consulta cacheada y esperas.
    if (srv.consult || srv.nextBotAt) {
      return { state: withSrv(state, {}), chats: [], changed: true };
    }
    return { state, chats: [], changed: false };
  }

  // --- CONSULTA EN CURSO ---
  if (srv.consult) {
    const c = srv.consult;
    const stillValid =
      c.bot === actor && c.key === actorKey(state, actor);
    if (!stillValid) {
      // Estado avanzó: descartar consulta y continuar.
      srv.consult = undefined;
    } else if (c.phase === "question-shown") {
      // TICK 2: emitir respuesta y programar decisión.
      const nextSrv: ServerSide = {
        ...srv,
        consult: { ...c, phase: "answer-shown" },
        nextBotAt: t + CONSULT_DECIDE_DELAY_MS,
      };
      return {
        state: withSrv(state, nextSrv),
        chats: [{ seat: c.partner, phraseId: c.answer }],
        changed: true,
        nextInMs: CONSULT_DECIDE_DELAY_MS,
      };
    } else if (c.phase === "answer-shown") {
      // TICK 3: aplicar decisión con el advice cacheado.
      const decision = botDecide(state, actor, c.advice);
      if (!decision) {
        return {
          state: withSrv(state, { nextBotAt: t + BOT_DELAY_MS }),
          chats: [],
          changed: true,
          nextInMs: BOT_DELAY_MS,
        };
      }
      let next = applyAction(state, actor, decision as Action);
      next = withSrv(next, { nextBotAt: nowMs() + BOT_DELAY_MS });
      return { state: next, chats: [], changed: true, nextInMs: BOT_DELAY_MS };
    }
  }

  // --- SIN CONSULTA: ¿procede iniciarla? ---
  const r = state.round;
  const partner = partnerOf(actor);
  const consultable =
    r.phase === "playing" &&
    r.turn === actor &&
    r.trucState.kind !== "pending" &&
    r.envitState.kind !== "pending" &&
    seatKinds[partner] === "bot";

  if (consultable && shouldConsultPartner(state, actor)) {
    const question = pickQuestion(state, actor);
    if (question) {
      const answer = partnerAnswerFor(state, partner, question);
      const advice = adviceFromAnswer(answer, question);
      const mark: ServerConsult = {
        bot: actor,
        partner,
        question,
        answer,
        advice,
        phase: "question-shown",
        key: actorKey(state, actor),
      };
      // TICK 1: emitir pregunta y programar respuesta.
      const next = withSrv(state, {
        consult: mark,
        nextBotAt: t + CONSULT_ANSWER_DELAY_MS,
        waitKey: srv.waitKey,
      });
      return {
        state: next,
        chats: [{ seat: actor, phraseId: question }],
        changed: true,
        nextInMs: CONSULT_ANSWER_DELAY_MS,
      };
    }
  }

  // --- Freno 7s: 2º de pareja, 1ª baza, sin envit ---
  if (shouldApplyFirstTrickWait(state, actor)) {
    const wKey = actorKey(state, actor);
    if (srv.waitKey !== wKey) {
      const next = withSrv(state, {
        ...srv,
        nextBotAt: t + SECOND_PLAYER_WAIT_MS,
        waitKey: wKey,
      });
      return {
        state: next,
        chats: [],
        changed: true,
        nextInMs: SECOND_PLAYER_WAIT_MS,
      };
    }
  }

  // --- Decisión directa ---
  const decision = botDecide(state, actor);
  if (!decision) return { state, chats: [], changed: false };
  const applied = applyAction(state, actor, decision as Action);
  const next = withSrv(applied, { nextBotAt: nowMs() + BOT_DELAY_MS });
  return { state: next, chats: [], changed: true, nextInMs: BOT_DELAY_MS };
}

async function persistBotStep(room: RoomRow, result: BotStepResult): Promise<void> {
  if (!result.changed) return;
  if (result.chats.length > 0) {
    const rows = result.chats.map((c) => ({
      room_id: room.id,
      seat: c.seat,
      phrase_id: c.phraseId,
    }));
    const { error: chatErr } = await supabase.from("room_chat").insert(rows);
    if (chatErr) throw new Error(chatErr.message);
  }
  const patch: Record<string, unknown> = {
    match_state: result.state,
    turn_started_at: nowIso(),
  };
  if (result.state.round.phase === "game-end") patch.status = "finished";
  const { error } = await supabase.from("rooms").update(patch).eq("id", room.id);
  if (error) throw new Error(error.message);
}

const SubmitActionSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  action: z.object({
    type: z.enum(["play-card", "shout"]),
    cardId: z.string().optional(),
    covered: z.boolean().optional(),
    what: z.string().optional(),
  }).passthrough(),
});

async function submitAction(input: z.infer<typeof SubmitActionSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (room.status !== "playing") throw new Error("not_playing");
  if (!room.match_state) throw new Error("no_match_state");
  if (room.paused_at) throw new Error("paused");

  const seat = await findPlayerSeat(input.roomId, input.deviceId);
  const player = seat as PlayerId;

  let state = room.match_state as MatchState;
  const actor = currentActor(state);
  if (actor == null) return { ok: false, stale: true } as const;
  if (actor !== player) return { ok: false, stale: true } as const;

  const legals = legalActions(state, player);
  const action = input.action as unknown as Action;
  const matches = legals.some((a) => {
    if (a.type !== action.type) return false;
    if (a.type === "play-card") return (a as any).cardId === (action as any).cardId;
    return (a as any).what === (action as any).what;
  });
  if (!matches) throw new Error("illegal_action");

  state = applyAction(state, player, action);
  // Acción humana: invalida consulta cacheada Y la espera de 7s
  // (porque podría haber dicho "envida" justo ahora).
  state = withSrv(state, { nextBotAt: nowMs() + BOT_DELAY_MS });

  const patch: Record<string, unknown> = {
    match_state: state, turn_started_at: nowIso(),
  };
  if (state.round.phase === "game-end") patch.status = "finished";

  const { error } = await supabase.from("rooms").update(patch).eq("id", room.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function advanceBots(input: z.infer<typeof HeartbeatSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (room.status !== "playing") return { ok: true as const };
  if (!room.match_state) return { ok: true as const };
  if (room.paused_at) return { ok: true as const };

  const state = room.match_state as MatchState;
  const result = stepOneBotAction(state, room.seat_kinds);
  await persistBotStep(room, result);
  return { ok: true as const };
}

// ===========================================================================
// VOTACIÓN DEMOCRÁTICA — pause / resume / restart
// ===========================================================================

type ProposalKind = "pause" | "restart" | "resume";
type VoteValue = "accepted" | "rejected" | "pending";

interface PendingProposal {
  kind: ProposalKind;
  proposerSeat: PlayerId;
  proposerName: string;
  createdAt: string;
  expiresAt: string;
  votes: Record<string, VoteValue>; // key = deviceId
}

async function humanDevicesFor(room: RoomRow): Promise<{ deviceId: string; seat: PlayerId; name: string }[]> {
  const players = await fetchPlayers(room.id);
  return players
    .filter((p) => room.seat_kinds[p.seat] === "human")
    .map((p) => ({ deviceId: p.device_id, seat: p.seat as PlayerId, name: p.name }));
}

function proposalExpired(prop: PendingProposal): boolean {
  return new Date(prop.expiresAt).getTime() < nowMs();
}

function proposalResolved(prop: PendingProposal): "executed" | "rejected" | "pending" {
  const votes = Object.values(prop.votes);
  if (votes.some((v) => v === "rejected")) return "rejected";
  if (votes.every((v) => v === "accepted")) return "executed";
  return "pending";
}

async function executeProposal(room: RoomRow, kind: ProposalKind): Promise<void> {
  if (kind === "pause") {
    await supabase.from("rooms").update({
      paused_at: nowIso(),
      pending_proposal: null,
    }).eq("id", room.id);
  } else if (kind === "resume") {
    await supabase.from("rooms").update({
      paused_at: null,
      pending_proposal: null,
      turn_started_at: nowIso(),
    }).eq("id", room.id);
  } else if (kind === "restart") {
    const fresh = buildFreshMatchState(
      room.initial_mano as 0 | 1 | 2 | 3,
      room.target_cama,
      room.target_cames,
    );
    await supabase.from("rooms").update({
      match_state: fresh,
      paused_at: null,
      pending_proposal: null,
      turn_started_at: nowIso(),
      status: "playing",
    }).eq("id", room.id);
  }
}

const SetPausedSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  paused: z.boolean(),
});

async function setPaused(input: z.infer<typeof SetPausedSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  // En modo solo bots+1 humano la pausa es inmediata.
  const humans = await humanDevicesFor(room);
  if (humans.length <= 1) {
    await supabase.from("rooms").update({
      paused_at: input.paused ? nowIso() : null,
      turn_started_at: input.paused ? room.turn_started_at : nowIso(),
    }).eq("id", room.id);
    return { ok: true as const, paused: input.paused };
  }
  // Con varios humanos requiere proposeAction.
  throw new Error("requires_proposal");
}

const ProposeSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  kind: z.enum(["pause", "restart", "resume"]),
});

async function proposeAction(input: z.infer<typeof ProposeSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  const players = await fetchPlayers(room.id);
  const me = players.find((p) => p.device_id === input.deviceId);
  if (!me) throw new Error("not_in_room");

  // Sanity vs estado actual
  if (input.kind === "pause" && room.paused_at) throw new Error("already_paused");
  if (input.kind === "resume" && !room.paused_at) throw new Error("not_paused");

  const existing = room.pending_proposal as PendingProposal | null;
  if (existing && !proposalExpired(existing)) {
    throw new Error("proposal_already_active");
  }

  const humans = await humanDevicesFor(room);
  // Sólo el proponente automáticamente "accepted"; el resto "pending".
  const votes: Record<string, VoteValue> = {};
  for (const h of humans) {
    votes[h.deviceId] = h.deviceId === input.deviceId ? "accepted" : "pending";
  }

  // Si es el único humano, se ejecuta inmediatamente.
  if (humans.length <= 1) {
    await executeProposal(room, input.kind);
    return { ok: true as const };
  }

  const proposal: PendingProposal = {
    kind: input.kind,
    proposerSeat: me.seat as PlayerId,
    proposerName: me.name,
    createdAt: nowIso(),
    expiresAt: new Date(nowMs() + PROPOSAL_TTL_MS).toISOString(),
    votes,
  };
  const { error } = await supabase.from("rooms").update({
    pending_proposal: proposal,
  }).eq("id", room.id);
  if (error) throw new Error(error.message);
  return { ok: true as const, proposal };
}

const RespondSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
  accept: z.boolean(),
});

async function respondProposal(input: z.infer<typeof RespondSchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  const prop = room.pending_proposal as PendingProposal | null;
  if (!prop) throw new Error("no_proposal");
  if (proposalExpired(prop)) {
    await supabase.from("rooms").update({ pending_proposal: null }).eq("id", room.id);
    throw new Error("proposal_expired");
  }
  if (!(input.deviceId in prop.votes)) throw new Error("not_a_voter");

  const updated: PendingProposal = {
    ...prop,
    votes: {
      ...prop.votes,
      [input.deviceId]: input.accept ? "accepted" : "rejected",
    },
  };
  const status = proposalResolved(updated);

  if (status === "executed") {
    await executeProposal(room, updated.kind);
    return { ok: true as const, status: "executed" as const };
  }
  if (status === "rejected") {
    await supabase.from("rooms").update({ pending_proposal: null }).eq("id", room.id);
    return { ok: true as const, status: "rejected" as const };
  }
  await supabase.from("rooms").update({ pending_proposal: updated }).eq("id", room.id);
  return { ok: true as const, status: "pending" as const, proposal: updated };
}

const CancelSchema = z.object({ roomId: z.string().uuid() });
async function cancelProposal(input: z.infer<typeof CancelSchema>) {
  await supabase.from("rooms").update({ pending_proposal: null }).eq("id", input.roomId);
  return { ok: true as const };
}

const RematchStaySchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().min(1),
});
async function rematchStay(input: z.infer<typeof RematchStaySchema>) {
  const room = await fetchRoomById(input.roomId);
  if (!room) throw new Error("room_not_found");
  const humans = await humanDevicesFor(room);
  if (humans.length <= 1) {
    await executeProposal(room, "restart");
    return { ok: true as const, status: "playing" as const };
  }
  // Con varios humanos: usar proposeAction("restart") desde el cliente.
  throw new Error("requires_proposal");
}

// ---------------------------------------------------------------------------
// Stubs (no implementados aún)
// ---------------------------------------------------------------------------
const notImplemented = async () => { throw new Error("not_implemented"); };

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
type Handler = (data: unknown) => Promise<unknown>;
function withSchema<S extends z.ZodTypeAny>(
  schema: S, fn: (input: z.infer<S>) => Promise<unknown>,
): Handler {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("invalid_input:" + JSON.stringify(parsed.error.flatten().fieldErrors));
    }
    return fn(parsed.data);
  };
}

const handlers: Record<string, Handler> = {
  ping: async () => ({ ok: true as const, version: "phase-5-humanized-bots+voting" }),
  createRoom: withSchema(CreateRoomSchema, createRoom),
  joinRoom: withSchema(JoinRoomSchema, joinRoom),
  getRoom: withSchema(GetRoomSchema, getRoom),
  listLobbyRooms: listLobbyRooms as Handler,
  listMyActiveRooms: withSchema(ListMyActiveSchema, listMyActiveRooms),
  heartbeat: withSchema(HeartbeatSchema, heartbeat),
  leaveRoom: withSchema(HeartbeatSchema, leaveRoom),
  setRoomSettings: withSchema(SetSettingsSchema, setRoomSettings),
  setSeatKind: withSchema(SetSeatKindSchema, setSeatKind),
  updatePlayerName: withSchema(UpdateNameSchema, updatePlayerName),
  adminCloseRoom: withSchema(AdminCloseSchema, adminCloseRoom),
  sendChatPhrase: withSchema(SendChatPhraseSchema, sendChatPhrase),
  sendTextMessage: withSchema(SendTextMessageSchema, sendTextMessage),
  flagPlayerInChat: notImplemented,
  adminListChatFlags: notImplemented,
  adminDecideChatFlag: notImplemented,
  adminListChatFlagAudit: notImplemented,
  startMatch: withSchema(StartMatchSchema, startMatch),
  submitAction: withSchema(SubmitActionSchema, submitAction),
  advanceBots: withSchema(HeartbeatSchema, advanceBots),
  setPaused: withSchema(SetPausedSchema, setPaused),
  rematchStay: withSchema(RematchStaySchema, rematchStay),
  proposeAction: withSchema(ProposeSchema, proposeAction),
  respondProposal: withSchema(RespondSchema, respondProposal),
  cancelProposal: withSchema(CancelSchema, cancelProposal),
};

function resolveFn(fn: string): string {
  const normalized = fn.replace(/[-_\s]/g, "").toLowerCase();
  if (normalized === "startmatch") return "startMatch";
  return fn;
}

const RequestSchema = z.object({
  fn: z.string().min(1),
  data: z.unknown().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { fn, data } = parsed.data;
  const handler = handlers[resolveFn(fn)];
  if (!handler) return json({ error: `unknown_fn:${fn}` }, 400);
  try {
    const result = await handler(data);
    return json(result ?? { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "not_implemented" ? 501
      : msg === "forbidden" ? 403
      : msg === "room_not_found" ? 404
      : 400;
    return json({ error: msg }, status);
  }
});
