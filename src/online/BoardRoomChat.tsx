import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Flag, MessageCircle, Send, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";
import { useRoomTextChat } from "@/online/useRoomTextChat";
import { sendTextMessage } from "@/online/rooms.functions";
import { useLobbyPresence, type OnlinePlayer } from "@/online/useLobbyPresence";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";
import { useAuth } from "@/hooks/useAuth";
import { usePlayerMiniStats } from "@/online/usePlayerMiniStats";
import { PlayerMiniStatsRow } from "@/online/PlayerMiniStats";
import type { PlayerId } from "@/game/types";
import type { RoomPlayerDTO } from "@/online/types";
import { toast } from "sonner";

const MAX_LEN = 200;

interface Props {
  roomId: string | null;
  roomCode: string;
  deviceId: string;
  name: string;
  hasName: boolean;
  ready: boolean;
  mySeat: PlayerId | null;
  players: RoomPlayerDTO[];
  buttonClassName?: string;
  salaSlug?: string | null;
}

function PlayersTopPanel({
  players,
  myDeviceId,
  headerExtra,
}: {
  players: OnlinePlayer[];
  myDeviceId: string;
  headerExtra?: ReactNode;
}) {
  const t = useT();
  const me = players.find((p) => p.deviceId === myDeviceId);
  const others = players.filter((p) => p.deviceId !== myDeviceId);
  const list = me ? [me, ...others] : others;
  const { getStats } = usePlayerMiniStats(list.map((p) => ({ deviceId: p.deviceId, userId: p.userId ?? null })));

  return (
    <section
      className="rounded-t-lg border border-b-0 border-primary/30 bg-gray-200 text-background shadow-xl flex flex-col flex-[0_0_auto] h-[110px]"
      aria-label={t("players.connected")}
    >
      <div className="pl-2 pr-1 py-0 border-b border-primary/20 flex items-center gap-2 bg-background rounded-t-lg h-7 overflow-hidden">
        <span className="text-xs font-semibold text-primary flex-1 min-w-0 truncate">
          {t("players.connected")} <span className="text-[10px] font-normal">({list.length})</span>
        </span>
        {headerExtra && <div className="shrink-0 flex items-center -my-2">{headerExtra}</div>}
      </div>
      <div className="px-2 py-1.5 flex-1 min-h-0 overflow-y-auto chat-scroll text-xs space-y-0.5">
        {list.length === 0 ? (
          <p className="text-background/60 italic text-center py-2">{t("players.no_one_connected")}</p>
        ) : (
          list.map((p) => {
            const isMe = p.deviceId === myDeviceId;
            const stats = getStats({ deviceId: p.deviceId, userId: p.userId ?? null });
            return (
              <div key={p.deviceId} className="leading-snug flex items-center gap-1.5 min-w-0">
                {isMe ? (
                  <span className="font-semibold text-background truncate min-w-0">
                    {p.name} {t("seat.me_suffix")}
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
                {p.roomCode && (
                  <span className="text-[10px] text-background/60 shrink-0 ml-auto pl-1">
                    {t("players.at_room", { code: p.roomCode })}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/** Xat propi d'una mesa (room_text_chat). Es reinicia automàticament quan
 *  la mesa es tanca i en crear-ne una nova (perquè canvia el roomId). */
export function BoardRoomChat({
  roomId,
  roomCode,
  deviceId,
  name,
  hasName,
  ready,
  mySeat,
  players,
  buttonClassName,
  salaSlug,
}: Props) {
  const t = useT();
  const messages = useRoomTextChat(roomId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeenId, setLastSeenId] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const onlinePlayers = useLobbyPresence({
    deviceId,
    name,
    roomCode,
    salaSlug,
    enabled: ready && hasName,
    userId: user?.id ?? null,
  }).filter((p) => p.roomCode === roomCode);
  

  useEffect(() => {
    if (messages.length > 0) {
      setLastSeenId((prev) => (prev === 0 ? messages[messages.length - 1].id : prev));
    }
  }, [roomId, messages.length]);

  useEffect(() => {
    if (open && messages.length > 0) {
      setLastSeenId(messages[messages.length - 1].id);
    }
  }, [open, messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  // Reset on room change
  useEffect(() => {
    setLastSeenId(0);
  }, [roomId]);

  const namesBySeat = new Map<PlayerId, string>();
  for (const p of players) namesBySeat.set(p.seat, p.name);

  const unreadCount = messages.reduce(
    (acc, m) => (m.id > lastSeenId && m.seat !== mySeat ? acc + 1 : acc),
    0,
  );

  const canSend = mySeat != null && hasName && roomId != null;
  const inputDisabled = sending || !canSend;
  const placeholder = !hasName
    ? t("sala_chat.placeholder_no_name")
    : mySeat == null
      ? t("table_chat.placeholder")
      : t("table_chat.placeholder");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inputDisabled || !roomId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendTextMessage({ data: { roomId, deviceId, text: trimmed } });
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className={
            buttonClassName ??
            "fixed right-4 top-[54px] z-40 h-12 w-12 rounded-full text-primary-foreground shadow-lg bg-accent"
          }
          aria-label={t("table_chat.aria_chat")}
          title={t("table_chat.aria_chat")}
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
        className="w-[90vw] sm:max-w-md flex flex-col bg-transparent border-0 p-0 shadow-none mt-[90px] h-[calc(100vh-260px)] !right-auto !left-1/2 -translate-x-1/2 [&>button]:hidden z-[210]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("table_chat.aria_chat")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden p-[10px] flex flex-col min-h-0">
          <PlayersTopPanel
            players={onlinePlayers}
            myDeviceId={deviceId}
            headerExtra={
              <SheetClose
                className="inline-flex items-center justify-center h-7 w-9 rounded-sm text-primary hover:opacity-80 focus:outline-none p-0"
                aria-label={t("common.close")}
              >
                <X className="h-7 w-7 -mr-[15px]" />
              </SheetClose>
            }
          />
          <section
            className="rounded-b-lg border border-primary/30 bg-gray-200 text-background shadow-xl flex flex-col flex-1 min-h-0"
            aria-label={t("table_chat.aria_chat")}
          >
            <div className="px-2 py-1 border-b border-primary/20 flex items-center gap-2 bg-background">
              <span className="text-xs font-semibold text-primary flex-1 min-w-0 truncate">
                {t("table_chat.header", { code: roomCode })}
              </span>
              <span className="text-[10px] text-primary shrink-0">
                {messages.length === 1
                  ? t("sala_chat.messages_singular", { n: messages.length })
                  : t("sala_chat.messages_plural", { n: messages.length })}
              </span>
            </div>
            <div
              ref={scrollRef}
              className="px-2 py-1.5 flex-1 min-h-0 overflow-y-auto chat-scroll text-xs space-y-0.5"
            >
              {messages.length === 0 ? (
                <p className="text-background/60 italic text-center py-2">
                  {t("table_chat.no_messages")}
                </p>
              ) : (
                messages.map((m) => {
                  const isMine = m.seat === mySeat;
                  const senderName = namesBySeat.get(m.seat) ?? `${t("table_chat.seat", { n: m.seat + 1 })}`;
                  const reportHref = `/reportar?sala=${encodeURIComponent(roomCode)}&reportat=${encodeURIComponent(senderName)}&contingut=${encodeURIComponent(m.text)}`;
                  return (
                    <div key={m.id} className="leading-snug flex items-start gap-1 group">
                      <div className="flex-1 min-w-0">
                        <span className={cn("font-semibold mr-1 text-background")}>{senderName}:</span>
                        <span className="text-background break-words">{m.text}</span>
                      </div>
                      {!isMine && (
                        <Link
                          to={reportHref}
                          className="opacity-50 hover:opacity-100 text-background hover:text-background shrink-0 mt-0.5"
                          aria-label={t("sala_chat.report_message", { name: senderName })}
                          title={t("sala_chat.report_dsa")}
                        >
                          <Flag className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-1 border-t border-primary/20 p-1 bg-background rounded-b-lg"
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                placeholder={placeholder}
                maxLength={MAX_LEN}
                disabled={inputDisabled}
                className="h-8 text-xs flex-1 bg-white text-background placeholder:text-background/50 border-primary/30"
                aria-label={t("table_chat.aria_message")}
              />
              <Link
                to={`/reportar?sala=${encodeURIComponent(roomCode)}`}
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-primary border border-primary hover:text-destructive hover:bg-destructive/10"
                aria-label={t("sala_chat.report_content")}
                title={t("table_chat.report_content_title")}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
              </Link>
              <Button
                type="submit"
                size="sm"
                variant="default"
                disabled={inputDisabled || !text.trim()}
                className="h-8 w-8 p-0 shrink-0"
                aria-label={t("table_chat.aria_send")}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}