import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LogOut, RefreshCw, ShieldCheck, ShieldX, Clock, MessageSquare, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAdminPassword } from "@/hooks/useAdminPassword";
import { ShareAppButton } from "@/components/ShareAppButton";
import {
  adminListChatFlags,
  adminDecideChatFlag,
  adminListChatFlagAudit,
  type AdminChatFlagDTO,
  type ChatFlagStatus,
  type AdminChatFlagAuditEntryDTO,
} from "@/online/rooms.functions";

const FILTERS: { value: ChatFlagStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pendents" },
  { value: "approved", label: "Aprovats" },
  { value: "dismissed", label: "Desestimats" },
  { value: "all", label: "Tots" },
];

function statusBadge(status: ChatFlagStatus) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-600 border border-amber-500/30">
        <Clock className="w-3 h-3" /> Pendent
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-destructive/15 text-destructive border border-destructive/30">
        <ShieldCheck className="w-3 h-3" /> Aprovat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
      <ShieldX className="w-3 h-3" /> Desestimat
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function remainingLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirat";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s restants`;
}

export default function Moderacio() {
  const navigate = useNavigate();
  const { password, setPassword, ready } = useAdminPassword();
  const [draftPwd, setDraftPwd] = useState("");
  const [filter, setFilter] = useState<ChatFlagStatus | "all">("pending");
  const [flags, setFlags] = useState<AdminChatFlagDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [auditOpen, setAuditOpen] = useState<Record<number, boolean>>({});
  const [auditLoading, setAuditLoading] = useState<number | null>(null);
  const [auditByFlag, setAuditByFlag] = useState<Record<number, AdminChatFlagAuditEntryDTO[]>>({});

  useEffect(() => {
    document.title = "Moderació · Truc Valencià";
  }, []);

  const refresh = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    setAuthError(null);
    try {
      const res = await adminListChatFlags({ data: { password, status: filter } });
      setFlags(res.flags);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAuthError(msg);
      if (/contrasenya/i.test(msg)) {
        setPassword("");
      }
    } finally {
      setLoading(false);
    }
  }, [password, filter, setPassword]);

  useEffect(() => {
    if (ready && password) void refresh();
  }, [ready, password, filter, refresh]);

  // Auto-refresh pending list every 15s.
  useEffect(() => {
    if (!password || filter !== "pending") return;
    const id = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(id);
  }, [password, filter, refresh]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftPwd.trim();
    if (!trimmed) return;
    setPassword(trimmed);
    setDraftPwd("");
  };

  const handleDecide = async (flagId: number, decision: ChatFlagStatus) => {
    setWorking(flagId);
    try {
      const res = await adminDecideChatFlag({
        data: { password, flagId, decision, note: notes[flagId]?.trim() || undefined },
      });
      toast.success(
        decision === "approved" ? "Flag aprovat — silenciament mantingut."
        : decision === "dismissed" ? "Flag desestimat — silenciament aixecat."
        : "Flag tornat a pendent.",
      );
      if (res.auditError) {
        toast.warning(`Decisió aplicada però l'auditoria ha fallat: ${res.auditError}`);
      }
      // Invalidate cached audit so the new entry shows up next time it opens.
      setAuditByFlag((prev) => {
        const next = { ...prev };
        delete next[flagId];
        return next;
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(null);
    }
  };

  const toggleAudit = async (flagId: number) => {
    const isOpen = !!auditOpen[flagId];
    setAuditOpen((prev) => ({ ...prev, [flagId]: !isOpen }));
    if (isOpen) return;
    if (auditByFlag[flagId]) return;
    setAuditLoading(flagId);
    try {
      const res = await adminListChatFlagAudit({ data: { password, flagId } });
      setAuditByFlag((prev) => ({ ...prev, [flagId]: res.entries }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setAuditOpen((prev) => ({ ...prev, [flagId]: false }));
    } finally {
      setAuditLoading(null);
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, dismissed: 0 };
    for (const f of flags) c[f.status]++;
    return c;
  }, [flags]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!password) {
    return (
      <main className="min-h-screen px-5 py-8 bg-background text-foreground">
        <div className="w-full max-w-md mx-auto flex flex-col gap-6">
          <header className="flex items-center justify-between">
            <h1 className="font-display font-black italic text-gold text-2xl">Moderació</h1>
            <div className="flex items-center justify-between">
              <ShareAppButton />
              <Button onClick={() => navigate(-1)} size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Tornar">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </header>
          <form onSubmit={handleLogin} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card/40 p-4">
            <Label htmlFor="pwd">Contrasenya d'administrador</Label>
            <Input
              id="pwd"
              type="password"
              autoComplete="current-password"
              value={draftPwd}
              onChange={(e) => setDraftPwd(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" disabled={!draftPwd.trim()}>Entrar</Button>
            {authError && <p className="text-xs text-destructive">{authError}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 bg-background text-foreground">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-black italic text-gold text-2xl md:text-3xl">
              Moderació · flags del xat
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Revisa els missatges silenciats. Aprovar manté el silenciament; desestimar el cancel·la i deixa el jugador escriure de nou.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void refresh()} size="sm" variant="outline" disabled={loading} title="Actualitzar">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button
              onClick={() => { setPassword(""); setFlags([]); }}
              size="sm"
              variant="ghost"
              title="Sortir"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}
            >
              {f.label}
              {f.value !== "all" && counts[f.value] > 0 && (
                <span className="ml-1.5 opacity-80">({counts[f.value]})</span>
              )}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {flags.length} flag{flags.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading && flags.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : flags.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            Cap flag {filter === "all" ? "" : `(${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()})`}.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {flags.map((f) => {
              const isPending = f.status === "pending";
              const isWorking = working === f.id;
              return (
                <li
                  key={f.id}
                  className={cn(
                    "rounded-lg border p-3 flex flex-col gap-2",
                    isPending ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(f.status)}
                      <span className="text-xs text-muted-foreground">
                        Sala <span className="font-mono">{f.roomCode}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(f.createdAt)}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {remainingLabel(f.expiresAt)}
                    </span>
                  </div>

                  <div className="text-sm">
                    <span className="font-semibold text-destructive">{f.targetName}</span>
                    <span className="text-muted-foreground"> reportat per </span>
                    <span className="font-medium">{f.reporterName}</span>
                  </div>

                  {f.messageText ? (
                    <div className="rounded-md bg-background/60 border border-border/60 p-2 text-sm flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="break-words italic">"{f.messageText}"</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      (Sense missatge concret — report genèric)
                    </p>
                  )}

                  {f.reason && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Motiu:</span> {f.reason}
                    </p>
                  )}

                  {!isPending && (
                    <p className="text-[11px] text-muted-foreground">
                      Decidit {formatDate(f.decidedAt)} per {f.decidedBy ?? "admin"}
                    </p>
                  )}

                  <Input
                    value={notes[f.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [f.id]: e.target.value.slice(0, 500) }))}
                    placeholder="Nota interna del moderador (opcional, queda al registre d'auditoria)"
                    disabled={isWorking}
                    className="h-8 text-xs"
                    aria-label={`Nota del moderador per al flag ${f.id}`}
                    maxLength={500}
                  />

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {f.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isWorking}
                        onClick={() => void handleDecide(f.id, "approved")}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Aprovar
                      </Button>
                    )}
                    {f.status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isWorking}
                        onClick={() => void handleDecide(f.id, "dismissed")}
                      >
                        <ShieldX className="w-3.5 h-3.5 mr-1" /> Desestimar
                      </Button>
                    )}
                    {!isPending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isWorking}
                        onClick={() => void handleDecide(f.id, "pending")}
                      >
                        Reobrir
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isWorking || auditLoading === f.id}
                      onClick={() => void toggleAudit(f.id)}
                    >
                      <History className="w-3.5 h-3.5 mr-1" />
                      {auditOpen[f.id] ? "Amagar historial" : "Historial"}
                    </Button>
                    <Link
                      to={`/online/sala/${encodeURIComponent(f.roomCode)}`}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      Veure sala
                    </Link>
                  </div>

                  {auditOpen[f.id] && (
                    <div className="mt-1 rounded-md border border-border/60 bg-background/60 p-2 text-xs space-y-1">
                      {auditLoading === f.id ? (
                        <p className="text-muted-foreground italic flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Carregant historial…
                        </p>
                      ) : (auditByFlag[f.id] ?? []).length === 0 ? (
                        <p className="text-muted-foreground italic">Sense decisions registrades per a aquest flag.</p>
                      ) : (
                        <ol className="space-y-1 list-decimal list-inside">
                          {(auditByFlag[f.id] ?? []).map((a) => (
                            <li key={a.id} className="leading-snug">
                              <span className="font-medium">{formatDate(a.decidedAt)}</span>
                              {" · "}
                              <span className={cn(
                                a.decision === "approved" && "text-destructive font-medium",
                                a.decision === "dismissed" && "text-emerald-600 font-medium",
                                a.decision === "pending" && "text-amber-600 font-medium",
                              )}>{a.decision}</span>
                              {" per "}
                              <span className="font-mono">{a.moderatorTag}</span>
                              {a.reason && (
                                <span className="text-muted-foreground"> — {a.reason}</span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}