import { useState } from "react";
import { ChatPhraseId, PHRASES_BY_CATEGORY, PHRASES, ChatPhrase } from "@/game/phrases";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";
import { HelpCircle, MessageSquare, Megaphone, X, LucideIcon } from "lucide-react";
import { TRUC_Z_INDEX } from "@/components/truc/layers";

interface ChatPanelProps {
  onSay: (phraseId: ChatPhraseId) => void;
  highlightPreguntes?: boolean;
  highlightRespostes?: boolean;
  highlightAltres?: boolean;
  /** IDs de frases que s'han d'amagar (per ex. quan l'envit ja s'ha resolt). */
  hiddenPhraseIds?: ReadonlySet<ChatPhraseId>;
  /** IDs de frases concretes que s'han de destacar visualment dins del panell. */
  highlightedPhraseIds?: ReadonlySet<ChatPhraseId>;
  /** Variables d'interpolació per a frases concretes (p. ex. {n} a "Tinc {n}"). */
  phraseVars?: Partial<Record<ChatPhraseId, Record<string, string | number>>>;
}

const TONE_STYLE = {
  neutral:  "bg-yellow-500/25 text-foreground border-yellow-500/60 hover:bg-yellow-500/35",
  positive: "bg-green-600/25 text-foreground border-green-500/60 hover:bg-green-600/35",
  negative: "bg-red-600/25 text-foreground border-red-500/60 hover:bg-red-600/35",
  envit:    "bg-green-600/25 text-foreground border-green-500/60 hover:bg-green-600/35",
};

type GroupKey = "preguntes" | "respostes" | "altres";

const GROUPS: Record<
  GroupKey,
  { labelKey: string; icon: LucideIcon; bottom: string; phrases: ChatPhrase[] }
> = {
  preguntes: {
    labelKey: "chat.preguntes",
    icon: HelpCircle,
    bottom: "bottom-[230px]",
    phrases: PHRASES_BY_CATEGORY.pregunta,
  },
  respostes: {
    labelKey: "chat.respostes",
    icon: MessageSquare,
    bottom: "bottom-[170px]",
    phrases: PHRASES_BY_CATEGORY.resposta,
  },
  altres: {
    labelKey: "chat.altres",
    icon: Megaphone,
    bottom: "bottom-[110px]",
    phrases: PHRASES_BY_CATEGORY.indicacio,
  },
};

export function ChatPanel({ onSay, highlightPreguntes, highlightRespostes, highlightAltres, hiddenPhraseIds, highlightedPhraseIds, phraseVars }: ChatPanelProps) {
  const t = useT();
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);

  const toggle = (g: GroupKey) => setOpenGroup((cur) => (cur === g ? null : g));

  const active = openGroup ? GROUPS[openGroup] : null;
  const activePhrases = active
    ? active.phrases.filter((p) => !hiddenPhraseIds || !hiddenPhraseIds.has(p.id))
    : [];

  return (
    <>
      {(Object.keys(GROUPS) as GroupKey[]).map((key) => {
        const g = GROUPS[key];
        const Icon = g.icon;
        const isOpen = openGroup === key;
        // Per defecte (preguntes) usa el daurat del primary.
        // Respostes: més anaronjat. Altres: encara més anaronjat/intens.
        const colorClass =
          key === "respostes"
            ? "bg-orange-500 text-white shadow-[0_4px_16px_-2px_hsl(28_85%_55%/0.55),0_0_24px_hsl(28_85%_60%/0.3)]"
            : key === "altres"
              ? "bg-red-600 text-black shadow-[0_4px_16px_-2px_hsl(0_85%_45%/0.6),0_0_28px_hsl(8_90%_55%/0.35)]"
              : "bg-primary text-primary-foreground gold-glow";
        const ringClass =
          key === "respostes"
            ? "ring-2 ring-orange-400/70"
            : key === "altres"
              ? "ring-2 ring-red-500/80"
              : "ring-2 ring-primary/60";
        const shouldHighlight =
          !isOpen &&
          ((key === "preguntes" && !!highlightPreguntes) ||
            (key === "respostes" && !!highlightRespostes) ||
            (key === "altres" && !!highlightAltres));
        const highlightRingClass =
          key === "respostes"
            ? "animate-pulse-gold ring-2 ring-orange-400 border-orange-400"
            : key === "altres"
              ? "animate-pulse-gold ring-2 ring-red-500 border-red-500"
              : "animate-pulse-gold ring-2 ring-primary border-primary";
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            aria-label={t(g.labelKey)}
            className={cn(
              "fixed right-3 w-12 h-12 rounded-full",
              "shadow-lg",
              "flex items-center justify-center transition-transform active:scale-90",
              colorClass,
              g.bottom,
              isOpen && cn("rotate-90", ringClass),
              shouldHighlight && highlightRingClass
            )}
            style={{ zIndex: TRUC_Z_INDEX.chatControls }}
          >
            {isOpen ? <X className="w-5 h-5" /> : <Icon className="w-5 h-5 text-primary-foreground" />}
          </button>
        );
      })}

      {active && (
        <div className="fixed inset-x-0 bottom-0 animate-fade-in" style={{ zIndex: TRUC_Z_INDEX.chatDrawer }}>
          <div
            className="absolute inset-0 bg-background/40"
            onClick={() => setOpenGroup(null)}
          />
          <div className="relative wood-surface border-t-2 border-primary/60 rounded-t-2xl pt-2 pb-4 px-3 max-h-[55vh] overflow-y-auto">
            <div className="w-12 h-1 rounded-full bg-primary/50 mx-auto mb-2" />
            <div className="flex items-center justify-center gap-2 mb-3">
              <active.icon className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm text-gold tracking-wide uppercase">
                {t(active.labelKey)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activePhrases.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSay(p.id);
                    setOpenGroup(null);
                  }}
                  className={cn(
                    "px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95 text-left",
                    TONE_STYLE[p.tone],
                    highlightedPhraseIds?.has(p.id) && "animate-pulse-gold ring-2 ring-primary border-primary"
                  )}
                >
                  {t(`phrase.${p.id}`, phraseVars?.[p.id])}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ChatBubble({
  phraseId,
  position,
  vars,
}: {
  phraseId: ChatPhraseId;
  position: "bottom" | "top" | "left" | "right" | "bottom-left" | "bottom-right";
  vars?: Record<string, string | number>;
}) {
  const t = useT();
  const phrase = PHRASES.find((p) => p.id === phraseId);

  if (!phrase) return null;

  const positionClass = {
    bottom:        "bottom-full left-1/2 -translate-x-1/2 mb-3 rounded-bl-sm",
    top:           "top-full left-1/2 -translate-x-1/2 mt-3 rounded-tl-sm",
    left:          "left-full top-1/2 -translate-y-1/2 ml-3 rounded-bl-sm",
    right:         "right-full top-1/2 -translate-y-1/2 mr-3 rounded-br-sm",
    "bottom-left":  "bottom-full left-0 mb-3 rounded-bl-sm",
    "bottom-right": "bottom-full right-0 mb-3 rounded-br-sm",
  }[position];

  return (
    <div
      className={cn(
        "absolute px-3 py-1.5 rounded-2xl pointer-events-none",
        "bg-card text-card-foreground font-semibold text-sm",
        "max-w-[180px] whitespace-normal break-words text-center leading-tight",
        "border-2 border-primary shadow-lg animate-fade-in",
        positionClass
      )}
      style={{ zIndex: TRUC_Z_INDEX.chatBubble }}
    >
      {t(`phrase.${phraseId}`, vars)}
    </div>
  );
}