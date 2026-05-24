import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, History, LogOut, Mail, RotateCcw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const CONTACT_EMAIL = "angelbudo4@gmail.com";
const HISTORY_KEY = "truc:reportHistory:v1";
const HISTORY_MAX = 20;

type ReportHistoryEntry = {
  id: string;
  date: string; // ISO
  reason: string;
  reportedNick: string;
  room: string;
  content: string;
  details: string;
  nick: string;
  contactEmail: string;
  messageId?: string;
  gameUrl?: string;
};

function loadHistory(): ReportHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: ReportHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
  } catch {
    /* quota / private mode: ignorat */
  }
}

const REASONS_CA = [
  { value: "assetjament", label: "Assetjament o amenaces" },
  { value: "discurs-odi", label: "Discurs d'odi o discriminació" },
  { value: "contingut-sexual", label: "Contingut sexual / menors" },
  { value: "violencia", label: "Violència o autolesions" },
  { value: "spam", label: "Spam o frau" },
  { value: "drets-autor", label: "Vulneració de drets d'autor / propietat" },
  { value: "altres-il-legal", label: "Altres continguts il·legals" },
];
const REASONS_ES = [
  { value: "assetjament", label: "Acoso o amenazas" },
  { value: "discurs-odi", label: "Discurso de odio o discriminación" },
  { value: "contingut-sexual", label: "Contenido sexual / menores" },
  { value: "violencia", label: "Violencia o autolesiones" },
  { value: "spam", label: "Spam o fraude" },
  { value: "drets-autor", label: "Vulneración de derechos de autor / propiedad" },
  { value: "altres-il-legal", label: "Otros contenidos ilegales" },
];
const REASONS = getLanguage() === "es" ? REASONS_ES : REASONS_CA;

/**
 * Pàgina de reporte de contingut il·lice / moderació.
 * Compleix el Reglament (UE) 2022/2065 (DSA): mecanisme de notificació i acció,
 * punt de contacte únic i base per a una moderació reactiva.
 */
