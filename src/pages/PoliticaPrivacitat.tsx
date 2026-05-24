import { Link, useNavigate } from "@/lib/router-shim";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const PoliticaPrivacitat = () => {
  const navigate = useNavigate();
  const isEs = getLanguage() === "es";

  useEffect(() => {
    document.title = isEs
      ? "Política de Privacidad · Truc Valencià"
      : "Política de Privacitat · Truc Valencià";
    const desc = isEs
      ? "Política de Privacidad de Truc Valencià: datos tratados, finalidad y cómo ejercer tus derechos ARCO/ARSULIPO."
      : "Política de Privacitat de Truc Valencià: dades tractades, finalitat i com exercir els teus drets ARCO/ARSULIPO.";
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
            <Button
              onClick={() => navigate("/")}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
              aria-label={backLabel}
              title={backLabel}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

        <article className="prose prose-sm md:prose-base max-w-none text-foreground">
          <p className="text-xs text-muted-foreground">{isEs ? "Actualizado" : "Actualitzat"}: {lastUpdate}</p><br/>
          <h1 className="font-display font-black italic text-gold text-3xl md:text-4xl normal-case mb-2">
            {isEs ? "Política de Privacidad" : "Política de Privacitat"}
          </h1>

          {isEs ? (
            <>
              <p className="text-muted-foreground">
                Esta política explica qué datos trata la aplicación <strong>Truc Valencià</strong>,
                con qué finalidad, durante cuánto tiempo y cómo puedes ejercer tus derechos.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Responsable del tratamiento</h2>
                <p>
                  Esta aplicación es un proyecto personal sin ánimo de lucro. Si quieres ejercer tus
                  derechos o tienes cualquier duda sobre privacidad, puedes contactar a través del
                  canal de incidencias indicado en la página de publicación de la app.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Qué datos tratamos</h2>
                <p>
                  Jugar a la app <strong>no requiere registro obligatorio</strong>. Los datos tratados son
                  mínimos y, en su mayoría, no salen de tu dispositivo:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Sobrenombre (alias)</strong>: el texto que tú mismo escribes para identificarte en la mesa. Puedes poner lo que quieras; no se verifica ni se asocia a ninguna identidad real.</li>
                  <li><strong>Identificador anónimo de dispositivo</strong>: una cadena aleatoria generada por el navegador la primera vez que abres la app. Sirve para saber qué silla ocupas en una partida y permitir volver si cierras y abres la app.</li>
                  <li><strong>Preferencias del juego</strong>: dificultad de los bots, idioma, tipo de cama, etc. Se guardan <strong>solo en tu dispositivo</strong> (<code>localStorage</code>).</li>
                  <li><strong>Estadísticas de partida</strong>: contadores para adaptar el comportamiento de los bots (envites aceptados, frecuencia de faroles, etc.). Anónimas y asociadas al identificador anónimo del dispositivo.</li>
                  <li><strong>Estado de la partida online</strong>: cartas, acciones y mensajes del chat de la sala. Necesario para que el resto de jugadores vea la partida en tiempo real. Se borra automáticamente al finalizar (ver apartado 5).</li>
                </ul>
                <p className="text-sm text-muted-foreground">No usamos cookies de seguimiento, ni publicidad, ni herramientas de analítica de terceros.</p>

                  <p className="font-bold">
                    Cuenta vinculada (opcional)</p>
                  <p>
                    Para poder <strong>guardar el progreso y sincronizarlo entre dispositivos</strong>,
                    la app permite vincular una cuenta. Si decides hacerlo, se tratan estos datos
                    adicionales:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li><strong>Correo electrónico</strong>: se utiliza únicamente como identificador de la cuenta y para enviar correos de verificación o recuperación. No se usa para publicidad ni se cede a terceros.</li>
                    <li><strong>Nombre de usuario público</strong>: nombre único elegido por ti que te identificará ante el resto de jugadores (estadísticas, clasificaciones, invitaciones).</li>
                    <li><strong>Datos de autenticación del proveedor</strong> (si vinculas con Google o Apple): identificador de la cuenta del proveedor para validar el inicio de sesión.</li>
                  </ul>
                  <p className="mt-2">
                    La vinculación es <strong>voluntaria</strong>. Puedes seguir jugando sin facilitar
                    correo ni nombre de usuario. Si vinculas la cuenta, puedes desvincularla o
                    eliminarla en cualquier momento desde <em>Configuración</em>.
                  </p>
                  <p className="mt-2">
                    <strong>Base legal</strong> de este tratamiento: tu consentimiento expreso al
                    crear o vincular la cuenta (art. 6.1.a RGPD) y la ejecución del servicio
                    solicitado (art. 6.1.b RGPD).
                  </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Finalidad y base legal</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Finalidad</strong>: que puedas jugar al Truc, solo contra bots u online con amigos, mantener tus preferencias y permitir que los bots se adapten a tu estilo de juego.</li>
                  <li><strong>Base legal</strong>: ejecución del servicio solicitado por ti (art. 6.1.b RGPD). Al no haber datos identificativos, no se trata ninguna categoría especial de datos.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Quién puede acceder a los datos</h2>
                <p>
                  Las preferencias y estadísticas solo son accesibles <strong>desde tu dispositivo</strong>. Para
                  el juego online, el estado de la sala lo procesa nuestro proveedor de infraestructura
                  (servidor y base de datos) para hacer llegar las jugadas al resto de participantes.{" "}
                  <strong>No cedemos datos a terceros con fines comerciales</strong> ni los usamos para
                  perfilado publicitario.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Cuánto tiempo los guardamos</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Datos en tu dispositivo</strong>: hasta que tú los borres (botón "Borrar datos" de la app, o borrando los datos del navegador).</li>
                  <li><strong>Salas online activas</strong>: las salas inactivas durante 15 minutos se marcan como abandonadas y se eliminan automáticamente 1 hora después.</li>
                  <li><strong>Estadísticas anónimas para bots</strong>: se conservan mientras exista el identificador anónimo del dispositivo. Se pueden eliminar a petición tuya aportando dicho identificador.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Tus derechos (ARCO / ARSULIPO)</h2>
                <p>Aunque tratamos datos mínimos y pseudonimizados, tienes derecho a:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Acceso (A)</strong>: saber qué tratamos sobre tu identificador anónimo.</li>
                  <li><strong>Rectificación (R)</strong>: corregir datos inexactos (p. ej., el sobrenombre).</li>
                  <li><strong>Cancelación / Supresión (C / S)</strong>: pedir que eliminemos las estadísticas asociadas a tu identificador.</li>
                  <li><strong>Oposición (O)</strong>: oponerte al tratamiento concreto.</li>
                  <li><strong>Limitación del tratamiento (LI)</strong>: pedir que dejemos de tratar los datos temporalmente.</li>
                  <li><strong>Portabilidad (P)</strong>: recibir tus datos en un formato estructurado (JSON).</li>
                  <li><strong>No ser objeto de decisiones automatizadas (O)</strong>: los bots adaptan su juego, pero no toman decisiones con efectos jurídicos sobre ti.</li>
                </ul>
                <p>
                  <strong>Cómo ejercerlos</strong>: la forma más rápida es desde el propio dispositivo
                  (borrar datos del navegador o de la app). Si quieres que borremos datos del lado servidor,
                  contacta indicando tu identificador anónimo de dispositivo (lo encontrarás en{" "}
                  <em>Configuración → Diagnóstico</em>). Responderemos en un plazo máximo de un mes.
                </p>
                <p>
                  Tienes derecho a presentar una reclamación ante la <strong>Agencia Española de
                  Protección de Datos</strong> (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="underline text-primary">www.aepd.es</a>)
                  si consideras que el tratamiento de tus datos no es correcto.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Menores de edad</h2>
                <p>
                  La app no está dirigida específicamente a menores. Si eres padre, madre o tutor y crees
                  que un menor ha facilitado datos, contáctanos y los eliminaremos inmediatamente. Al no
                  pedir datos identificativos, no es técnicamente posible verificar la edad de los usuarios.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Seguridad</h2>
                <p>
                  Aplicamos medidas técnicas razonables: comunicaciones cifradas (HTTPS), acceso restringido
                  a la base de datos mediante políticas de seguridad a nivel de fila (RLS) y revocación de privilegios.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Cambios en esta política</h2>
                <p>
                  Si modificamos esta política, actualizaremos la fecha del encabezado y haremos visible un
                  aviso en la app. La versión vigente siempre es la accesible desde esta página.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">10. Borrado de la cuenta y de los datos (Google Play)</h2>
                <p>
                  De acuerdo con la política de Google Play sobre borrado de datos de usuario, ofrecemos dos
                  caminos equivalentes para solicitar el borrado de todos los datos asociados a tu dispositivo:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Dentro de la app</strong>: <em>Configuración → Privacidad y datos → Borrar mis datos</em>. Borra datos del servidor y locales en un solo paso.</li>
                  <li><strong>Página pública</strong>: <a href="/esborrar-dades" className="underline text-primary">/borrar-datos</a>. Permite solicitarlo desde un navegador, aunque ya no tengas la app instalada, indicando el identificador anónimo del dispositivo.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Categorías de datos procesados según el Data Safety form de Google Play: <em>App activity</em>{" "}
                  (eventos de partida) y <em>User-generated content</em> (sobrenombre y mensajes de chat). No se
                  recogen datos de localización, contactos, ficheros, identificadores publicitarios ni datos financieros.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Aquesta política explica quines dades tracta l'aplicació{" "}
                <strong>Truc Valencià</strong>, amb quina finalitat, durant quant de
                temps i com pots exercir els teus drets.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Responsable del tractament</h2>
                <p>
                  Aquesta aplicació és un projecte personal sense ànim de lucre. Si vols exercir els
                  teus drets o tens qualsevol dubte sobre privacitat, pots contactar a través del
                  canal d'incidències indicat a la pàgina de publicació de l'app.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Quines dades tractem</h2>
                <p>
                  Jugar a l'app <strong>no requereix registre obligatori</strong>. Les dades que es tracten
                  són mínimes i, en la seua majoria, no ixen del teu dispositiu:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Sobrenom (àlies)</strong>: el text que tu mateix escrius per identificar-te a la mesa.</li>
                  <li><strong>Identificador anònim de dispositiu</strong>: cadena aleatòria per saber quina cadira ocupes.</li>
                  <li><strong>Preferències del joc</strong>: es guarden <strong>només al teu dispositiu</strong>.</li>
                  <li><strong>Estadístiques de partida</strong>: anònimes, per adaptar el comportament dels bots.</li>
                  <li><strong>Estat de la partida online</strong>: necessari perquè la resta de jugadors veja la partida en temps real.</li>
                </ul>
                <p className="text-sm text-muted-foreground">No fem servir cookies de seguiment, ni publicitat, ni eines d'analítica de tercers.</p>

                <p className="font-bold mt-2">
                  Compte vinculat (opcional)</p>
                  <p>
                    Per a poder <strong>guardar el progrés i sincronitzar-lo entre dispositius</strong>,
                    l'app permet vincular un compte. Si decideixes fer-ho, es tracten aquestes dades
                    addicionals:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li><strong>Correu electrònic</strong>: s'utilitza únicament com a identificador del compte i per a enviar correus de verificació o recuperació. No es fa servir per a publicitat ni es cedeix a tercers.</li>
                    <li><strong>Nom d'usuari públic</strong>: nom únic triat per tu que t'identificarà davant la resta de jugadors (estadístiques, classificacions, invitacions).</li>
                    <li><strong>Dades d'autenticació del proveïdor</strong> (si vincules amb Google o Apple): identificador del compte del proveïdor per a validar l'inici de sessió.</li>
                  </ul>
                  <p className="mt-2">
                    La vinculació és <strong>voluntària</strong>. Pots continuar jugant sense facilitar
                    correu ni nom d'usuari. Si vincules el compte, pots desvincular-lo o eliminar-lo
                    en qualsevol moment des de <em>Configuració</em>.
                  </p>
                  <p className="mt-2">
                    <strong>Base legal</strong> d'aquest tractament: el teu consentiment exprés en
                    crear o vincular el compte (art. 6.1.a RGPD) i l'execució del servei sol·licitat
                    (art. 6.1.b RGPD).
                  </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Finalitat i base legal</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Finalitat</strong>: que pugues jugar al Truc, sol contra bots o online amb amics.</li>
                  <li><strong>Base legal</strong>: execució del servei sol·licitat per tu (art. 6.1.b RGPD).</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Qui pot accedir a les dades</h2>
                <p>
                  Les preferències i estadístiques només són accessibles <strong>des del teu dispositiu</strong>.
                  <strong> No cedim dades a tercers per a fins comercials</strong>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Quant de temps les guardem</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Dades al teu dispositiu</strong>: fins que tu les esborres.</li>
                  <li><strong>Sales online actives</strong>: 15 min inactives → arxivades; 1 h després → eliminades.</li>
                  <li><strong>Estadístiques anònimes per a bots</strong>: mentre l'identificador anònim existisca.</li>
                </ul>
              </section>

           <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Els teus drets (ARCO / ARSULIPO)</h2>
                <p>Encara que tractem dades mínimes i pseudonimitzats, tens dret a:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Accés (A)</strong>: saber què tractem sobre el teu identificador anònim.</li>
                  <li><strong>Rectificació (R)</strong>: corregir dades inexactes (p. ex., el sobrenom).</li>
                  <li><strong>Cancel·lació / Supressió (C / S)</strong>: demanar que eliminem les estadístiques associades al teu identificador.</li>
                  <li><strong>Oposició (O)</strong>: oposar-te al tractament concret.</li>
                  <li><strong>Limitació del tractament (LI)</strong>: demanar que deixem de tractar les dades temporalment.</li>
                  <li><strong>Portabilitat (P)</strong>: rebre les teues dades en un format estructurat (JSON).</li>
                  <li><strong>No ser objecte de decisions automatitzades (O)</strong>: els bots adapten el seu joc, però no prenen decisions amb efectes jurídics sobre tu.</li>
                </ul>
                <p>
                  <strong>Com exercir-los</strong>: la forma més ràpida és des del propi dispositiu 
                  (esborrar dades del navegador o de l'app). Si vols que esborrem dades del costat servidor,
                  contacta indicant el teu identificador anònim de dispositiu (ho trobaràs en{" "}
                  <em>Configuració → Diagnòstic</em>). Respondrem en un termini màxim d'un mes.
                </p>
                <p>
                  Tens dret a presentar una reclamació davant l'<strong>Agència Espanyola de
                  Protecció de Dades</strong> (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="underline text-primary">www.aepd.es</a>)
                  si consideres que el tractament de les teues dades no és correcte.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Menors d' edat</h2>
                <p>
                  L'app no està dirigida específicament a menors. Si eres pare, mare o tutor i creus
                  que un menor ha facilitat dades, contacta'ns i els eliminarem immediatament. Al no
                  demanar dades identificatives, no és tècnicament possible verificar l'edat dels usuaris.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Seguretat</h2>
                <p>
                  Apliquem mesures tècniques raonables: comunicacions xifrades (HTTPS), accés restringit
                  a la base de dades mitjançant polítiques de seguretat a nivell de fila (*RLS) i revocació de privilegis.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Canvis en aquesta política</h2>
                <p>
                  Si modifiquem esta política, actualitzarem la data de l'encapçalat i farem visible un
                  avís en l'app. La versió vigent sempre és l'accessible des d'aquesta pàgina.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">10. Esborrament del compte i de les dades (Google Play)</h2>
                <p>
                  D'acord amb la política de Google *Play sobre esborrament de dades d'usuari, oferim dos
                  camins equivalents per a sol·licitar l'esborrament de totes les dades associades al teu dispositiu:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Dins de l'app</strong>: <em>Configuració → Privacitat i dades → Esborrar les meues dades</em>. Esborra dades del servidor i locals en un sol pas.</li>
                  <li><strong>Pàgina pública</strong>: <a href="/esborrar-dades" className="underline text-primary">/esborrar-dades</a>. Permet sol·licitar-ho des d'un navegador, encara que ja no tingues l'app instal·lada, indicant l'identificador anònim del dispositiu.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Categories de dades processades segons el Data Safety form de Google Play: <em>App activity</em>{" "}
                  (esdeveniments de partida) i <em>User-generated content</em> (sobrenom i missatges de xat). No 
                  s'arrepleguen dades de localització, contactes, fitxers, identificadors publicitaris ni dades financeres.
                </p>
              </section>
            </>
          )}
        </article>

      </div>
    </main>
  );
};

export default PoliticaPrivacitat;