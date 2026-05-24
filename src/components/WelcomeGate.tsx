import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ClientOnly } from "./ClientOnly";
import { usePlayerIdentity, sanitizeName } from "@/hooks/usePlayerIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { FlagCircle } from "@/components/FlagCircle";
import { loadSettings, saveSettings, type GameLanguage } from "@/lib/gameSettings";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";
import { cartasTrucSrc, useCartasTrucReady } from "@/lib/cartasTrucImage";
import { AccountLinkSection } from "@/components/AccountLinkSection";
import { UsernameField } from "@/components/UsernameField";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/lib/playerStats";

/**
 * Pantalla de benvinguda que es mostra la primera vegada que s'obre l'app
 * (quan no hi ha cap nom guardat). Bloqueja la resta de l'aplicació fins que
 * el jugador introdueix i confirma el seu nom.
 */
function WelcomeForm({ onAccept }: { onAccept: (name: string) => void }) {
  const [value, setValue] = useState("");
  const clean = sanitizeName(value);
  const canSubmit = clean.length > 0;
  const t = useT();
  const imageReady = useCartasTrucReady();
  const { user } = useAuth();
  const { profile, reload } = useMyProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const currentSettings = loadSettings();
  const [language, setLanguage] = useState<GameLanguage>(currentSettings.language);

  const handleLanguageChange = (lang: GameLanguage) => {
    setLanguage(lang);
    const s = loadSettings();
    saveSettings({ ...s, language: lang });
  };

  const langOpts: { value: GameLanguage; label: string }[] = [
    { value: "ca", label: "Valencià" },
    { value: "es", label: "Castellano" },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // Desbloqueja el TTS dins d'un gest d'usuari (necessari en mòbil) i
    // precarrega les veus, perquè el primer cant no tingui retard.
    void import("@/lib/speech").then(({ primeSpeech }) => primeSpeech());
    onAccept(clean);
    // Després d'acceptar la benvinguda anem sempre a la pantalla principal,
    // encara que l'usuari hagi acabat aquí venint d'/auth o /ajustes.
    if (location.pathname !== "/") {
      navigate("/", { replace: true });
    }
  };

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-background">
      <form
        onSubmit={submit}
        className="w-full max-w-md flex flex-col items-center gap-6"
        style={{ visibility: imageReady ? "visible" : "hidden" }}
      >
        <header className="text-center">
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
          <p className="mt-4 text-sm text-muted-foreground flex items-center justify-center gap-1">
            <Sparkles className="w-4 h-4 text-primary" />
            {t("welcome.greeting")}
          </p>
        </header>

        <section className="w-full flex flex-col gap-2">
          <label className="text-[10px] font-display tracking-widest uppercase text-primary/85 text-center">
            {t("welcome.language_label")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {langOpts.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleLanguageChange(o.value)}
                aria-pressed={language === o.value}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-center transition-all flex flex-col items-center gap-0.5 leading-tight",
                  language === o.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-primary/25 bg-background/30 text-foreground/80 hover:border-primary/50 hover:bg-primary/10",
                )}
              >
                <span className="inline-flex items-center gap-1.5 font-display font-bold text-xs">
                  <FlagCircle lang={o.value} size={20} />
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="w-full flex flex-col gap-3">
          <label
            htmlFor="welcome-name"
            className="text-sm font-display font-bold text-foreground text-center"
          >
            {t("welcome.name_label")}
          </label>
          <Input
            id="welcome-name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("welcome.name_placeholder")}
            maxLength={24}
            className="h-12 w-full text-center text-lg font-display border-2 border-primary bg-transparent focus-visible:border-primary focus-visible:ring-primary"
          />
          <p className="text-[11px] text-muted-foreground text-center">
            {t("welcome.name_hint")}
          </p>
        </section>

        {user && (
          <section className="w-full flex flex-col gap-2">
            <label className="text-[10px] font-display tracking-widest uppercase text-primary/85 text-center">
              Nom d'usuari públic
            </label>
            <UsernameField
              current={profile?.username ?? null}
              onSaved={() => { void reload(); }}
            />
          </section>
        )}

        <section className="w-full flex flex-col gap-2">
          <label className="text-[10px] font-display tracking-widest uppercase text-primary/85 text-center">
            Vincula el teu compte
          </label>
          <AccountLinkSection />
        </section>

        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold text-lg gold-glow disabled:opacity-50"
        >
          {t("welcome.accept")}
        </Button>
      </form>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { hasName, setName, ready } = usePlayerIdentity();
  const location = useLocation();
  if (!ready) {
    // Mentres es carrega localStorage no mostrem res per evitar un flaix
    // del formulari als jugadors que ja tenen nom guardat.
    return null;
  }
  // Permet accedir a /auth (vincular correu) abans de completar la benvinguda,
  // igual que es pot fer des d'Ajustes.
  const bypass = location.pathname.startsWith("/auth");
  if (!hasName && !bypass) {
    return <WelcomeForm onAccept={setName} />;
  }
  return <>{children}</>;
}

export function WelcomeGate({ children }: { children: ReactNode }) {
  return (
    <ClientOnly fallback={<>{children}</>}>
      <Gate>{children}</Gate>
    </ClientOnly>
  );
}