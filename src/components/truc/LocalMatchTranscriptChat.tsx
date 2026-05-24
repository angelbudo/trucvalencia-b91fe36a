import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";
import type { PlayerId } from "@/game/types";
import { phraseText, type ChatMessage } from "@/game/phrases";

interface Props {
  /** Transcripció completa dels missatges (cants/preguntes/respostes) de la partida. */
  messages: ChatMessage[];
  mySeat: PlayerId;
  seatNames: Record<PlayerId, string>;
  buttonClassName?: string;
}

/** Botó flotant + panell amb la transcripció de tot el que diuen els jugadors
 *  (humà i bots) durant una partida local contra bots. Només lectura: els
 *  bots no escriuen text lliure, només es transcriuen les seves frases.
 */
export function LocalMatchTranscriptChat({
  messages,
  mySeat,
  seatNames,
  buttonClassName,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [lastSeenIdx, setLastSeenIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setLastSeenIdx(messages.length);
  }, [open, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const unreadCount = Math.max(0, messages.length - lastSeenIdx);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        size="icon"
        onClick={() => setOpen(true)}
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
            aria-label={`${unreadCount}`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      <SheetContent
        side="right"
        overlayClassName="bg-black/25"
        className="w-[90vw] sm:max-w-md flex flex-col bg-transparent border-0 p-0 shadow-none mt-[90px] h-[calc(100vh-260px)] !right-auto !left-1/2 -translate-x-1/2 [&>button]:hidden z-[210]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("table_chat.aria_chat")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden p-[10px] flex flex-col min-h-0">
          <section
            className="rounded-lg border border-primary/30 bg-gray-200 text-background shadow-xl flex flex-col flex-1 min-h-0"
            aria-label={t("table_chat.aria_chat")}
          >
            <div className="px-2 py-1 border-b border-primary/20 flex items-center gap-2 bg-background rounded-t-lg">
              <span className="text-xs font-semibold text-primary flex-1 min-w-0 truncate">
                {t("table_chat.aria_chat")}
              </span>
              <span className="text-[10px] text-primary shrink-0">
                {messages.length === 1
                  ? t("sala_chat.messages_singular", { n: messages.length })
                  : t("sala_chat.messages_plural", { n: messages.length })}
              </span>
              <SheetClose
                className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-primary hover:opacity-80 focus:outline-none p-0 -my-1"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </SheetClose>
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
                  const isMyTeam = m.player % 2 === mySeat % 2;
                  const senderName =
                    seatNames[m.player] ??
                    t("table_chat.seat", { n: m.player + 1 });
                  // Roig per al nostre equip (jo + company), blau per a
                  // l'equip rival (bot esquerra i bot dreta).
                  const teamColor = isMyTeam ? "text-red-600" : "text-blue-600";
                  return (
                    <div
                      key={m.id}
                      className="leading-snug flex items-start gap-1"
                    >
                      <div className="flex-1 min-w-0">
                        <span className={cn("font-semibold mr-1", teamColor)}>
                          {senderName}:
                        </span>
                        <span className="break-words text-table-felt">
                          {m.text ?? phraseText(m.phraseId, m.vars)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}