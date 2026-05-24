import { Link, useNavigate } from "@/lib/router-shim";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const PoliticaCookies = () => {
  const navigate = useNavigate();
  const isEs = getLanguage() === "es";

  useEffect(() => {
    document.title = isEs
      ? "Política de Cookies · Truc Valencià"
      : "Política de Cookies · Truc Valencià";
    const desc = isEs
      ? "Política de Cookies y almacenamiento local de Truc Valencià: qué datos guardamos en tu dispositivo y cómo gestionarlos."
      : "Política de Cookies i emmagatzematge local de Truc Valencià: quines dades guardem al teu dispositiu i com gestionar-les.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, [isEs]);

  const lastUpdate = isEs ? "23 de mayo de 2026" : "23 de maig de 2026";
  const backLabel = isEs ? "Volver al inicio" : "Tornar a inici";

  return (
    <main className="min-h-screen px-5 py-8 bg-background text-foreground">
      <div className="w-full max-w-lg flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <ShareAppButton />
            <Button onClick={() => navigate("/")} size="sm" variant="outline" className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10" aria-label={backLabel} title={backLabel}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>


        <article className="prose prose-sm md:prose-base max-w-none text-foreground">
          <p className="text-xs text-muted-foreground">{isEs ? "Actualizado" : "Actualitzat"}: {lastUpdate}</p><br/>
          <h1 className="font-display font-black italic text-gold text-3xl md:text-4xl normal-case mb-2">
            {isEs ? "Política de Cookies y Almacenamiento Local" : "Política de Cookies i Emmagatzematge Local"}
          </h1>

          {isEs ? (
            <>
              <p className="text-muted-foreground">
                Esta política explica qué información guardamos en tu navegador o dispositivo
                mientras utilizas la aplicación <strong>Truc Valencià</strong>, y cómo puedes gestionarla.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Resumen</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>No usamos cookies de seguimiento</strong>, ni publicitarias, ni de analítica de terceros (Google Analytics, Facebook Pixel, etc.).</li>
                  <li>Sí utilizamos <strong>localStorage</strong> y, en algunos casos, <strong>sessionStorage</strong> de tu navegador para guardar preferencias y el estado de la partida.</li>
                  <li>Toda esta información es <strong>técnicamente necesaria</strong> para el funcionamiento de la app, así que no requiere consentimiento expreso según el artículo 22.2 de la LSSI-CE.</li>
                  <li>Puedes borrarla en cualquier momento desde tu navegador.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. ¿Qué es localStorage?</h2>
                <p>
                  <strong>localStorage</strong> es un mecanismo estándar del navegador que permite a una web
                  guardar pequeñas cantidades de texto en tu propio dispositivo. A diferencia de las cookies,
                  <strong> nunca se envía automáticamente a ningún servidor</strong>: solo accede a él el código
                  de la app que ya se ha cargado en tu navegador.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Qué guardamos en tu dispositivo</h2>
                <div className="overflow-x-auto my-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-2 font-display">Tipo</th>
                        <th className="text-left p-2 font-display">Finalidad</th>
                        <th className="text-left p-2 font-display">Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Identificador anónimo de dispositivo</strong></td>
                        <td className="p-2 align-top">Cadena aleatoria generada la primera vez que abres la app para identificar tu silla en salas online.</td>
                        <td className="p-2 align-top">Persistente</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Sobrenombre</strong></td>
                        <td className="p-2 align-top">El alias que escribes para identificarte en la mesa.</td>
                        <td className="p-2 align-top">Persistente</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Preferencias de juego</strong></td>
                        <td className="p-2 align-top">Idioma, dificultad de los bots, tipo de cama (9 o 12), timeout de turno y otros ajustes.</td>
                        <td className="p-2 align-top">Persistente</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Estado de la última partida</strong></td>
                        <td className="p-2 align-top">Permite continuar una partida contra bots si cierras y vuelves a abrir la app.</td>
                        <td className="p-2 align-top">Hasta que la finalices</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Estadísticas para la adaptación de los bots</strong></td>
                        <td className="p-2 align-top">Contadores anónimos para ajustar el comportamiento de los bots a tu estilo de juego.</td>
                        <td className="p-2 align-top">Persistente</td>
                      </tr>
                      <tr>
                        <td className="p-2 align-top"><strong>Estado de la sesión de diagnóstico</strong><br /><span className="text-xs text-muted-foreground">(sessionStorage)</span></td>
                        <td className="p-2 align-top">Información técnica para depuración mientras tienes la pestaña abierta.</td>
                        <td className="p-2 align-top">Hasta cerrar la pestaña</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground">Ninguno de estos datos se utiliza para perfilado publicitario ni se comparte con terceros.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Cookies estrictamente técnicas de terceros</h2>
                <p>
                  Para las partidas online, la app usa un proveedor de infraestructura. En algunas peticiones,
                  este proveedor puede utilizar <strong>cookies estrictamente técnicas o cabeceras de sesión</strong>{" "}
                  imprescindibles para el funcionamiento del servicio. Estas <strong>no realizan seguimiento</strong>{" "}
                  de tu actividad ni perfilan tu comportamiento.
                </p>
                  <p className="font-bold mb-1">Sesión de cuenta vinculada</p>
                  <p>
                    Si decides <strong>vincular una cuenta</strong> con correo electrónico (o con Google/Apple)
                    para guardar el progreso entre dispositivos, el proveedor de autenticación guarda en tu
                    navegador un <strong>token de sesión</strong> (en <code>localStorage</code>) para
                    mantenerte identificado y no tener que volver a iniciar sesión cada vez. Este token es
                    estrictamente técnico, necesario para la funcionalidad de cuenta y no se usa para
                    seguimiento publicitario. Puedes eliminarlo en cualquier momento cerrando sesión o
                    borrando los datos del navegador.
                  </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Cómo gestionar o borrar los datos</h2>
                <p>Puedes eliminar todo lo que la app guarda en tu dispositivo:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Desde la app</strong>: con el botón "Borrar partida guardada" de la pantalla de inicio.</li>
                  <li><strong>Desde el navegador</strong> (método más completo):
                    <ul className="list-disc pl-6 mt-1 space-y-1">
                      <li><strong>Chrome / Edge</strong>: Configuración → Privacidad y seguridad → Borrar datos de navegación → <em>Cookies y otros datos de sitios</em>.</li>
                      <li><strong>Firefox</strong>: Configuración → Privacidad y seguridad → Cookies y datos del sitio → Borrar datos.</li>
                      <li><strong>Safari (iOS / macOS)</strong>: Ajustes → Safari → Borrar historial y datos de sitios web.</li>
                    </ul>
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Ten en cuenta que borrar estos datos hará que pierdas el identificador de dispositivo, el
                  sobrenombre y tus preferencias.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. ¿Por qué no mostramos el típico banner de cookies?</h2>
                <p>
                  El artículo 22.2 de la LSSI-CE y las directrices de la Agencia Española de Protección de Datos
                  excluyen del consentimiento previo las cookies o técnicas de almacenamiento que sean{" "}
                  <strong>estrictamente necesarias</strong> para la prestación del servicio solicitado por el
                  usuario. Todo lo que guardamos entra dentro de esa categoría.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Cambios en esta política</h2>
                <p>Si modificamos el tipo de almacenamiento que utilizamos, actualizaremos esta página y la fecha del encabezado.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Más información</h2>
                <p>
                  Para el tratamiento de datos personales consulta la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                  Para las reglas de uso del servicio, los{" "}
                  <Link to="/termes" className="underline text-primary">Términos y Condiciones</Link> y el{" "}
                  <Link to="/avis-legal" className="underline text-primary">Aviso Legal</Link>.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Aquesta política explica quina informació guardem al teu navegador o dispositiu mentre utilitzes
                l'aplicació <strong>Truc Valencià</strong>, i com pots gestionar-la.
              </p>
       <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Resum</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>No usem cookies de seguiment</strong>, ni publicitàries, ni d'analítica de tercers (Google Analytics, Facebook Pixel, etc.).</li>
                  <li>Sí que utilitzem <strong>localStorage</strong> i, en alguns casos, <strong>sessionStorage</strong> ddel teu navegador per a guardar preferències i l'estat de la partida.</li>
                  <li>Tota aquesta informació és <strong>tècnicament necessària</strong> per al funcionament de l'app, així que no requerix consentiment exprés segons l'article 22.2 de la LSSI-CE.</li>
                  <li>Pots esborrar-la en qualsevol moment des del teu navegador.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Què és localStorage?</h2>
                <p>
                  <strong>localStorage</strong> és un mecanisme estàndard del navegador que permet a una web
                  guardar xicotetes quantitats de text en el teu propi dispositiu. A diferència de les cookies,
                  <strong> mai s'envia automàticament a cap servidor</strong>: només accedix a ell el codi
                  de l'app que ja s'ha carregat en el teu navegador.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Què guardem en el teu dispositiu</h2>
                <div className="overflow-x-auto my-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-2 font-display">Tipus</th>
                        <th className="text-left p-2 font-display">Finalitat</th>
                        <th className="text-left p-2 font-display">Duració</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Identificador anònim de dispositiu</strong></td>
                        <td className="p-2 align-top">Cadena aleatòria generada la primera vegada que obris l'app per a identificar la teua cadira en sales en línia.</td>
                        <td className="p-2 align-top">Persistent</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Sobrenom</strong></td>
                        <td className="p-2 align-top">L'àlies que escrius per a identificar-te en la taula.</td>
                        <td className="p-2 align-top">Persistent</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Preferències de joc</strong></td>
                        <td className="p-2 align-top">Idioma, dificultat dels bots, tipus de llit (9 o 12), timeout de torn i altres configuracions.</td>
                        <td className="p-2 align-top">Persistent</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Estat de l'última partida</strong></td>
                        <td className="p-2 align-top">Permet continuar una partida contra bots si tanques i tornes a obrir l'app.</td>
                        <td className="p-2 align-top">Fins que la finalitzes</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2 align-top"><strong>Estadístiques per a l'adaptació dels bots</strong></td>
                        <td className="p-2 align-top">Comptadors anònims per a ajustar el comportament dels bots al teu estil de joc.</td>
                        <td className="p-2 align-top">Persistent</td>
                      </tr>
                      <tr>
                        <td className="p-2 align-top"><strong>Estat de la sessió de diagnòstic</strong><br /><span className="text-xs text-muted-foreground">(sessionStorage)</span></td>
                        <td className="p-2 align-top">Informació tècnica per a depuració mentres tens la pestanya oberta.</td>
                        <td className="p-2 align-top">Fins a tancar la pestanya</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground">Cap d'estes dades s'utilitza per a perfilament publicitari ni es compartix amb tercers.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Cookies estrictament tècniques de tercers</h2>
                <p>
                  Per a les partides en línia, l'app usa un proveïdor d'infraestructura. En algunes peticions,
                  aquest proveïdor pot utilitzar <strong>cookies estrictament tècniques o capçaleres de sessió</strong>{" "}
                  imprescindibles per al funcionament del servici. Aquestes <strong>no realitzen seguiment</strong>{" "}
                  de la teua activitat ni perfilen el teu comportament.
                </p>
                  <p className="font-bold mb-1">Sessió de compte vinculat</p>
                  <p>
                    Si decidixes <strong>vincular un compte</strong> amb correu electrònic (o amb  Google/Apple)
                    per a guardar el progrés entre dispositius, el proveïdor d'autenticació guarda en el teu
                    navegador un <strong>token de sessió</strong> (en <code>localStorage</code>) per a
                    mantindre't identificat i no haver de tornar a iniciar sessió cada vegada. Aquest token és
                    és estrictament tècnic, necessari per a la funcionalitat de compte i no s'usa per a
                    seguiment publicitari. Pots eliminar-ho en qualsevol moment tancant sessió o
                    esborrant les dades del navegador.
                  </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Com gestionar o esborrar les dades</h2>
                <p>Pots eliminar tot el que l'app guarda en el teu dispositiu:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Des de l'app</strong>: amb el botó "Esborrar partida guardada" de la pantalla d'inici.</li>
                  <li><strong>Des del navegador</strong> (mètode més complet):
                    <ul className="list-disc pl-6 mt-1 space-y-1">
                      <li><strong>Chrome / Edge</strong>: Configuració → Privacitat i seguretat → Esborrar dades de navegació → <em>Cookies i altres dades de llocs</em>.</li>
                      <li><strong>Firefox</strong>: Configuració → Privacitat i seguretat → Cookies i dades del lloc → Esborrar dades.</li>
                      <li><strong>Safari (iOS / macOS)</strong>: Configuració → Safari → Esborrar historial i dades de llocs web.</li>
                    </ul>
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Tin en compte que esborrar estes dades farà que perdes l'identificador de dispositiu, el
                  sobrenom i les teues preferències.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Per què no vam mostrar el típic bàner de cookies?</h2>
                <p>
                  L'article 22.2 de la *LSSI-CE i les directrius de l'Agència Espanyola de Protecció de Dades
                  exclouen del consentiment previ les cookies o tècniques d'emmagatzematge que siguen{" "}
                  <strong>estrictament necessàries</strong> per a la prestació del servici sol·licitat per
                  l'usuari. Tot el que guardem entra dins d'eixa categoria.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Canvis en esta política</h2>
                <p>Si modifiquem el tipus d'emmagatzematge que utilitzem, actualitzarem esta pàgina i la data de l'encapçalat.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Més informació</h2>
                <p>
                  Per al tractament de dades personals consulta la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                   Per a les regles d'ús del servici, els{" "}
                  <Link to="/termes" className="underline text-primary">Termes i Condicions</Link> y l'{" "}
                  <Link to="/avis-legal" className="underline text-primary">Avís Legal</Link>.
                </p>
              </section>
            </>
          )}
        </article>

      </div>
    </main>
  );
};

export default PoliticaCookies;