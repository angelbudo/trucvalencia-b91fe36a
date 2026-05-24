import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SalaChat } from "@/online/SalaChat";
import { useSalaChat } from "@/online/useSalaChat";
import { useLobbyPresence, type OnlinePlayer } from "@/online/useLobbyPresence";
import { useT } from "@/i18n/useT";
import { PlayerProfileDialog } from "@/online/PlayerProfileDialog";
import { useAuth } from "@/hooks/useAuth";
import { usePlayerMiniStats } from "@/online/usePlayerMiniStats";
import { PlayerMiniStatsRow } from "@/online/PlayerMiniStats";

interface Props {
  salaSlug: string;
  deviceId: string;
  name: string;
  hasName: boolean;
  ready: boolean;
  /** Codi de la mesa actual, per publicar a presència. */
  roomCode?: string | null;
  /** Classes addicionals per al botó flotant (posició). */
  buttonClassName?: string;
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
  const all = players;
  const me = all.find((p) => p.deviceId === myDeviceId);
  const others = all.filter((p) => p.deviceId !== myDeviceId);
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

export function BoardSalaChat({ salaSlug, deviceId, name, hasName, ready, roomCode = null, buttonClassName }: Props) {
  const t = useT();
  const chatMessages = useSalaChat(salaSlug);
  const [open, setOpen] = useState(false);
  const [lastSeenChatId, setLastSeenChatId] = useState<number>(0);
  const { user } = useAuth();
  const onlinePlayers = useLobbyPresence({
    deviceId,
    name,
    roomCode,
    salaSlug,
    enabled: ready && hasName,
    userId: user?.id ?? null,
    filterBySala: salaSlug,
  });

  useEffect(() => {
    if (chatMessages.length > 0) {
      setLastSeenChatId((prev) => (prev === 0 ? chatMessages[chatMessages.length - 1].id : prev));
    }
  }, [salaSlug, chatMessages.length]);
  useEffect(() => {
    if (open && chatMessages.length > 0) {
      setLastSeenChatId(chatMessages[chatMessages.length - 1].id);
    }
  }, [open, chatMessages]);

  const unreadCount = chatMessages.reduce(
    (acc, m) => (m.id > lastSeenChatId && m.deviceId !== deviceId ? acc + 1 : acc),
    0,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className={
            buttonClassName ??
            "fixed right-4 top-[54px] z-40 h-12 w-12 rounded-full text-primary-foreground shadow-lg bg-accent"
          }
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
        className="w-[90vw] sm:max-w-md flex flex-col bg-transparent border-0 p-0 shadow-none mt-[90px] h-[calc(100vh-260px)] !right-auto !left-1/2 -translate-x-1/2 [&>button]:hidden z-[210]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("sala_chat.title")}</SheetTitle>
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
  );
}