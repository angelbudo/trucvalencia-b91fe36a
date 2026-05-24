import { useNavigate } from "@/lib/router-shim";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useT, getLanguage } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

const Regles = () => {
  const navigate = useNavigate();
  const t = useT();
  const isEs = getLanguage() === "es";

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-6 pb-12">
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

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-2xl text-center pr-1.5">
            {isEs ? "Reglas del Truc" : "Regles del Truc"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isEs ? "Truc Valencià — Reglas completas" : "Truc Valencià — Regles completes"}
          </p>
        </header>

        {/* Índex */}
        <nav className="bg-card/50 rounded-lg p-3 border border-border">
          <p className="font-display font-bold text-gold text-sm mb-2">{isEs ? "Índice" : "Índex"}</p>
          <ul className="text-xs space-y-1.5">
            <li><a href="#objectiu" className="text-foreground/80 hover:text-gold underline underline-offset-2">{isEs ? "Objetivo del juego" : "Objectiu del joc"}</a></li>
            <li><a href="#valor-cartes" className="text-foreground/80 hover:text-gold underline underline-offset-2">{isEs ? "Valor de las cartas" : "Valor de les cartes"}</a></li>
            <li><a href="#envit" className="text-foreground/80 hover:text-gold underline underline-offset-2">{isEs ? "El Envido" : "L'Envit"}</a></li>
            <li><a href="#truc" className="text-foreground/80 hover:text-gold underline underline-offset-2">{isEs ? "El Truc" : "El Truc"}</a></li>
            <li><a href="#termes" className="text-foreground/80 hover:text-gold underline underline-offset-2">{isEs ? "Términos comunes" : "Termes comuns"}</a></li>
          </ul>
        </nav>

        <div className="flex flex-col gap-6 text-sm text-foreground/90 leading-relaxed">

          {/* Introducció */}
          <section>
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Introducción" : "Introducció"}</h2>
            <p>
              {isEs
                ? "El Truc Valencià es un juego de cartas tradicional del País Valenciano que se juega con la baraja española de 40 cartas (sin ochos ni nueves). Se juega por parejas (2 contra 2), donde los compañeros se sientan enfrentados en la mesa."
                : "El Truc Valencià és un joc de cartes tradicional del País Valencià que es juga amb la baralla espanyola de 40 cartes (sense vuits ni nous). Es juga per parelles (2 contra 2), on els companys s'asseuen enfrontats a la taula."}
            </p>
          </section>

          {/* Objectiu */}
          <section id="objectiu" className="scroll-mt-4">
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Objetivo del juego" : "Objectiu del joc"}</h2>
            {isEs ? (
              <p>
                Ganar la partida acumulando <strong>piedras</strong> (puntos). Una partida se gana cuando se ganan <strong>2 piernas</strong>, o <strong>1 o 3 piernas</strong>, según se decida. Cada pierna se juega a <strong>24 piedras</strong> (12 malas y 12 buenas) o a <strong>18 piedras</strong> (9 malas y 9 buenas), según la configuración. Cada pierna se marca en el marcador y la pareja que primero completa las dos piernas gana.
              </p>
            ) : (
              <p>
                Guanyar la partida acumulant <strong>pedres</strong> (punts). Una partida es guanya quan es guanyen <strong>2 cames</strong>, o <strong>1 o 3 cames</strong>, segons es decidisca. Cada cama es juga a <strong>24 pedres</strong> (12 males i 12 bones) o a <strong>18 pedres</strong> (9 males i 9 bones), segons la configuració. Cada cama es marca al marcador i la parella que primer completa les dues cames guanya.
              </p>
            )}
          </section>

          {/* Repartiment */}
          <section>
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Reparto" : "Repartiment"}</h2>
            {isEs ? (
              <p>
                Se reparten <strong>3 cartas</strong> a cada jugador. El jugador que tiene la <em>mano</em> (primer turno)
                va rotando en sentido antihorario en cada mano.
              </p>
            ) : (
              <p>
                Es reparteixen <strong>3 cartes</strong> a cada jugador. El jugador que té la <em>mà</em> (primer torn)
                va rotant en sentit antihorari a cada mà.
              </p>
            )}
          </section>

          {/* Valor de les cartes */}
          <section id="valor-cartes" className="scroll-mt-4">
            <h2 className="font-display font-bold text-gold text-base mb-1">
              {isEs ? "Valor de las cartas (de mayor a menor)" : "Valor de les cartes (de major a menor)"}
            </h2>
            <div className="bg-card/50 rounded-lg p-3 border border-border">
              {isEs ? (
                <ol className="list-decimal list-inside space-y-0.5 text-xs">
                  <li><strong>As de Espadas</strong> (el 1 de espadas) — la carta más alta</li>
                  <li><strong>As de Bastos</strong> (el 1 de bastos)</li>
                  <li><strong>Siete de Espadas</strong></li>
                  <li><strong>Siete de Oros</strong></li>
                  <li><strong>Treses</strong> (cualquier palo)</li>
                  <li><strong>Sietes</strong> restantes (copas y bastos)</li>
                  <li><strong>Seises</strong> (cualquier palo)</li>
                  <li><strong>Cincos</strong> (cualquier palo)</li>
                  <li><strong>Cuatros</strong> (cualquier palo)</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-0.5 text-xs">
                  <li><strong>As d'Espases</strong> (l'1 d'espases) — la carta més alta</li>
                  <li><strong>As de Bastos</strong> (l'1 de bastos)</li>
                  <li><strong>Set d'Espases</strong></li>
                  <li><strong>Set d'Oros</strong></li>
                  <li><strong>Tresos</strong> (qualsevol palo)</li>
                  <li><strong>Sets</strong> restants (copes i bastos)</li>
                  <li><strong>Sisos</strong> (qualsevol palo)</li>
                  <li><strong>Cincs</strong> (qualsevol palo)</li>
                  <li><strong>Quatres</strong> (qualsevol palo)</li>
                </ol>
              )}
            </div>
          </section>

          {/* Desenvolupament d'una ronda */}
          <section>
            <h2 className="font-display font-bold text-gold text-base mb-1">
              {isEs ? "Desarrollo de una mano" : "Desenvolupament d'una mà"}
            </h2>
            {isEs ? (
              <>
                <p>
                  Cada mano tiene hasta <strong>3 bazas</strong> (rondas). En cada baza, cada jugador echa una carta.
                  Gana la baza quien tira la carta más alta. Si hay empate, gana quien haya ganado la primera baza.
                </p>
                <p className="mt-2">
                  La pareja que gana <strong>2 de 3 bazas</strong> se lleva la mano. Si la primera baza es empate
                  (<em>parda</em>), gana quien gane la segunda. Si las tres bazas son empate, gana la mano.
                </p>
              </>
            ) : (
              <>
                <p>
                  Cada mà té fins a <strong>3 basses</strong> (rondes). A cada bassa, cada jugador tira una carta.
                  Guanya la bassa qui tira la carta més alta. Si hi ha empat, guanya qui haja guanyar la primera bassa.
                </p>
                <p className="mt-2">
                  La parella que guanya <strong>2 de 3 basses</strong> s'endú la mà. Si la primera bassa és empat
                  (<em>parda</em>), guanya qui guanye la segona. Si les tres basses són empat, guanya la mà.
                </p>
              </>
            )}
          </section>

          {/* Envit */}
          <section id="envit" className="scroll-mt-4">
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "El Envido" : "L'Envit"}</h2>
            {isEs ? (
              <>
                <p>
                  Antes de jugar la primera carta, cualquier jugador puede cantar <strong>«¡Envido!»</strong>.
                  El envido es una apuesta paralela sobre el valor de las cartas del mismo palo.
                </p>
                <h3 className="font-display font-bold text-sm mt-2 mb-1">Cómo se calcula el envido</h3>
                <p>
                  Se suman los valores de las <strong>dos cartas del mismo palo</strong> con mayor valor,
                  añadiendo 20. Las figuras (10, 11, 12) valen 0. Si no tienes dos cartas del mismo palo,
                  tu envido es el valor de la carta más alta.
                </p>
                <div className="bg-card/50 rounded-lg p-3 border border-border mt-2">
                  <p className="text-xs"><strong>Ejemplo:</strong> Si tienes el 7 de oros, el 5 de oros y un 3 de copas →
                    Envido = 20 + 7 + 5 = <strong>32</strong>.</p>
                  <p className="text-xs mt-1"><strong>Ejemplo:</strong> Si tienes el Rey de espadas, la Sota de espadas y el 3 de copas →
                    Envido = 20 + 0 + 0 = <strong>20</strong> (las figuras valen 0).</p>
                </div>
                <h3 className="font-display font-bold text-sm mt-2 mb-1">Escala del envido</h3>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  <li><strong>Envido</strong> → vale 2 piedras</li>
                  <li><strong>Vuelvo a envidar</strong> (renvido) → vale 4 piedras</li>
                  <li><strong>Falta envido</strong> → si los dos equipos están en malas, se juegan las piedras que faltan para completar la pierna; si algún equipo está en buenas, se juegan las piedras que le faltan al equipo que más piedras tiene para ganar la pierna.</li>
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  Si el adversario rechaza el envido, la pareja que lo ha cantado gana las piedras del nivel anterior.
                </p>
              </>
            ) : (
              <>
                <p>
                  Abans de jugar la primera carta, qualsevol jugador pot cantar <strong>«Envit!»</strong>.
                  L'envit és una aposta paral·lela sobre el valor de les cartes del mateix palo.
                </p>
                <h3 className="font-display font-bold text-sm mt-2 mb-1">Com es calcula l'envit</h3>
                <p>
                  Es sumen els valors de les <strong>dues cartes del mateix palo</strong> amb major valor,
                  afegint-hi 20. Les figures (10, 11, 12) valen 0. Si no tens dues cartes del mateix palo,
                  el teu envit és el valor de la carta més alta.
                </p>
                <div className="bg-card/50 rounded-lg p-3 border border-border mt-2">
                  <p className="text-xs"><strong>Exemple:</strong> Si tens el 7 d'oros, el 5 d'oros i un 3 de copes →
                    Envit = 20 + 7 + 5 = <strong>32</strong>.</p>
                  <p className="text-xs mt-1"><strong>Exemple:</strong> Si tens el Rei d'espases, la Sota d'espases i el 3 de copes →
                    Envit = 20 + 0 + 0 = <strong>20</strong> (figures valen 0).</p>
                </div>
                <h3 className="font-display font-bold text-sm mt-2 mb-1">Escala d'envit</h3>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  <li><strong>Envit</strong> → val 2 pedres</li>
                  <li><strong>Torne a envidar</strong> (renvit) → val 4 pedres</li>
                  <li><strong>Falta envit</strong> → si els dos equips estan en males, es juguen les pedres que falten per completar la cama; si algun equip està en bones, es juguen les pedres que li falten a l'equip que més pedres té per guanyar la cama.</li>
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  Si l'adversari rebutja l'envit, la parella que l'ha cantat guanya les pedres del nivell anterior.
                </p>
              </>
            )}
          </section>

          {/* Truc */}
          <section id="truc" className="scroll-mt-4">
            <h2 className="font-display font-bold text-gold text-base mb-1">El Truc</h2>
            {isEs ? (
              <>
                <p>
                  En cualquier momento de la mano, un jugador puede cantar <strong>«¡Truc!»</strong>, que sube el valor de la mano:
                </p>
                <ul className="list-disc list-inside text-xs space-y-0.5 mt-1">
                  <li><strong>Truc</strong> → vale 2 piedras</li>
                  <li><strong>Retruc</strong> → vale 3 piedras</li>
                  <li><strong>Cuatro vale</strong> → vale 4 piedras</li>
                  <li><strong>Juego fuera</strong> → toda la partida (todas las piernas para ganar la partida)</li>
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  El equipo contrario puede aceptar, rechazar (pierde las piedras del nivel anterior) o subir.
                  Solo puede subir el truc un jugador del equipo contrario al que lo ha cantado.
                </p>
              </>
            ) : (
              <>
                <p>
                  En qualsevol moment de la mà, un jugador pot cantar <strong>«Truc!»</strong>, que apuja el valor de la mà:
                </p>
                <ul className="list-disc list-inside text-xs space-y-0.5 mt-1">
                  <li><strong>Truc</strong> → val 2 pedres</li>
                  <li><strong>Retruc</strong> → val 3 pedres</li>
                  <li><strong>Quatre val</strong> → val 4 pedres</li>
                  <li><strong>Joc fora</strong> → tota la partida (totes les cames per guanyar la partida)</li>
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  L'equip contrari pot acceptar, rebutjar (perd les pedres del nivell anterior) o pujar.
                  Només pot pujar el truc un jugador de l'equip contrari al que l'ha cantat.
                </p>
              </>
            )}
          </section>

          {/* Senyals */}
          <section>
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Las señas" : "Les senyals"}</h2>
            {isEs ? (
              <>
                <p>
                  Parte fundamental del Truc Valencià. Los compañeros se comunican con <strong>señas faciales</strong> (gestos)
                  para indicar las cartas que tienen. Las señas clásicas son:
                </p>
                <div className="bg-card/50 rounded-lg p-3 border border-border mt-2">
                  <p className="text-xs font-bold text-gold mb-1">Señas del truc</p>
                  <ul className="text-xs space-y-1">
                    <li>🤨 <strong>Levantar las cejas</strong> → tengo el As de Espadas</li>
                    <li>😉 <strong>Guiñar el ojo</strong> → tengo el As de Bastos</li>
                    <li>👅 <strong>Sacar la lengua a la derecha</strong> → tengo el 7 de Espadas</li>
                    <li>👅 <strong>Sacar la lengua a la izquierda</strong> → tengo el 7 de Oros</li>
                    <li>😬 <strong>Morderse el labio</strong> → tengo un tres</li>
                    <li>😑 <strong>Cerrar los ojos</strong> → voy ciego (no tengo señas)</li>
                  </ul>
                  <p className="text-xs font-bold text-gold mt-2 mb-1">Señas del envido</p>
                  <ul className="text-xs space-y-1">
                    <li>😗 <strong>Inflar la boca (carrillos con aire)</strong> → tengo 33</li>
                    <li>💪 <strong>Levantar el hombro derecho</strong> → tengo 32</li>
                    <li>💪 <strong>Levantar el hombro izquierdo</strong> → tengo 31</li>
                  </ul>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  ¡Engañar con las señas (hacer señas falsas) es parte del juego y de la estrategia!
                </p>
              </>
            ) : (
              <>
                <p>
                  Part fonamental del Truc Valencià. Els companys es comuniquen amb <strong>senyals facials</strong> (gestos)
                  per indicar les cartes que tenen. Les senyals clàssiques són:
                </p>
                <div className="bg-card/50 rounded-lg p-3 border border-border mt-2">
                  <p className="text-xs font-bold text-gold mb-1">Senyes del truc</p>
                  <ul className="text-xs space-y-1">
                    <li>🤨 <strong>Alçar les celles</strong> → tinc l'As d'Espases</li>
                    <li>😉 <strong>Picar l'ull</strong> → tinc l'As de Bastos</li>
                    <li>👅 <strong>Traure la llengua a la dreta</strong> → tinc el 7 d'Espases</li>
                    <li>👅 <strong>Traure la llengua a l'esquerra</strong> → tinc el 7 d'Oros</li>
                    <li>😬 <strong>Mossegar-se el llavi</strong> → tinc un tres</li>
                    <li>😑 <strong>Tancar els ulls</strong> → vaig cego (no tinc senyes)</li>
                  </ul>
                  <p className="text-xs font-bold text-gold mt-2 mb-1">Senyes de l'envit</p>
                  <ul className="text-xs space-y-1">
                    <li>😗 <strong>Inflar la boca (carrills amb aire)</strong> → tinc 33</li>
                    <li>💪 <strong>Alçar el muscle dret</strong> → tinc 32</li>
                    <li>💪 <strong>Alçar el muscle esquerre</strong> → tinc 31</li>
                  </ul>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Enganyar amb les senyals (fer senyals falses) és part del joc i de l'estratègia!
                </p>
              </>
            )}
          </section>

          {/* Estratègia bàsica */}
          <section>
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Estrategia básica" : "Estratègia bàsica"}</h2>
            {isEs ? (
              <ul className="list-disc list-inside text-xs space-y-1">
                <li>Comunícate con tu compañero con señas antes de cantar envido o truc.</li>
                <li>El <strong>farol</strong> (engaño) es esencial: cantar truc sin buenas cartas puede hacer que el adversario se retire.</li>
                <li>Controla el marcador: si estás cerca de cerrar la pierna, el «falta envido» o «juego fuera» puede ser decisivo.</li>
                <li>Guarda la mejor carta para la última baza si puedes.</li>
                <li>Observa las señas de los adversarios para intentar detectar qué tienen.</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside text-xs space-y-1">
                <li>Comunica't amb el company amb senyals abans de cantar envit o truc.</li>
                <li>El <strong>farol</strong> (engany) és essencial: cantar truc sense bones cartes pot fer que l'adversari es retire.</li>
                <li>Controla el marcador: si estàs a prop de tancar la cama, el «falta envit» o «joc fora» pot ser decisiu.</li>
                <li>Guarda la millor carta per a l'última bassa si pots.</li>
                <li>Observa les senyals dels adversaris per intentar detectar què tenen.</li>
              </ul>
            )}
          </section>

          {/* Termes comuns */}
          <section id="termes" className="scroll-mt-4">
            <h2 className="font-display font-bold text-gold text-base mb-1">{isEs ? "Términos comunes" : "Termes comuns"}</h2>
            <div className="bg-card/50 rounded-lg p-3 border border-border">
              {isEs ? (
                <dl className="text-xs space-y-1">
                  <div><dt className="inline font-bold">Mano:</dt> <dd className="inline">Jugador que comienza la mano.</dd></div>
                  <div><dt className="inline font-bold">Baza:</dt> <dd className="inline">Cada ronda dentro de una mano (hay hasta 3).</dd></div>
                  <div><dt className="inline font-bold">Pierna:</dt> <dd className="inline">Mitad de la partida (9 o 12 piedras malas y otras tantas buenas).</dd></div>
                  <div><dt className="inline font-bold">Piedra:</dt> <dd className="inline">Punto en el marcador.</dd></div>
                  <div><dt className="inline font-bold">Parda:</dt> <dd className="inline">Empate en una baza.</dd></div>
                  <div><dt className="inline font-bold">Falta:</dt> <dd className="inline">Apostar las piedras que faltan para completar la pierna si los dos equipos están en malas; si algún equipo está en buenas, las piedras que le faltan al equipo que más piedras tiene para ganar la pierna.</dd></div>
                </dl>
              ) : (
                <dl className="text-xs space-y-1">
                  <div><dt className="inline font-bold">Mà:</dt> <dd className="inline">Jugador que comença la mà.</dd></div>
                  <div><dt className="inline font-bold">Bassa:</dt> <dd className="inline">Cada ronda dins d'una mà (hi ha fins a 3).</dd></div>
                  <div><dt className="inline font-bold">Cama:</dt> <dd className="inline">Meitat de la partida (9 o 12 pedres males i altres tantes bones).</dd></div>
                  <div><dt className="inline font-bold">Pedra:</dt> <dd className="inline">Punt al marcador.</dd></div>
                  <div><dt className="inline font-bold">Parda:</dt> <dd className="inline">Empat en una bassa.</dd></div>
                  <div><dt className="inline font-bold">Falta:</dt> <dd className="inline">Apostar les pedres que falten per completar la cama si els dos equips estan en males; si algun equip està en bones, les pedres que li falten a l'equip que més pedres té per guanyar la cama.</dd></div>
                </dl>
              )}
            </div>
          </section>

        </div>

        <div className="h-10" aria-hidden="true" />
      </div>
    </main>
  );
};

export default Regles;