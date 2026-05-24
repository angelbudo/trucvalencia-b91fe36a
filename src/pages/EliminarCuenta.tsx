import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  accountDeletionRequestSchema,
  submitAccountDeletionRequest,
} from "@/lib/accountDeletionRequest";
import { ZodError } from "zod";
import { ShareAppButton } from "@/components/ShareAppButton";

const DEVICE_KEY = "truc:device-id";

/**
 * Pàgina pública /eliminar-cuenta.
 *
 * URL declarada a Google Play Console com a "Account deletion URL"
 * (requisit obligatori). Recull email + motiu opcional + identificador
 * anònim de dispositiu (opcional) i envia la sol·licitud a l'endpoint
 * `account-deletion-request`, que la persisteix per al seu processament
 * dins el termini màxim d'1 mes (art. 12.3 RGPD).
 *
 * Diferència amb /esborrar-dades: aquella esborra immediatament a partir
 * del device_id; aquesta acumula peticions per email per a usuaris que
 * ja no tenen l'app instal·lada o que prefereixen el canal escrit.
 */
const EliminarCuenta = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Eliminar cuenta · Truc Valencià";
    const desc =
      "Solicita la eliminación de tu cuenta y datos personales en Truc Valencià. Procesamos la petición en un máximo de 30 días (art. 12.3 RGPD).";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
    // Pre-omplim el device_id si és el mateix navegador on hi ha l'app.
    try {
      const stored = window.localStorage.getItem(DEVICE_KEY);
      if (stored) setDeviceId(stored);
    } catch {
      /* mode privat */
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const parsed = accountDeletionRequestSchema.parse({
        email,
        reason: reason.trim() || undefined,
        deviceId: deviceId.trim() || undefined,
        confirmed: confirmed as true,
      });
      const r = await submitAccountDeletionRequest(parsed);
      setRequestId(r.requestId);
    } catch (err) {
      if (err instanceof ZodError) {
        setError(err.issues[0]?.message ?? "Datos no válidos");
      } else {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 bg-background text-foreground">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
        <header className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Solicitud de eliminación de cuenta
          </p>
          <div className="flex items-center justify-between">
            <ShareAppButton />
            <Button
              onClick={() => navigate("/")}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
              aria-label="Volver al inicio"
              title="Volver al inicio"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <article className="prose prose-sm md:prose-base max-w-none text-foreground">
          <h1 className="font-display font-black italic text-gold text-3xl md:text-4xl normal-case mb-2">
            Eliminar mi cuenta
          </h1>
          <p className="text-muted-foreground">
            Esta página permite solicitar la eliminación permanente de tu cuenta
            y de los datos asociados en <strong>Truc Valencià</strong>.
            Procesaremos tu petición en un plazo máximo de{" "}
            <strong>30 días naturales</strong> desde la recepción
            (art. 12.3 RGPD).
          </p>

          <section className="mt-6">
            <h2 className="font-display font-bold text-xl mt-4 mb-2">
              ¿Qué se eliminará?
            </h2>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li>Tu perfil y estadísticas de juego.</li>
              <li>Mensajes que hayas enviado en los chats de sala.</li>
              <li>
                Mensajes del chat de partida (se anonimizan: se conserva el
                texto pero se elimina tu identificador).
              </li>
              <li>Cualquier asiento que ocupes en mesas activas.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Conservaremos únicamente registros técnicos anónimos durante un
              máximo de 90 días (logs de seguridad, base legal: interés
              legítimo, art. 6.1.f RGPD) y copias de seguridad encriptadas
              durante un máximo de 30 días.
            </p>
          </section>

          <section className="mt-6">
            <h2 className="font-display font-bold text-xl mt-4 mb-2">
              Formulario
            </h2>

            {requestId ? (
              <div className="not-prose rounded-md border border-team-nos/40 bg-team-nos/10 p-4 text-sm flex flex-col gap-2">
                <p className="flex items-center gap-2 font-medium text-team-nos text-base">
                  <CheckCircle2 className="w-5 h-5" /> Solicitud registrada
                </p>
                <p>
                  Hemos recibido tu petición correctamente. La procesaremos en
                  un plazo máximo de <strong>30 días naturales</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Referencia de la solicitud:{" "}
                  <code className="font-mono text-xs bg-background/40 px-1 py-0.5 rounded break-all">
                    {requestId}
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Si has indicado el identificador de tu dispositivo, puedes
                  obtener el borrado inmediato sin esperar desde{" "}
                  <Link
                    to="/esborrar-dades"
                    className="underline text-primary"
                  >
                    /esborrar-dades
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <form
                onSubmit={onSubmit}
                className="not-prose flex flex-col gap-4"
                noValidate
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor="email" className="text-sm font-medium">
                    Correo electrónico <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu.correo@ejemplo.com"
                    disabled={loading}
                    className="bg-background/40 border-primary/30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lo usaremos únicamente para confirmar la eliminación.
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="reason" className="text-sm font-medium">
                    Motivo (opcional)
                  </label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Cuéntanos brevemente por qué deseas eliminar tu cuenta"
                    disabled={loading}
                    maxLength={1000}
                    rows={4}
                    className="bg-background/40 border-primary/30 resize-y"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {reason.length}/1000
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="deviceId" className="text-sm font-medium">
                    Identificador anónimo del dispositivo (opcional)
                  </label>
                  <Input
                    id="deviceId"
                    type="text"
                    autoComplete="off"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="p. ej. 3f8a1c20-…"
                    disabled={loading}
                    maxLength={80}
                    className="bg-background/40 border-primary/30 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Si lo indicas, podremos identificar tus datos
                    inmediatamente. Si tienes la app instalada, lo
                    rellenaremos automáticamente.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={loading}
                    className="mt-1"
                  />
                  <span>
                    Declaro que soy el titular legítimo de la cuenta y de los
                    datos asociados, he leído la{" "}
                    <Link
                      to="/privacitat"
                      className="underline text-primary"
                    >
                      Política de Privacidad
                    </Link>{" "}
                    y solicito formalmente el ejercicio de mi{" "}
                    <strong>derecho de supresión</strong> (art. 17 RGPD).
                    Entiendo que esta acción es <strong>irreversible</strong>.
                  </span>
                </label>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={loading || !confirmed || email.length === 0}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Enviar solicitud
                </Button>

                <p className="text-xs text-muted-foreground">
                  Al enviar el formulario, tu petición queda registrada
                  inmediatamente. La eliminación efectiva se completará en un
                  plazo máximo de 30 días naturales.
                </p>
              </form>
            )}
          </section>

          <section className="mt-8 text-sm text-muted-foreground">
            <p>
              Si prefieres el borrado inmediato y conoces el identificador de
              tu dispositivo, puedes hacerlo tú mismo desde{" "}
              <Link to="/esborrar-dades" className="underline text-primary">
                /esborrar-dades
              </Link>
              . Más información en la{" "}
              <Link to="/privacitat" className="underline text-primary">
                Política de Privacidad
              </Link>
              .
            </p>
          </section>
        </article>

        <footer className="pt-6 border-t border-border">
          <Button asChild variant="outline" className="w-full border-2">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
        </footer>
      </div>
    </main>
  );
};

export default EliminarCuenta;