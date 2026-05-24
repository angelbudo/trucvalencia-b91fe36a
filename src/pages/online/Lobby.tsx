import { useNavigate, useParams } from "@/lib/router-shim";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useAuth } from "@/hooks/useAuth";

import { joinRoom, listLobbyRooms, adminCloseRoom, type LobbyRoomDTO } from "@/online/rooms.functions";
import { TableSeatPicker, type SeatInfo } from "@/online/TableSeatPicker";
import type { PlayerId } from "@/game/types";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Plus, RefreshCw, Settings, ShieldX, Wifi, MessageCircle, Users, X, Mail } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLobbyPresence } from "@/online/useLobbyPresence";
import { OnlinePlayersList } from "@/online/OnlinePlayersList";
import type { OnlinePlayer } from "@/online/useLobbyPresence";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";
import { PlayerMiniStatsRow } from "@/online/PlayerMiniStats";
import { usePlayerMiniStats } from "@/online/usePlayerMiniStats";
import { useSendInvite } from "@/online/useInvites";
import { useAdminPassword } from "@/hooks/useAdminPassword";
import { toast } from "sonner";
import { getSalaName } from "@/pages/online/Sales";
import { SalaChat } from "@/online/SalaChat";
import { useSalaChat } from "@/online/useSalaChat";
import { useMyActiveRooms } from "@/online/useMyActiveRooms";
import { computeReentryView, reentryHrefForRoom } from "@/online/reentry";
import {
  summarizeLobbyView,
  HUMAN_SEATS_PER_TABLE,
  isRoomNonPlayable,
  placeholderRoomCode,
  roomHasFreeHumanSeat,
  salaForRoom,
  type SalaSlug,
} from "@/online/salaAssignment";
import { useT } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function OnlineLobbyPage() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Lobby />
    </ClientOnly>
  );
}