const Reportar = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isEs = getLanguage() === "es";
  const T = isEs ? {
    pageTitle: "Reportar contenido · Truc Valencià",
    metaDesc: "Mecanismo de notificación de contenidos ilícitos (DSA) y punto de contacto de Truc Valencià.",
    moderation: "Moderación · DSA (UE) 2022/2065",
    back: "Volver",
    h1: "Reportar contenido",
    intro1Pre: "Si has detectado en el chat o en la mesa un contenido ilícito, ofensivo o que vulnera los ",
    intro1Mid: "Términos y Condiciones",
    intro1Post: ", puedes notificarlo desde aquí. Tratamos todas las notificaciones de manera diligente y no arbitraria, en cumplimiento del Reglamento (UE) 2022/2065 (Digital Services Act).",
    contact: "Punto de contacto único (DSA art. 11/12):",
    languages: " · Idiomas: valenciano, catalán, castellano, inglés.",
    historyTitle: "Historial local de reportes",
    reopenLast: "Reabrir último",
    seeAll: "Ver todos",
    hide: "Ocultar",
    restore: "Restaurar al formulario",
    deleteEntry: "Borrar entrada",
    clearHistory: "Borrar historial",
    historyNote: "El historial se guarda solo en tu dispositivo (localStorage). No se envía a ningún servidor.",
    reasonLbl: "Motivo del reporte",
    roomLbl: "Sala / código de partida",
    reportedLbl: "Sobrenombre reportado",
    contentLbl: "Contenido concreto (mensaje, frase…)",
    copyMsg: "Copiar mensaje",
    contentPh: "Copia aquí el texto exacto si es posible",
    detailsLbl: "Detalles y contexto",
    detailsPh: "Hora aproximada, situación, capturas (descríbelas), por qué consideras que es ilícito…",
    msgIdLbl: "ID del mensaje (opcional)",
    gameUrlLbl: "Enlace a la partida (opcional)",
    nickLbl: "Tu sobrenombre (opcional)",
    contactLbl: "Email de contacto (opcional)",
    submitNote: "Al enviar, se abrirá tu cliente de correo con la notificación preparada hacia el punto de contacto. No almacenamos tus reportes en ningún servidor: llegan directamente por email.",
    sendBtn: "Enviar notificación",
    copySummary: "Copiar resumen",
    copySummaryTitle: "Copiar el resumen completo del reporte",
    copyMsgTitle: "Copiar el texto del mensaje",
    h2What: "¿Qué pasa con tu reporte?",
    whatItems: ["Acuse de recibo en un plazo máximo de 72 horas.", "Revisión manual del contenido reportado y del contexto.", "Medidas posibles: aviso al jugador, eliminación del contenido, expulsión de la sala, bloqueo del dispositivo o denuncia a las autoridades si procede.", "Comunicación motivada al notificante, si ha facilitado email."],
    h2False: "Notificaciones falsas o abusivas",
    falseP: "Las notificaciones manifiestamente infundadas o abusivas podrán comportar la restricción temporal del derecho a notificar, conforme al artículo 23 del DSA.",
    h2Auth: "Autoridades competentes",
    authP: "También puedes dirigirte a la Comisión Nacional de los Mercados y la Competencia (CNMC), como Coordinador de Servicios Digitales en España, o a la autoridad de tu Estado miembro.",
    toastNothing: "No hay nada que copiar.",
    toastCopyFail: "No se ha podido copiar al portapapeles.",
    toastNeedContent: "Indica el contenido o detalles de lo que quieres reportar.",
    toastSent: "Se ha abierto el cliente de correo con el reporte. Revisamos en menos de 72 h.",
    toastRestored: "Formulario restaurado. Revisa los datos y vuelve a enviar si es necesario.",
    toastCleared: "Historial borrado.",
    toastMsgCopied: "Mensaje copiado al portapapeles.",
    toastSummaryCopied: "Resumen del reporte copiado. Puedes pegarlo en tu correo.",
    notIndicated: "(no indicado)",
    notProvided: "(no facilitado)",
    notAvailable: "(no disponible)",
    anonymous: "(anónimo)",
    summarySubject: "Notificación de contenido ilícito (Reglamento UE 2022/2065 — DSA)",
    summaryDate: "Fecha/hora local:",
    summaryISO: "Fecha/hora ISO (UTC):",
    summaryReason: "Motivo:",
    summaryRoom: "Sala / código de partida (roomCode):",
    summaryReported: "Sobrenombre reportado (nick):",
    summaryMsgId: "ID del mensaje:",
    summaryUrl: "Enlace a la partida:",
    summaryContent: "Contenido o mensaje concreto:",
    summaryDetails: "Detalles adicionales (contexto, hora aproximada, URL, capturas…):",
    summaryNotifier: "— Datos del notificante —",
    summaryNick: "Sobrenombre dentro de la app:",
    summaryEmail: "Email de contacto (opcional):",
    summaryDeclare: "Declaro de buena fe que la información proporcionada es exacta y completa.",
  } : {
    pageTitle: "Reportar contingut · Truc Valencià",
    metaDesc: "Mecanisme de notificació de continguts il·lícits (DSA) i punt de contacte de Truc Valencià.",
    moderation: "Moderació · DSA (UE) 2022/2065",
    back: "Tornar",
    h1: "Reportar contingut",
    intro1Pre: "Si has detectat al xat o a la mesa un contingut il·lícit, ofensiu o que vulnera els ",
    intro1Mid: "Termes i Condicions",
    intro1Post: ", pots notificar-ho des d'ací. Tractem totes les notificacions de manera diligent i no arbitrària, en compliment del Reglament (UE) 2022/2065 (Digital Services Act).",
    contact: "Punt de contacte únic (DSA art. 11/12):",
    languages: " · Idiomes: valencià, català, castellà, anglés.",
    historyTitle: "Historial local de reports",
    reopenLast: "Reobrir últim",
    seeAll: "Veure tots",
    hide: "Amagar",
    restore: "Restaurar al formulari",
    deleteEntry: "Esborrar entrada",
    clearHistory: "Esborrar historial",
    historyNote: "L'historial es guarda només al teu dispositiu (localStorage). No s'envia a cap servidor.",
    reasonLbl: "Motiu del report",
    roomLbl: "Sala / codi de partida",
    reportedLbl: "Sobrenom reportat",
    contentLbl: "Contingut concret (missatge, frase…)",
    copyMsg: "Copiar missatge",
    contentPh: "Copia ací el text exacte si és possible",
    detailsLbl: "Detalls i context",
    detailsPh: "Hora aproximada, situació, captures (descriu-les), per què consideres que és il·lícit…",
    msgIdLbl: "ID del missatge (opcional)",
    gameUrlLbl: "Enllaç a la partida (opcional)",
    nickLbl: "El teu sobrenom (opcional)",
    contactLbl: "Email de contacte (opcional)",
    submitNote: "En enviar, s'obrirà el teu client de correu amb la notificació preparada cap al punt de contacte. No emmagatzemem els teus reports en cap servidor: arriben directament per email.",
    sendBtn: "Enviar notificació",
    copySummary: "Copiar resum",
    copySummaryTitle: "Copiar el resum complet del report",
    copyMsgTitle: "Copiar el text del missatge",
    h2What: "Què passa amb el teu report?",
    whatItems: ["Acusament de recepció en un termini màxim de 72 hores.", "Revisió manual del contingut reportat i del context.", "Mesures possibles: avís al jugador, eliminació del contingut, expulsió de la sala, bloqueig del dispositiu (device id) o denúncia a les autoritats si escau.", "Comunicació motivada al notificant, si ha facilitat email."],
    h2False: "Notificacions falses o abusives",
    falseP: "Les notificacions manifestament infundades o abusives podran comportar la restricció temporal del dret a notificar, conforme a l'article 23 del DSA.",
    h2Auth: "Autoritats competents",
    authP: "Pots també adreçar-te a la Comissió Nacional dels Mercats i la Competència (CNMC), com a Coordinador de Serveis Digitals a Espanya, o a l'autoritat del teu Estat membre.",
    toastNothing: "No hi ha res per copiar.",
    toastCopyFail: "No s'ha pogut copiar al porta-retalls.",
    toastNeedContent: "Indica el contingut o detalls del que vols reportar.",
    toastSent: "S'ha obert el client de correu amb el report. Revisem en menys de 72 h.",
    toastRestored: "Formulari restaurat. Revisa les dades i torna a enviar si cal.",
    toastCleared: "Historial esborrat.",
    toastMsgCopied: "Missatge copiat al porta-retalls.",
    toastSummaryCopied: "Resum del report copiat. Pots enganxar-lo al teu correu.",
    notIndicated: "(no indicat)",
    notProvided: "(no facilitat)",
    notAvailable: "(no disponible)",
    anonymous: "(anònim)",
    summarySubject: "Notificació de contingut il·lícit (Reglament UE 2022/2065 — DSA)",
    summaryDate: "Data/hora local:",
    summaryISO: "Data/hora ISO (UTC):",
    summaryReason: "Motiu:",
    summaryRoom: "Sala / codi de partida (roomCode):",
    summaryReported: "Sobrenom reportat (nick):",
    summaryMsgId: "ID del missatge:",
    summaryUrl: "Enllaç a la partida:",
    summaryContent: "Contingut o missatge concret:",
    summaryDetails: "Detalls addicionals (context, hora aproximada, URL, captures…):",
    summaryNotifier: "— Dades del notificant —",
    summaryNick: "Sobrenom dins l'app:",
    summaryEmail: "Email de contacte (opcional):",
    summaryDeclare: "Declare de bona fe que la informació proporcionada és exacta i completa.",
  };
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [nick, setNick] = useState<string>("");
  const [reportedNick, setReportedNick] = useState<string>(params.get("reportat") ?? "");
  const [room, setRoom] = useState<string>(params.get("sala") ?? "");
  const [content, setContent] = useState<string>(params.get("contingut") ?? "");
  const [details, setDetails] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [messageId, setMessageId] = useState<string>(params.get("missatgeId") ?? "");
  const [gameUrl, setGameUrl] = useState<string>(params.get("url") ?? "");
  const [history, setHistory] = useState<ReportHistoryEntry[]>(() => loadHistory());
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    document.title = T.pageTitle;
    const desc =
      T.metaDesc;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  const reportSummary = useMemo(() => {
    const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? reason;
    const now = new Date();
    const isoDate = now.toISOString();
    const localDate = now.toLocaleString("ca-ES", { dateStyle: "full", timeStyle: "long" });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const derivedUrl =
      gameUrl?.trim() ||
      (room.trim() && origin ? `${origin}/online/sala/${encodeURIComponent(room.trim())}` : "");
    const subject = `[Truc Valencià · Report] ${reasonLabel}${room ? ` · sala ${room}` : ""}`;
    const body = [
      T.summarySubject,
      "",
      `${T.summaryDate} ${localDate} (${tz})`,
      `${T.summaryISO} ${isoDate}`,
      `${T.summaryReason} ${reasonLabel}`,
      `${T.summaryRoom} ${room || T.notIndicated}`,
      `${T.summaryReported} ${reportedNick || T.notIndicated}`,
      `${T.summaryMsgId} ${messageId || T.notIndicated}`,
      `${T.summaryUrl} ${derivedUrl || T.notAvailable}`,
      "",
      T.summaryContent,
      content || T.notIndicated,
      "",
      T.summaryDetails,
      details || "(no indicats)",
      "",
      T.summaryNotifier,
      `${T.summaryNick} ${nick || T.anonymous}`,
      `${T.summaryEmail} ${contactEmail || T.notProvided}`,
      "",
      T.summaryDeclare,
    ].join("\n");
    return { subject, body };
  }, [reason, room, reportedNick, content, details, nick, contactEmail, messageId, gameUrl]);

  const mailtoHref = useMemo(
    () =>
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(reportSummary.subject)}&body=${encodeURIComponent(reportSummary.body)}`,
    [reportSummary],
  );

  const copyToClipboard = async (text: string, okMsg: string) => {
    if (!text.trim()) {
      toast.error(T.toastNothing);
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(okMsg);
    } catch {
      toast.error(T.toastCopyFail);
    }
  };


  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !details.trim()) {
      toast.error(T.toastNeedContent);
      return;
    }
    const entry: ReportHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      reason,
      reportedNick,
      room,
      content,
      details,
      nick,
      contactEmail,
      messageId,
      gameUrl,
    };
    const next = [entry, ...history].slice(0, HISTORY_MAX);
    setHistory(next);
    saveHistory(next);
    window.location.href = mailtoHref;
    toast.success(T.toastSent);
  };

  const restoreEntry = (entry: ReportHistoryEntry) => {
    setReason(entry.reason);
    setReportedNick(entry.reportedNick);
    setRoom(entry.room);
    setContent(entry.content);
    setDetails(entry.details);
    setNick(entry.nick);
    setContactEmail(entry.contactEmail);
    setMessageId(entry.messageId ?? "");
    setGameUrl(entry.gameUrl ?? "");
    setShowHistory(false);
    toast.success(T.toastRestored);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeEntry = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    toast.success(T.toastCleared);
  };

  const lastEntry = history[0];

  return (
    <main className="min-h-screen px-5 py-8 bg-background text-foreground">
      <div className="w-full max-w-lg flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <ShareAppButton />
            <Button
              onClick={() => navigate(-1)}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
              aria-label={T.back}
              title={T.back}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

        <article className="prose prose-sm md:prose-base max-w-none text-foreground">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> {T.moderation}
          </p><br/><br/>
          <h1 className="font-display font-black italic text-gold text-3xl md:text-4xl normal-case mb-2">
            {T.h1}
          </h1>
          <p className="text-muted-foreground">
            {T.intro1Pre}<Link to="/termes" className="underline">{T.intro1Mid}</Link>{T.intro1Post}
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>{T.contact}</strong>{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>{" "}
            {T.languages}
          </p>
        </article>

        {history.length > 0 && (
          <section className="rounded-lg border border-primary/30 bg-card/40 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold inline-flex items-center gap-1.5">
                <History className="w-4 h-4" /> {T.historyTitle}
                <span className="text-xs text-muted-foreground font-normal">({history.length})</span>
              </p>
              <div className="flex items-center gap-2">
                {lastEntry && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => restoreEntry(lastEntry)}
                    className="h-8"
                    title="Reobrir el darrer report"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {T.reopenLast}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowHistory((v) => !v)}
                  className="h-8"
                >
                  {showHistory ? T.hide : T.seeAll}
                </Button>
              </div>
            </div>

            {showHistory && (
              <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {history.map((h) => {
                  const reasonLabel = REASONS.find((r) => r.value === h.reason)?.label ?? h.reason;
                  const dateStr = new Date(h.date).toLocaleString("ca-ES", {
                    dateStyle: "short",
                    timeStyle: "short",
                  });
                  return (
                    <li
                      key={h.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background/40 p-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <p className="text-sm font-medium truncate">{reasonLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateStr}
                          {h.reportedNick ? ` · ${h.reportedNick}` : ""}
                          {h.room ? ` · sala ${h.room}` : ""}
                        </p>
                        {(h.content || h.details) && (
                          <p className="text-xs text-muted-foreground/80 truncate">
                            {(h.content || h.details).slice(0, 120)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => restoreEntry(h)}
                          title={T.restore}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeEntry(h.id)}
                          title={T.deleteEntry}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {showHistory && history.length > 0 && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearHistory}
                  className="h-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {T.clearHistory}
                </Button>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {T.historyNote}
            </p>
          </section>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-card/40 p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{T.reasonLbl}</Label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="room">{T.roomLbl}</Label>
              <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="p. ex. ABCD" maxLength={20} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reportedNick">{T.reportedLbl}</Label>
              <Input id="reportedNick" value={reportedNick} onChange={(e) => setReportedNick(e.target.value)} maxLength={40} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="content">{T.contentLbl}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => copyToClipboard(content, T.toastMsgCopied)}
                disabled={!content.trim()}
                title={T.copyMsgTitle}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> {T.copyMsg}
              </Button>
            </div>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={T.contentPh}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="details">{T.detailsLbl}</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder={T.detailsPh}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="messageId">{T.msgIdLbl}</Label>
              <Input
                id="messageId"
                value={messageId}
                onChange={(e) => setMessageId(e.target.value)}
                placeholder="p. ex. msg_123"
                maxLength={80}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gameUrl">{T.gameUrlLbl}</Label>
              <Input
                id="gameUrl"
                type="url"
                value={gameUrl}
                onChange={(e) => setGameUrl(e.target.value)}
                placeholder="https://…/online/sala/ABCD"
                maxLength={300}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nick">{T.nickLbl}</Label>
              <Input id="nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact">{T.contactLbl}</Label>
              <Input id="contact" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={120} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {T.submitNote}
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" className="h-11 flex-1">
              <Mail className="w-4 h-4 mr-2" /> {T.sendBtn}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:w-auto"
              onClick={() =>
                copyToClipboard(
                  `${reportSummary.subject}\n\n${reportSummary.body}`,
                  T.toastSummaryCopied,
                )
              }
              title={T.copySummaryTitle}
            >
              <Copy className="w-4 h-4 mr-2" /> {T.copySummary}
            </Button>
          </div>
        </form>

        <article className="prose prose-sm max-w-none text-foreground">
          <h2 className="font-display font-bold text-xl mt-4 mb-2">{T.h2What}</h2>
          <ol>
            {T.whatItems.map((it, i) => <li key={i}>{it}</li>)}
          </ol>
          <h2 className="font-display font-bold text-xl mt-4 mb-2">{T.h2False}</h2>
          <p>
            {T.falseP}
          </p>
          <h2 className="font-display font-bold text-xl mt-4 mb-2">{T.h2Auth}</h2>
          <p>
            {T.authP}
          </p>
        </article>
      </div>
    </main>
  );
};

export default Reportar;