import { Link, useNavigate } from "@/lib/router-shim";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const TermesCondicions = () => {
  const navigate = useNavigate();
  const isEs = getLanguage() === "es";

  useEffect(() => {
    document.title = isEs
      ? "Términos y Condiciones · Truc Valencià"
      : "Termes i Condicions · Truc Valencià";
    const desc = isEs
      ? "Términos y Condiciones de uso de Truc Valencià: reglas del chat, moderación, reportes y limitación de responsabilidad."
      : "Termes i Condicions d'ús de Truc Valencià: regles del xat, moderació, reports i limitació de responsabilitat.";
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
            {isEs ? "Términos y Condiciones de uso" : "Termes i Condicions d'ús"}
          </h1>

          {isEs ? (
            <>
              <p className="text-muted-foreground">
                Estos términos regulan el uso de la aplicación <strong>Truc Valencià</strong>. Al
                utilizarla aceptas íntegramente estas condiciones. Si no estás de acuerdo, no la utilices.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Objeto y aceptación</h2>
                <p>
                  Truc Valencià es una aplicación gratuita para jugar al juego de cartas del Truc, solo
                  contra bots u online con amigos. El uso de la app implica la aceptación de estos términos
                  y de la <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Cuenta vinculada y nombre de usuario (opcional)</h2>
                <p>
                  Jugar al Truc Valencià <strong>no requiere crear cuenta</strong>. Si quieres{" "}
                  <strong>guardar tu progreso y sincronizarlo entre dispositivos</strong>, puedes
                  vincular una cuenta facilitando un <strong>correo electrónico</strong> (o iniciando
                  sesión con Google/Apple) y eligiendo un <strong>nombre de usuario público</strong>.
                </p>
                <ul className="list-disc pl-6 my-2 space-y-1">
                  <li>Debes facilitar un correo del que seas titular. Está prohibido usar correos de terceros sin su consentimiento.</li>
                  <li>El nombre de usuario es <strong>único</strong>, visible para el resto de jugadores y debe respetar las mismas reglas que el sobrenombre (no insultos, no suplantación, no contenidos ofensivos, no datos personales).</li>
                  <li>Nos reservamos el derecho de <strong>renombrar o bloquear</strong> nombres de usuario que incumplan estas reglas o que suplanten marcas, personas reales o personajes públicos.</li>
                  <li>Una cuenta vinculada es <strong>personal e intransferible</strong>. No compartas tus credenciales.</li>
                  <li>Puedes <strong>desvincular o eliminar tu cuenta</strong> en cualquier momento desde <em>Configuració</em>, conservando o borrando tus datos según escojas.</li>
                </ul>
                <p>
                  El tratamiento del correo y del nombre de usuario se detalla en la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Uso permitido</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>La app es para uso personal, lúdico y no comercial.</li>
                  <li>Hay que ser <strong>mayor de 14 años</strong>. Si tienes entre 14 y 18 años, te recomendamos usarla con conocimiento de tus padres o tutores.</li>
                  <li>Debes usar un sobrenombre respetuoso, sin suplantar la identidad de terceros ni utilizar marcas, insultos o contenidos ofensivos.</li>
                  <li>No puedes utilizar bots, scripts, herramientas automatizadas o ingeniería inversa para alterar el funcionamiento del juego.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Reglas del chat</h2>
                <p>La app dispone de dos tipos de comunicación entre jugadores:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Frases predefinidas de mesa</strong>: mensajes cortos del juego ("¡Envido!", "¡Quiero!", "¡Voy a ti!", etc.).</li>
                  <li><strong>Chat libre de texto</strong>: mensajes cortos (máximo 200 caracteres) entre jugadores de una misma sala.</li>
                </ul>
                <p><strong>Conductas prohibidas en el chat (y en el sobrenombre):</strong></p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>Insultos, amenazas, acoso, discurso de odio o discriminación.</li>
                  <li>Contenidos sexuales explícitos, violentos o que puedan herir la sensibilidad de otros jugadores.</li>
                  <li><strong>Spam</strong>, publicidad no solicitada, enlaces a webs externas o estafas (phishing).</li>
                  <li>Compartir <strong>datos personales tuyos o de otros</strong>.</li>
                  <li>Suplantar la identidad de personas reales o personajes públicos.</li>
                  <li>Trampas, colusión entre jugadores de equipos contrarios o cualquier comportamiento antideportivo deliberado.</li>
                </ul>
                <p>El chat <strong>no es privado</strong>: lo ven todos los jugadores de la sala. Sé respetuoso; estás jugando con personas reales.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Moderación</h2>
                <p>Para mantener un entorno seguro:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>Aplicamos filtros técnicos automáticos (límites de longitud, control de envíos masivos y validaciones del lado del servidor).</li>
                  <li>Nos reservamos el derecho de <strong>retirar mensajes</strong>, <strong>cerrar salas</strong> o <strong>bloquear identificadores de dispositivo</strong> que incumplan estos términos.</li>
                  <li>Las salas online inactivas se archivan automáticamente a los 15 minutos y se eliminan 1 hora después.</li>
                  <li>En caso de reincidencia o conducta grave, podemos aplicar un bloqueo permanente del dispositivo.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Sistema de reporte</h2>
                <p>Si ves un mensaje o comportamiento que incumple estos términos, puedes reportarlo:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Desde la sala</strong>: mantén pulsado un mensaje del chat para abrir la opción de reportar.</li>
                  <li><strong>Por correo de incidencias</strong>: indica el código de la sala, la hora aproximada y una descripción del hecho.</li>
                </ul>
                <p>
                  Incluye toda la información posible: <strong>código de sala</strong>, fecha y hora aproximada,
                  sobrenombre de la persona reportada y, si tienes, una captura. Trataremos los reportes con
                  confidencialidad.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Disponibilidad del servicio</h2>
                <p>
                  La app se proporciona <strong>"tal cual" y "según disponibilidad"</strong>. No garantizamos
                  que esté libre de errores, interrupciones o pérdidas de conexión.
                </p>
                <p>
                  Las partidas online dependen de conexión estable a Internet y del proveedor de
                  infraestructura. <strong>No garantizamos la conservación indefinida</strong> de partidas
                  ni del historial de chat.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Limitación de responsabilidad</h2>
                <p>En la máxima medida permitida por la ley aplicable:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>La app se facilita <strong>sin ninguna garantía</strong> expresa o implícita.</li>
                  <li><strong>No nos hacemos responsables</strong> de los daños directos, indirectos, incidentales, especiales o consecuentes derivados del uso o la imposibilidad de uso de la app.</li>
                  <li><strong>No asumimos responsabilidad por el contenido publicado por los usuarios</strong> en el chat o en los sobrenombres.</li>
                  <li>No respondemos por perjuicios derivados de cortes de conexión, fallos del dispositivo, virus o ataques informáticos ajenos a nuestro control.</li>
                  <li>Estas limitaciones <strong>no afectan</strong> a los derechos que la legislación reconozca a las personas consumidoras.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Propiedad intelectual</h2>
                <p>
                  La app, su código, diseño, gráficos y textos están protegidos por derechos de autor de
                  su titular. Se permite el uso personal y privado. Queda prohibida cualquier reproducción,
                  distribución o transformación no autorizada.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">10. Modificaciones de los términos</h2>
                <p>
                  Podemos actualizar estos términos por motivos legales, técnicos u operativos. El uso
                  continuado tras la fecha de actualización implica la aceptación de la nueva versión.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">11. Ley aplicable y jurisdicción</h2>
                <p>
                  Estos términos se rigen por la ley española. Para cualquier controversia, las partes se
                  someten a los juzgados y tribunales que correspondan según la legislación de consumo aplicable.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">12. Contacto</h2>
                <p>
                  Para reportes, solicitudes de derechos o consultas legales, contacta a través del canal
                  de incidencias. Consulta también la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Aquests termes regulen l'ús de l'aplicació <strong>Truc Valencià</strong>.
                En utilitzar-la acceptes íntegrament aquestes condicions. Si no estàs d'acord, no la utilitzes.
              </p>
    
              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Objecte i acceptació</h2>
                <p>
                  Truc Valencià s una aplicació gratuïta per a jugar al joc de cartes del Truc, només
                  contra bots o en línia amb amics. L'ús de l'app implica l'acceptació d'estos termes
                  i de la <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Compte vinculat i nom d'usuari (opcional)</h2>
                <p>
                  Jugar al Truc Valencià <strong>no requerix crear compte</strong>. Si vols{" "}
                  <strong>guardar el teu progrés i sincronitzar-lo entre dispositius</strong>, pots
                  vvincular un compte facilitant un <strong>correu electrònic</strong> (o iniciant
                  sessió ambn Google/Apple) i triant un <strong>nom d'usuari públic</strong>.
                </p>
                <ul className="list-disc pl-6 my-2 space-y-1">
                  <li>Has de facilitar un correu del qual sigues titular. Està prohibit usar correus de tercers sense el seu consentiment.</li>
                  <li>El nom d'usuari és <strong>únic</strong>, és únic, visible per a la resta de jugadors i ha de respectar les mateixes regles que el sobrenom (no insults, no suplantació, no continguts ofensius, no dades personals).</li>
                  <li>Ens reservem el dret de <strong>canviar de nom o bloquejar </strong> noms d'usuari que incomplisquen estes regles o que suplanten marques, persones reals o personatges públics.</li>
                  <li>Un compte vinculat és <strong>personal i intransferible</strong>. No compartisques les teues credencials.</li>
                  <li>Pots <strong>desvincular o eliminar el teu compte</strong> en qualsevol moment des de <em>Configuració</em>, conservant o esborrant les teues dades segons tries.</li>
                </ul>
                <p>
                  El tractament del correu i del nom d'usuari es detalla en la {" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Ús permés</h2>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>L'app és per a ús personal, lúdic i no comercial.</li>
                  <li>Cal ser <strong>major de 14 anys</strong>. Si tens entre 14 i 18 anys, et recomanem usar-la amb coneixement dels teus pares o tutors.</li>
                  <li>Has d'usar un sobrenom respectuós, sense suplantar la identitat de tercers ni utilitzar marques, insults o continguts ofensius.</li>
                  <li>No pots utilitzar bots, scripts, ferramentes automatitzades o enginyeria inversa per a alterar el funcionament del joc.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Regles del xat</h2>
                <p>L'app disposa de dos tipus de comunicació entre jugadors:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Frases predefinides de taula</strong>: missatges curts del joc ("Envit!", "Vull!", "Vaig a tu!", etc.).</li>
                  <li><strong>Xat lliure de text</strong>: missatges curts (màxim 200 caràcters) entre jugadors d'una mateixa sala.</li>
                </ul>
                <p><strong>Conductes prohibides en el xat (i en el sobrenom):</strong></p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>Insults, amenaces, assetjament, discurs d'odi o discriminació.</li>
                  <li>Continguts sexuals explícits, violents o que puguen ferir la sensibilitat d'altres jugadors.</li>
                  <li><strong>Spam</strong>, publicitat no sol·licitada, enllaços a webs externes o estafes (phishing).</li>
                  <li>Compartir <strong>dades personals teues o d'uns altres</strong>.</li>
                  <li>Suplantar la identitat de persones reals o personatges públics.</li>
                  <li>Trampes, col·lusió entre jugadors d'equips contraris o qualsevol comportament antiesportiu deliberat.</li>
                </ul>
                <p>El xat <strong>no és privat</strong>:  ho veuen tots els jugadors de la sala. Sé respectuós; estàs jugant amb persones reals.</p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Moderació</h2>
                <p>Per a mantindre un entorn segur:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>Apliquem filtres tècnics automàtics (límits de longitud, control d'enviaments massius i validacions del costat del servidor).</li>
                  <li>Ens reservem el dret de <strong>retirar missatges</strong>, <strong>tancar sales</strong> o <strong>bloquejar identificadors de dispositiu</strong> que incomplisquen estos termes.</li>
                  <li>Les sales en línia inactives s'arxiven automàticament als 15 minuts i s'eliminen 1 hora després.</li>
                  <li>En cas de reincidència o conducta greu, podem aplicar un bloqueig permanent del dispositiu.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Sistema de reporte</h2>
                <p>Si veus un missatge o comportament que incomplix estos termes, pots reportar-lo:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Des de la sala</strong>: mantin pulsat un missatge del xat per a obrir l'opció de reportar.</li>
                  <li><strong>Per correu d'incidències</strong>: indica el codi de la sala, l'hora aproximada i una descripció del fet.</li>
                </ul>
                <p>
                  Inclou tota la informació possible: <strong>codi de sala</strong>, data i hora aproximada,
                  sobrenom de la persona reportada i, si tens, una captura. Tractarem els reportes amb
                  confidencialitat.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Disponibilitat del servici</h2>
                <p>
                  L'app es proporciona <strong>"tal qual" i "segons disponibilitat"</strong>. No garantim
                  que estiga lliure d'errors, interrupcions o pèrdues de connexió.
                </p>
                <p>
                  Les partides en línia depenen de connexió estable a Internet i del proveïdor 
                  d'infraestructura. <strong>No garantim la conservació indefinida </strong> de partides
                  ni de l'historial de xat.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Limitació de responsabilitat</h2>
                <p>En la màxima mesura permesa per la llei aplicable:</p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>L'app es facilita <strong>sense cap garantia</strong> expressa o implícita.</li>
                  <li><strong>No ens fem responsables</strong> dels danys directes, indirectes, incidentals, especials o conseqüents derivats de l'ús o la impossibilitat d'ús de l'app.</li>
                  <li><strong>No assumim responsabilitat pel contingut publicat pels usuaris</strong> en el xat o en els sobrenoms.</li>
                  <li>No responem per perjuís derivats de corts de connexió, decisions del dispositiu, virus o atacs informàtics aliens al nostre control.</li>
                  <li>Aquestes limitacions <strong>no afecten</strong> els drets que la legislació reconega a les persones consumidores.</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Propietat intel·lectual</h2>
                <p>
                  L'app, el seu codi, disseny, gràfics i textos estan protegits per drets d'autor del
                  seu titular. Es permet l'ús personal i privat. Queda prohibida qualsevol reproducció,
                  distribució o transformació no autoritzada.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">10. Modificacions dels termes</h2>
                <p>
                  Podem actualitzar estos termes per motius legals, tècnics o operatius. L'ús
                  continuat després de la data d'actualització implica l'acceptació de la nova versió.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">11. Llei aplicable i jurisdicció</h2>
                <p>
                  Estos termes es regixen per la llei espanyola. Per a qualsevol controvèrsia, les parts se
                  sotmeten als jutjats i tribunals que corresponguen segons la legislació de consum aplicable.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">12. Contacte</h2>
                <p>
                  Per a reportes, sol·licituds de drets o consultes legals, contacta a través del canal
                  d'incidències. Consulta també la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                </p>
              </section>
            </>
          )}
        </article>

      </div>
    </main>
  );
};

export default TermesCondicions;