function SalaPlayersPanel({
  players,
  myDeviceId,
  headerExtra,
  onInvite,
}: {
  players: OnlinePlayer[];
  myDeviceId: string;
  headerExtra?: React.ReactNode;
  onInvite?: (player: OnlinePlayer) => void;
}) {
  const t = useT();
  const me = players.find((p) => p.deviceId === myDeviceId);
  const others = players.filter((p) => p.deviceId !== myDeviceId);
  const list = me ? [me, ...others] : others;
  const { getStats } = usePlayerMiniStats(
    list.map((p) => ({ deviceId: p.deviceId, userId: p.userId ?? null })),
  );
  return (
    <section
      className="rounded-t-lg border border-b-0 border-primary/30 bg-gray-200 text-background shadow-xl flex flex-col flex-[0_0_auto] h-[calc(40%+20px)]"
      aria-label="Jugadors connectats"
    >
      <div className="pl-2 pr-1 py-0 border-b border-primary/20 flex items-center gap-2 bg-background rounded-t-lg h-7 overflow-hidden">
        <span className="text-xs font-semibold text-primary flex-1 min-w-0 truncate">
          Jugadors connectats <span className="text-[10px] font-normal">({list.length})</span>
        </span>
        {headerExtra && <div className="shrink-0 flex items-center -my-2">{headerExtra}</div>}
      </div>
      <div className="px-2 py-1.5 flex-1 min-h-0 overflow-y-auto chat-scroll text-xs space-y-0.5">
        {list.length === 0 ? (
          <p className="text-background/60 italic text-center py-2">No hi ha ningú més connectat</p>
        ) : (
          list.map((p) => {
            const isMe = p.deviceId === myDeviceId;
            const busy = !!p.roomCode;
            const stats = getStats({ deviceId: p.deviceId, userId: p.userId ?? null });
            return (
              <div key={p.deviceId} className="leading-snug flex items-center gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isMe ? (
                    <span className="font-semibold text-background truncate min-w-0">
                      {p.name} (tu)
                    </span>
                  ) : (
                    <PlayerProfileDialog
                      userId={p.userId ?? undefined}
                      deviceId={p.userId ? undefined : p.deviceId}
                      fallbackName={p.name}
                      trigger={
                        <button
                          type="button"
                          className="font-semibold text-background hover:underline focus:outline-none focus:underline text-left truncate min-w-0"
                        >
                          {p.name}
                        </button>
                      }
                    />
                  )}
                  <PlayerMiniStatsRow stats={stats} className="shrink-0" />
                </div>
                {busy && (
                  <span className="text-[10px] text-background/60 shrink-0 ml-auto pl-1">
                    {t("players.at_room", { code: p.roomCode })}
                  </span>
                )}
                {!isMe && !busy && onInvite && (
                  <button
                    type="button"
                    onClick={() => onInvite(p)}
                    className="ml-auto inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                    aria-label={`Invitar ${p.name}`}
                  >
                    <Mail className="w-3 h-3" /> Invitar
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Lobby() {
  const navigate = useNavigate();
  const t = useT();
  const params = useParams<{ sala?: string }>();
  const salaSlug = params.sala ?? null;
  const salaName = getSalaName(salaSlug);
  const isSalaView = !!salaSlug;
  const { deviceId, name, hasName, ready } = usePlayerIdentity();

  // La pantalla "Taules disponibles" sense sala ha quedat obsoleta.
  // Si s'hi accedeix sense slug, redirigim a inici.
  useEffect(() => {
    if (!isSalaView) navigate("/", { replace: true });
  }, [isSalaView, navigate]);
  const { password: adminPassword, isAdmin } = useAdminPassword();
  const [rooms, setRooms] = useState<LobbyRoomDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const { user } = useAuth();
  const onlinePlayers = useLobbyPresence({
    deviceId,
    name,
    roomCode: null,
    salaSlug: salaSlug,
    enabled: ready && hasName,
    userId: user?.id ?? null,
    filterBySala: salaSlug,
  });

  // Mesas en joc on aquest dispositiu encara ocupa un seient (encara que
  // s'haja desconnectat o tancat la pestanya). Permet "tornar a la partida"
  // directament des de la mesa visible al lobby de la sala.
  const { rooms: myActiveRooms } = useMyActiveRooms();

  // Comptador de missatges no llegits al xat de la sala (estil WhatsApp).
  const chatMessages = useSalaChat(salaSlug);
  const [chatOpen, setChatOpen] = useState(false);
  const [lastSeenChatId, setLastSeenChatId] = useState<number>(0);
  useEffect(() => {
    // Inicialitza al darrer id quan canvia la sala, per no comptar històric.
    if (chatMessages.length > 0) {
      setLastSeenChatId((prev) => (prev === 0 ? chatMessages[chatMessages.length - 1].id : prev));
    }
  }, [salaSlug, chatMessages.length]);
  useEffect(() => {
    if (chatOpen && chatMessages.length > 0) {
      setLastSeenChatId(chatMessages[chatMessages.length - 1].id);
    }
  }, [chatOpen, chatMessages]);
  const unreadCount = chatMessages.reduce(
    (acc, m) => (m.id > lastSeenChatId && m.deviceId !== deviceId ? acc + 1 : acc),
    0,
  );

  const handleAdminClose = useCallback(async (roomId: string) => {
    setClosingId(roomId);
    try {
      await adminCloseRoom({ data: { roomId, password: adminPassword } });
      toast.success(t("lobby.table_closed_toast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("lobby.cant_close_table"));
    } finally {
      setClosingId(null);
    }
  }, [adminPassword]);

  const refresh = useCallback(async () => {
    try {
      const { rooms } = await listLobbyRooms({ data: {} });
      setRooms(rooms);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("lobby.connection_error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players" }, () => refresh())
      .subscribe();
    // Sense polling: les actualitzacions venen per Realtime (rooms/room_players)
    // i la presència via useLobbyPresence (canal de presence).
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Vista unificada: mateixa font de veritat que /online/sales.
  const view = useMemo(
    () => summarizeLobbyView({
      rooms,
      salaSlug: (salaSlug as SalaSlug | null) ?? null,
      onlinePlayers,
    }),
    [rooms, salaSlug, onlinePlayers],
  );
  const visible = view.visibleRooms;
  const placeholderCount = view.placeholderCount;
  const targetCount = view.targetCount;

  // Reentry: per cada mesa visible, decideix si aquest dispositiu pot
  // reprendre-la. Centralitzat a `computeReentryView` per facilitar-ne les
  // proves automàtiques (vegeu src/online/__tests__/reentry.test.ts).
  const reentry = useMemo(
    () => computeReentryView({
      visibleRooms: visible,
      myActiveRooms,
      myDeviceId: deviceId,
    }),
    [visible, myActiveRooms, deviceId],
  );
  const canResumeById = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const entry of reentry.perVisible) m.set(entry.room.id, entry.canResume);
    return m;
  }, [reentry]);

  // Mesa pròpia oberta en aquesta sala (estat lobby amb seients lliures
  // on aquest dispositiu ja està assegut). S'usa per oferir "Invitar"
  // des del xat de sala als jugadors connectats no ocupats.
  const myOpenRoomCode = useMemo(() => {
    for (const r of rooms) {
      if (r.status !== "lobby") continue;
      if (salaSlug && salaForRoom(r) !== (salaSlug as SalaSlug)) continue;
      if (r.hostDevice !== deviceId) continue;
      if (!roomHasFreeHumanSeat(r)) continue;
      return r.code;
    }
    return null;
  }, [rooms, salaSlug, deviceId]);

  const sendInvite = useSendInvite({
    fromDeviceId: deviceId,
    fromName: name,
    code: myOpenRoomCode ?? "",
  });
  const handleInvite = useCallback(
    (player: OnlinePlayer) => {
      if (!myOpenRoomCode) return;
      void sendInvite(player.deviceId);
    },
    [myOpenRoomCode, sendInvite],
  );

  const handleJoinSeat = async (room: LobbyRoomDTO, seat: PlayerId) => {
    if (!hasName) {
      setError(t("lobby.need_name_settings"));
      return;
    }
    if (room.seatKinds[seat] !== "human") {
      setError(t("lobby.seat_not_human"));
      return;
    }
    setJoiningCode(room.code);
    setError(null);
    try {
      await joinRoom({ data: { code: room.code, deviceId, name, preferredSeat: seat } });
      navigate(`/online/sala/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("lobby.cant_join"));
      setJoiningCode(null);
    }
  };

  if (!ready || loading) return <Loading />;

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-3xl flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <ShareAppButton />
          <Button
            onClick={() => navigate(isSalaView ? "/online/sales" : "/")}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
            aria-label={isSalaView ? t("lobby.back_to_sales") : t("common.back_home")}
            title={isSalaView ? t("lobby.back_to_sales") : t("common.back_home")}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-3xl pr-2 text-center">
            {salaName ?? t("online.lobby.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {salaName ? (
              <>
                {t("lobby.tables_count", { count: targetCount })}
                <br />
                {t("lobby.tap_seat")}
              </>
            ) : (
              name ? t("lobby.tap_seat_with_name", { name }) : t("lobby.tap_seat_no_name")
            )}
          </p>
        </header>

        {!hasName && (
          <section className="flex items-center justify-between gap-3 px-1 py-2">
            <p className="text-xs text-foreground">{t("lobby.need_name")}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/ajustes")} className="border-primary/40">
              <Settings className="w-3 h-3 mr-1" /> {t("home.settings")}
            </Button>
          </section>
        )}

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="border-primary/40 text-primary hover:bg-primary/10"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> {t("common.refresh")}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <div className="border-t border-gold/60" />
        <section className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 divide-y divide-gold/60 sm:divide-y-0 sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-child(odd)]:border-gold/60 sm:[&>*:nth-child(odd)]:pr-6 sm:[&>*:nth-child(even)]:pl-0 sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-gold/60 sm:[&>*:nth-child(n+3)]:pt-4 [&>*]:py-4 first:[&>*]:pt-0 last:[&>*]:pb-0">
          {visible.length === 0 && placeholderCount === 0 ? (
            <div className="col-span-full flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {visible.map((room, i) => (
                <TableCard
                  key={room.id}
                  index={i}
                  room={room}
                  myDeviceId={deviceId}
                  canResume={canResumeById.get(room.id) ?? false}
                  onResume={() => navigate(reentryHrefForRoom(room))}
                  joining={joiningCode === room.code}
                  onSeatClick={(seat) => handleJoinSeat(room, seat)}
                  isAdmin={isAdmin}
                  closing={closingId === room.id}
                  onAdminClose={() => handleAdminClose(room.id)}
                />
              ))}
              {Array.from({ length: placeholderCount }).map((_, i) => {
                const slotIndex = visible.length + i;
                const phCode = placeholderRoomCode(salaSlug, slotIndex);
                const createHref = salaSlug
                  ? `/online/nou?code=${encodeURIComponent(phCode)}&sala=${encodeURIComponent(salaSlug)}`
                  : `/online/nou?code=${encodeURIComponent(phCode)}`;
                return (
                  <PlaceholderTableCard
                    key={`placeholder-${i}`}
                    index={slotIndex}
                    code={phCode}
                    onCreate={() => navigate(createHref)}
                  />
                );
              })}
            </>
          )}
        </section>
      </div>

      {/* Botons flotants: persones connectades i xat de sala */}
      {hasName && !isSalaView && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 top-20 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
              aria-label={t("lobby.connected_players_room")}
              title={t("lobby.connected_players_room")}
            >
              <Users className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] sm:max-w-sm overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("lobby.connected_players_room")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <OnlinePlayersList
                players={onlinePlayers}
                myDeviceId={deviceId}
                title=""
                emptyLabel={t("lobby.no_one_else")}
                onInvite={myOpenRoomCode ? handleInvite : undefined}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {isSalaView && salaSlug && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 top-36 z-40 h-12 w-12 rounded-full text-primary-foreground shadow-lg bg-accent"
              aria-label="Xat"
              title="Xat"
            >
              <MessageCircle className="text-destructive-foreground w-[24px] h-[24px]" />
              {unreadCount > 0 && (
                <span
                  className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow mr-[7px] ml-0 mt-[6px]"
                  aria-label={`${unreadCount} missatges no llegits`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            overlayClassName="bg-black/25"
            className="w-[90vw] sm:max-w-md flex flex-col bg-transparent border-0 p-0 shadow-none mt-[50px] h-[calc(100vh-100px)] !right-auto !left-1/2 -translate-x-1/2 [&>button]:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Xat de sala</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden p-4 flex flex-col min-h-0 px-[10px] py-[10px] -my-[30px]">
              <SalaPlayersPanel
                players={onlinePlayers}
                myDeviceId={deviceId}
                onInvite={myOpenRoomCode ? handleInvite : undefined}
                headerExtra={
                  <SheetClose
                    className="inline-flex items-center justify-center h-7 w-9 rounded-sm text-primary hover:opacity-80 focus:outline-none p-0"
                    aria-label="Tancar"
                  >
                    <X className="h-7 w-7 -mr-[15px]" />
                  </SheetClose>
                }
              />
              <SalaChat
                salaSlug={salaSlug}
                deviceId={deviceId}
                name={name}
                hasName={hasName}
                className="rounded-t-none border-t-0"
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </main>
  );
}

function TableCard({
  index: _index,
  room,
  myDeviceId: _myDeviceId,
  canResume = false,
  onResume,
  joining,
  onSeatClick,
  isAdmin = false,
  closing = false,
  onAdminClose,
}: {
  index: number;
  room: LobbyRoomDTO;
  myDeviceId: string;
  /** True si aquest dispositiu encara ocupa un seient en aquesta mesa
   *  "playing" i pot tornar-hi (reentry). */
  canResume?: boolean;
  onResume?: () => void;
  joining: boolean;
  onSeatClick: (seat: PlayerId) => void;
  isAdmin?: boolean;
  closing?: boolean;
  onAdminClose?: () => void;
}) {

  const t = useT();
  const isPlaying = room.status === "playing";
  const isNonPlayable = isRoomNonPlayable(room);
  const safeSeatKinds = Array.isArray(room.seatKinds) ? room.seatKinds : [];
  const safePlayers = Array.isArray(room.players) ? room.players : [];
  const playersBySeat = new Map(safePlayers.map((p) => [p.seat, p]));
  const seatIds = Array.from({ length: HUMAN_SEATS_PER_TABLE }, (_, i) => i as PlayerId);
  const seats: SeatInfo[] = seatIds.map((s) => {
    const kind = safeSeatKinds[s] ?? "human";
    const player = playersBySeat.get(s);
    if (isNonPlayable) {
      return {
        seat: s,
        kind,
        occupant: player
          ? { kind: "human", name: player.name, online: false }
          : { kind: "empty" },
        selectable: false,
      };
    }
    if (kind === "bot") {
      return { seat: s, kind, occupant: { kind: "bot" }, selectable: false };
    }
    if (player) {
      return {
        seat: s,
        kind,
        occupant: { kind: "human", name: player.name, online: player.isOnline },
        isHost: false,
        // Si la mesa està en joc i aquest dispositiu hi té seient, fem
        // que tota la mesa siga clickable per "Reprendre partida".
        selectable: isPlaying && canResume,
      };
    }
    return {
      seat: s,
      kind,
      occupant: { kind: "empty" },
      selectable: !isPlaying && kind === "human" && joining === false,
    };
  });

  const humansJoined = safePlayers.length;
  const humanSeats = safeSeatKinds.filter((k) => k === "human").length;
  const handleSeatClick = (seat: PlayerId) => {
    if (isNonPlayable) return;
    if (isPlaying && canResume && onResume) {
      onResume();
      return;
    }
    onSeatClick(seat);
  };

  const showLobbyInfo = !isNonPlayable && !isPlaying;

  return (
    <div className={`relative flex flex-col gap-2 mb-[30px] ${isNonPlayable ? "opacity-50" : isPlaying && !canResume ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-display tracking-widest uppercase text-primary/85">
          {t("lobby.table")} {room.code}
        </span>
        <div className="text-[10px] text-muted-foreground text-right leading-tight">
          {isNonPlayable ? (
            <span className="text-destructive font-semibold uppercase">
              {room.status === "finished" ? t("lobby.finished") : t("lobby.closed")}
            </span>
          ) : isPlaying ? (
            canResume ? (
              <span className="text-team-nos font-semibold uppercase">{t("lobby.your_match")}</span>
            ) : (
              <span className="text-destructive font-semibold uppercase">{t("lobby.in_play")}</span>
            )
          ) : (
            <span>Jugadors: <strong className="text-foreground">{humansJoined}/{humanSeats} humans</strong></span>
          )}
        </div>
      </div>
      <TableSeatPicker seats={seats} onSeatClick={handleSeatClick} showTeams={false} />
      {showLobbyInfo && (
        <div className="h-8 flex flex-col items-end justify-end text-[10px] text-muted-foreground leading-tight gap-0.5">
          <span>Cames a guanyar: <strong className="text-foreground">{room.targetCames}</strong></span>
          <span>Punts per cama: <strong className="text-foreground">{room.targetCama}</strong></span>
          <span>Temps per torn: <strong className="text-foreground">{room.turnTimeoutSec}s</strong></span>
        </div>
      )}


      {!isNonPlayable && isPlaying && canResume && onResume && (
        <Button
          size="sm"
          onClick={onResume}
          className="bg-team-nos text-white hover:bg-team-nos/90 h-8 text-[11px]"
        >
          <Wifi className="w-3 h-3 mr-1" /> {t("lobby.resume_match")}
        </Button>
      )}
      {!isNonPlayable && isPlaying && !canResume && (
        <div className="text-[10px] text-muted-foreground text-center uppercase tracking-wider">
          {t("lobby.in_progress_no_join")}
        </div>
      )}
      {isNonPlayable && (
        <div className="text-[10px] text-destructive text-center uppercase tracking-wider">
          {room.status === "finished" ? t("lobby.match_finished") : t("lobby.table_closed")}
        </div>
      )}
      {joining && (
        <div className="flex items-center justify-center gap-2 text-xs text-primary">
          <Loader2 className="w-3 h-3 animate-spin" /> {t("lobby.joining")}
        </div>
      )}
      {isAdmin && onAdminClose && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAdminClose}
          disabled={closing}
          className="border-destructive/50 text-destructive hover:bg-destructive/10 h-8 text-[11px]"
        >
          {closing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldX className="w-3 h-3 mr-1" />}
          {t("lobby.close_admin")}
        </Button>
      )}
    </div>
  );
}


function PlaceholderTableCard({
  index,
  code,
  onCreate,
}: {
  index: number;
  code: string;
  onCreate: () => void;
}) {
  const t = useT();
  const placeholderSeatIds = Array.from(
    { length: HUMAN_SEATS_PER_TABLE },
    (_, i) => i as PlayerId,
  );
  const seats: SeatInfo[] = placeholderSeatIds.map((s) => ({
    seat: s,
    kind: "human",
    occupant: { kind: "empty" },
    selectable: true,
  }));

  return (
    <div className="flex flex-col gap-2 opacity-90 mb-[30px]" data-placeholder-index={index}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-display tracking-widest uppercase text-primary/60">
          {t("lobby.table")} {code}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("common.free")}</span>
      </div>
      <TableSeatPicker seats={seats} onSeatClick={onCreate} showTeams={false} />
      <div className="flex items-center justify-center">
        <Button
          size="sm"
          variant="outline"
          onClick={onCreate}
          className="border-primary/40 text-primary hover:bg-primary/10 h-8 text-[11px]"
        >
          <Plus className="w-3 h-3 mr-1" /> {t("home.create_table")}
        </Button>
      </div>
    </div>
  );
}

export default OnlineLobbyPage;