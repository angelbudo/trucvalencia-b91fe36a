import { Link } from "@/lib/router-shim";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Trash2, Users, LogIn, Settings as SettingsIcon, Wifi, BookOpen } from "lucide-react";
import { primeSpeech } from "@/lib/speech";
import { hasSavedMatch, clearSavedMatch } from "@/hooks/useTrucMatch";
import { loadSettings, resolveInitialMano } from "@/lib/gameSettings";
import { useMyActiveRooms } from "@/online/useMyActiveRooms";
import { useT } from "@/i18n/useT";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { cartasTrucSrc, useCartasTrucReady } from "@/lib/cartasTrucImage";

const Index = () => {
  
  const t = useT();
  const { name: playerName } = usePlayerIdentity();
  const imageReady = useCartasTrucReady();
  const [hasSaved, setHasSaved] = useState(false);
  const { rooms: activeOnlineRooms } = useMyActiveRooms();
  const [startSearch, setStartSearch] = useState<{ cames: number; mano: number; targetCama: number }>({
    cames: 2,
    mano: 0,
    targetCama: 12,
  });

  useEffect(() => {
    setHasSaved(hasSavedMatch());
    const s = loadSettings();
    setStartSearch({
      cames: s.cames,
      // El jugador que comença sempre és aleatori (l'opció ha sigut eliminada).
      mano: resolveInitialMano(-1),
      targetCama: s.targetCama,
    });
  }, []);

  const unlockAudio = useCallback(() => {
    const utterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(utterance);
    primeSpeech();
  }, []);

  const baseQS = `cames=${startSearch.cames}&mano=${startSearch.mano}&targetCama=${startSearch.targetCama}`;
  const newGameLink = `/partida?${baseQS}`;
  const resumeLink = `/partida?${baseQS}&resume=1`;

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-10" onClick={unlockAudio}>
      <div
        className="w-full max-w-md flex flex-col items-center gap-7"
        style={{ visibility: imageReady ? "visible" : "hidden" }}
      >
        <header className="text-center" style={{ marginTop: "-15px" }}>
          <div className="flex items-center justify-center gap-0">
            <img
              src={cartasTrucSrc}
              alt=""
              aria-hidden="true"
              className="h-28 w-auto select-none pointer-events-none -mr-[10px] -translate-x-[10px]"
            />
            <h1 className="font-title font-black italic text-gold text-5xl leading-none normal-case text-center tracking-tighter [font-stretch:condensed] -ml-[10px]">
              Truc Valencià
            </h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {playerName ? `${playerName}, ` : ""}
            {playerName
              ? t("home.subtitle").charAt(0).toLowerCase() + t("home.subtitle").slice(1)
              : t("home.subtitle")}
          </p>
        </header>

        {activeOnlineRooms.length > 0 && (
          <section className="w-full flex flex-col gap-2">
            {activeOnlineRooms.map((room) => (
              <Button
                key={room.id}
                asChild
                size="lg"
                className="w-full h-12 bg-team-nos text-white hover:bg-team-nos/90 font-display font-bold"
              >
                <Link to={`/online/partida/${room.code}`}>
                  <Wifi className="w-4 h-4 mr-2" />
                  {t("home.resume_online", { code: room.code })}
                </Link>
              </Button>
            ))}
            <p className="self-center text-[11px] text-muted-foreground text-center">
              {t("home.online_in_progress")}
            </p>
          </section>
        )}

        {hasSaved && (
          <section className="w-full flex flex-col gap-2">
            <Button asChild size="lg" className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 font-display font-bold">
              <Link to={resumeLink}>
                <RotateCcw className="w-4 h-4 mr-2" />
                {t("home.continue_last")}
              </Link>
            </Button>
            <button
              type="button"
              onClick={() => { clearSavedMatch(); setHasSaved(false); }}
              className="self-center inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {t("home.delete_saved")}
            </button>
          </section>
        )}

        <section className="w-full flex flex-col gap-3">
          <h2 className="text-center font-title font-black italic text-gold text-base">
            {t("home.section.online")}
          </h2>
          <Button asChild size="lg" className="min-h-14 h-auto px-2 py-2 bg-orange-500 text-background hover:bg-orange-500/90 font-display font-bold whitespace-normal gap-1 shadow-[0_4px_16px_-2px_hsl(28_85%_55%/0.55),0_0_24px_hsl(28_85%_60%/0.3)]">
            <Link to="/online/sales">
              <Users className="w-4 h-4 shrink-0" />
              <span className="line-clamp-2 text-center leading-tight text-[17px]">{t("home.see_tables")}</span>
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild size="lg" className="min-h-12 h-auto px-2 py-2 bg-team-nos text-background hover:bg-team-nos/90 font-display font-bold whitespace-nowrap gap-1 text-sm sm:text-base tracking-tight">
              <Link to="/online/nou">
                <Users className="w-4 h-4 shrink-0" />
                <span className="leading-tight text-center truncate">
                  {t("home.create_table")}
                </span>
              </Link>
            </Button>
            <Button asChild size="lg" className="min-h-12 h-auto px-2 py-2 bg-accent text-accent-foreground hover:bg-accent/90 font-display font-bold whitespace-normal gap-1 text-sm sm:text-base tracking-tight">
              <Link to="/online/unir">
                <LogIn className="w-4 h-4 shrink-0" />
                <span className="leading-tight text-center whitespace-pre-line">
                  {t("home.join_with_code_short")}
                </span>
              </Link>
            </Button>
          </div>
        </section>

        <section className="w-full flex flex-col gap-3">
          <h2 className="text-center font-title font-black italic text-gold text-base">
            {t("home.section.solo")}
          </h2>
          <Button
            asChild
            size="lg"
            className="w-full min-h-14 h-auto py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold text-lg gold-glow whitespace-normal"
            onClick={() => clearSavedMatch()}
          >
            <Link to={newGameLink}>
              <Play className="w-5 h-5 mr-2 shrink-0" />
              <span className="line-clamp-2 text-center leading-tight">{t("home.play_vs_bots")}</span>
            </Link>
          </Button>
        </section>

        <div className="w-full flex flex-col gap-2" style={{ marginTop: "12px" }}>
          <Button asChild size="lg" variant="outline" className="w-full h-12 border-2 border-primary/60 text-primary hover:bg-primary/10 font-display font-bold">
            <Link to="/ajustes">
              <SettingsIcon className="w-4 h-4 mr-2" />
              {t("home.settings")}
            </Link>
          </Button>

          <Button asChild size="lg" variant="outline" className="w-full h-12 border-2 border-primary/60 text-primary hover:bg-primary/10 font-display font-bold">
            <Link to="/regles">
              <BookOpen className="w-4 h-4 mr-2" />
              {t("home.rules")}
            </Link>
          </Button>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground" style={{ marginTop: "-18px" }}>
          <Link
            to="/privacitat"
            className="hover:text-primary underline underline-offset-4 transition-colors"
          >
            {t("home.privacy")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/termes"
            className="hover:text-primary underline underline-offset-4 transition-colors"
          >
            {t("home.terms")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/avis-legal"
            className="hover:text-primary underline underline-offset-4 transition-colors"
          >
            {t("home.legal_notice")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/cookies"
            className="hover:text-primary underline underline-offset-4 transition-colors"
          >
            {t("home.cookies")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/reportar"
            className="hover:text-primary underline underline-offset-4 transition-colors"
          >
            {t("home.report")}
          </Link>
        </nav>
      </div>
    </main>
  );
};


export default Index;