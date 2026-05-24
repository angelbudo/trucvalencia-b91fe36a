import { Link, useNavigate } from "@/lib/router-shim";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { useT, getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const AvisLegal = () => {
  const navigate = useNavigate();
  const t = useT();
  const lang = getLanguage();
  const isEs = lang === "es";

  useEffect(() => {
    document.title = isEs
      ? "Aviso Legal · Truc Valencià"
      : "Avís Legal · Truc Valencià";
    const desc = isEs
      ? "Aviso Legal de Truc Valencià: titular, datos de contacto, condiciones de uso y propiedad intelectual."
      : "Avís Legal de Truc Valencià: titular, dades de contacte, condicions d'ús i propietat intel·lectual.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, [isEs]);

  const lastUpdate = isEs ? "23 de mayo de 2026" : "23 de maig de 2026";

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
            aria-label={t("common.back_home")}
            title={t("common.back_home")}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <article className="prose prose-sm md:prose-base max-w-none text-foreground">
          <p className="text-xs text-muted-foreground">{isEs ? "Actualizado" : "Actualitzat"}: {lastUpdate}</p><br/>
          <h1 className="font-display font-black italic text-gold text-3xl md:text-4xl normal-case mb-2">
            {isEs ? "Aviso Legal" : "Avís Legal"}
          </h1>

          {isEs ? (
            <>
              <p className="text-muted-foreground">
                En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de
                Servicios de la Sociedad de la Información y de Comercio Electrónico
                (LSSI-CE), se informan los siguientes aspectos legales.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Datos del titular</h2>
                <ul className="list-none pl-0 my-3 space-y-1">
                  <li><strong>Titular:</strong> Ángel Pérez Lara</li>
                  <li><strong>NIF:</strong> 53361351V</li>
                  <li><strong>Correo de contacto:</strong>{" "}
                    <a href="mailto:trucvalencia@gmail.com" className="underline text-primary">trucvalencia@gmail.com</a>
                  </li>
                  <li><strong>Aplicación:</strong> Truc Valencià</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Objeto</h2>
                <p>
                  Este aviso legal regula el acceso y uso de la aplicación{" "}
                  <strong>Truc Valencià</strong>, un proyecto personal sin ánimo de
                  lucro para jugar al juego de cartas del Truc, solo contra bots o
                  online con amigos. El uso de la app implica la aceptación plena
                  de este aviso legal, de los{" "}
                  <Link to="/termes" className="underline text-primary">Términos y Condiciones</Link>{" "}
                  y de la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Condiciones de uso</h2>
                <p>
                  El usuario se compromete a hacer un uso diligente de la app y a no
                  utilizarla para actividades ilícitas, lesivas de derechos o
                  intereses de terceros, o que puedan perjudicar el funcionamiento
                  normal del servicio. Las reglas concretas de uso y de comportamiento en el
                  chat se detallan en los{" "}
                  <Link to="/termes" className="underline text-primary">Términos y Condiciones</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Propiedad intelectual e industrial</h2>
                <p>
                  Todos los contenidos de la app (código fuente, textos, gráficos,
                  diseños, logotipos, interfaces y cualquier otro elemento) son
                  titularidad del titular indicado en el punto 1, o bien se utilizan
                  con autorización de sus respectivos propietarios. Queda prohibida la
                  reproducción, distribución, comunicación pública o transformación, total
                  o parcial, sin autorización expresa y por escrito del titular.
                </p>
                <p>
                  El nombre "Truc" hace referencia al juego tradicional de cartas valenciano;
                  no se efectúa ninguna reclamación sobre el juego en sí, que pertenece al
                  patrimonio cultural.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Exclusión de garantías y responsabilidad</h2>
                <p>
                  El titular no garantiza la disponibilidad y continuidad
                  ininterrumpidas del servicio. En la medida permitida por la ley, no
                  se hace responsable de los daños de cualquier naturaleza derivados de
                  la falta de disponibilidad o de continuidad del funcionamiento de
                  la app, ni de la presencia de virus u otros elementos lesivos
                  ajenos a su control. Véase el detalle en la cláusula 7 de los{" "}
                  <Link to="/termes" className="underline text-primary">Términos y Condiciones</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Enlaces a terceros</h2>
                <p>
                  Si la app incluye enlaces a sitios de terceros, el titular no se hace
                  responsable de su contenido, políticas o prácticas de privacidad. La
                  inclusión de estos enlaces no implica relación, recomendación ni patrocinio.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Protección de datos</h2>
                <p>
                  El tratamiento de datos personales se rige por nuestra{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacidad</Link>.
                  La mayoría de la información se guarda en el dispositivo del usuario.
                </p>
                <p>
                  Para poder <strong>guardar el progreso entre dispositivos</strong>,
                  la app ofrece de forma <strong>opcional</strong> vincular la cuenta con un{" "}
                  <strong>correo electrónico</strong> y elegir un <strong>nombre de usuario público</strong>.
                  Estos datos solo se solicitan si el usuario decide crear o vincular una cuenta;
                  jugar sin vincular sigue siendo posible sin facilitar ningún dato identificativo.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Ley aplicable y jurisdicción</h2>
                <p>
                  Este aviso legal se rige por la ley española. Para cualquier
                  controversia, las partes se someten a los juzgados y tribunales que
                  correspondan según la legislación de consumo aplicable.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Contacto</h2>
                <p>
                  Para cualquier consulta legal, solicitud o reporte, puedes
                  escribir a{" "}
                  <a href="mailto:trucvalencia@gmail.com" className="underline text-primary">trucvalencia@gmail.com</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                En compliment de l'article 10 de la Llei 34/2002, d'11 de juliol, de
                Serveis de la Societat de la Informació i de Comerç Electrònic
                (LSSI-CE), s'informa dels següents aspectes legals.
              </p>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">1. Dades del titular</h2>
                <ul className="list-none pl-0 my-3 space-y-1">
                  <li><strong>Titular:</strong> Ángel Pérez Lara</li>
                  <li><strong>NIF:</strong> 53361351V</li>
                  <li><strong>Correu de contacte:</strong>{" "}
                    <a href="mailto:trucvalencia@gmail.com" className="underline text-primary">trucvalencia@gmail.com</a>
                  </li>
                  <li><strong>Aplicació:</strong> Truc Valencià</li>
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">2. Objecte</h2>
                <p>
                  Aquest avís legal regula l'accés i ús de l'aplicació{" "}
                  <strong>Truc Valencià</strong>, un projecte personal sense ànim de
                  lucre per a jugar al joc de cartes del Truc, sol contra bots o
                  online amb amics. L'ús de l'app implica l'acceptació plena
                  d'aquest avís legal, dels{" "}
                  <Link to="/termes" className="underline text-primary">Termes i Condicions</Link>{" "}
                  i de la{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">3. Condicions d'ús</h2>
                <p>
                  L'usuari es compromet a fer un ús diligent de l'app i a no
                  utilitzar-la per a activitats il·lícites, lesives de drets o
                  interessos de tercers, o que puguen perjudicar el funcionament
                  normal del servei. Les regles concretes d'ús i de comportament al
                  xat es detallen als{" "}
                  <Link to="/termes" className="underline text-primary">Termes i Condicions</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">4. Propietat intel·lectual i industrial</h2>
                <p>
                  Tots els continguts de l'app (codi font, textos, gràfics,
                  dissenys, logotips, interfícies i qualsevol altre element) són
                  titularitat del titular indicat al punt 1, o bé es fan servir amb
                  autorització dels seus respectius propietaris. Queda prohibida la
                  reproducció, distribució, comunicació pública o transformació, total
                  o parcial, sense autorització expressa i per escrit del titular.
                </p>
                <p>
                  El nom "Truc" fa referència al joc tradicional de cartes valencià;
                  cap reclamació s'efectua sobre el joc en si, que pertany al
                  patrimoni cultural.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">5. Exclusió de garanties i responsabilitat</h2>
                <p>
                  El titular no garanteix la disponibilitat i continuïtat
                  ininterrompudes del servei. En la mesura permesa per la llei, no
                  es fa responsable dels danys de qualsevol naturalesa derivats de
                  la falta de disponibilitat o de continuïtat del funcionament de
                  l'app, ni de la presència de virus o altres elements lesius
                  aliens al seu control. Vegeu el detall a la clàusula 7 dels{" "}
                  <Link to="/termes" className="underline text-primary">Termes i Condicions</Link>.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">6. Enllaços a tercers</h2>
                <p>
                  Si l'app inclou enllaços a llocs de tercers, el titular no es fa
                  responsable del seu contingut, polítiques o pràctiques de
                  privacitat. La inclusió d'aquests enllaços no implica relació,
                  recomanació ni patrocini.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">7. Protecció de dades</h2>
                <p>
                  El tractament de dades personals es regeix per la nostra{" "}
                  <Link to="/privacitat" className="underline text-primary">Política de Privacitat</Link>.
                  La majoria d'informació es guarda al dispositiu de l'usuari.
                </p>
                <p>
                  Per a poder <strong>guardar el progrés entre dispositius</strong>,
                  l'app ofereix de manera <strong>opcional</strong> vincular el compte amb un{" "}
                  <strong>correu electrònic</strong> i triar un <strong>nom d'usuari públic</strong>.
                  Aquestes dades només es demanen si l'usuari decideix crear o vincular un compte;
                  jugar sense vincular continua sent possible sense facilitar cap dada identificativa.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">8. Llei aplicable i jurisdicció</h2>
                <p>
                  Aquest avís legal es regeix per la llei espanyola. Per a qualsevol
                  controvèrsia, les parts se sotmeten als jutjats i tribunals que
                  corresponguen segons la legislació de consum aplicable.
                </p>
              </section>

              <section className="mt-6">
                <h2 className="font-display font-bold text-xl mt-4 mb-2">9. Contacte</h2>
                <p>
                  Per a qualsevol consulta legal, sol·licitud o report, pots
                  escriure a{" "}
                  <a href="mailto:trucvalencia@gmail.com" className="underline text-primary">trucvalencia@gmail.com</a>.
                </p>
              </section>
            </>
          )}
        </article>

     </div>
    </main>
  );
};

export default AvisLegal;