import { useNavigate } from "@/lib/router-shim";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { useGameSettings, type GameLanguage, TURN_TIMEOUT_OPTS, type BotHonesty } from "@/lib/gameSettings";
import type { BotDifficulty } from "@/game/profileAdaptation";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useAdminPassword } from "@/hooks/useAdminPassword";
import { PlayerNameField } from "@/online/PlayerNameField";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ShieldCheck,
  LogOut,
  Trash2,
  ShieldAlert,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";
import { FlagCircle } from "@/components/FlagCircle";
import { useState } from "react";
import { Link } from "@/lib/router-shim";
import { requestAccountDeletion, wipeLocalDeviceData } from "@/lib/deleteAccount";
import { APP_VERSION } from "@/lib/appVersion";
import { toast } from "sonner";
import { AccountLinkSection } from "@/components/AccountLinkSection";
import { ShareAppButton } from "@/components/ShareAppButton";
import { EndGameOverlay } from "@/components/truc/EndGameOverlay";
import type { PlayerId, TeamId } from "@/game/types";

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function AjustesPage() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Ajustes />
    </ClientOnly>
  );
}

function Ajustes() {
  const navigate = useNavigate();
  const t = useT();
  const { settings, update, ready } = useGameSettings();
  const { deviceId, name, setName, ready: identityReady } = usePlayerIdentity();
  const { password: adminPassword, setPassword: setAdminPassword, ready: adminReady } = useAdminPassword();
  const [previewEndGame, setPreviewEndGame] = useState<TeamId | null>(null);
  if (!ready || !identityReady || !adminReady) return <Loading />;

  const camesOpts = [
    { value: 1 as const, label: t("settings.cames.1"), hint: t("settings.cames.1.hint") },
    { value: 2 as const, label: t("settings.cames.2"), hint: t("settings.cames.2.hint") },
    { value: 3 as const, label: t("settings.cames.3"), hint: t("settings.cames.3.hint") },
  ];

  const piedrasOpts = [
    { value: 9 as const, label: t("settings.piedras.18"), hint: t("settings.piedras.18.hint") },
    { value: 12 as const, label: t("settings.piedras.24"), hint: t("settings.piedras.24.hint") },
  ];

  const langOpts: { value: GameLanguage; label: string }[] = [
    { value: "ca", label: t("settings.language.ca") },
    { value: "es", label: t("settings.language.es") },
  ];

  // Nota: l'opció "qui comença" ha sigut eliminada. A partir d'ara la mà
  // inicial sempre s'escull aleatòriament, tant en partides offline com online.

  const difficultyOpts: { value: BotDifficulty; label: string; hint: string }[] = [
    { value: "conservative", label: t("settings.difficulty.conservative"), hint: t("settings.difficulty.conservative.hint") },
    { value: "balanced", label: t("settings.difficulty.balanced"), hint: t("settings.difficulty.balanced.hint") },
    { value: "aggressive", label: t("settings.difficulty.aggressive"), hint: t("settings.difficulty.aggressive.hint") },
  ];

  const honestyOpts: { value: BotHonesty; label: string; hint: string }[] = [
    { value: "sincero", label: t("settings.honesty.sincero"), hint: t("settings.honesty.sincero.hint") },
    { value: "pillo", label: t("settings.honesty.pillo"), hint: t("settings.honesty.pillo.hint") },
    { value: "mentider", label: t("settings.honesty.mentider"), hint: t("settings.honesty.mentider.hint") },
  ];

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-4 py-5">
      <div className="w-full max-w-md flex flex-col gap-3">
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
          <h1 className="font-title font-black italic text-gold text-2xl text-center pr-1.5">{t("settings.title")}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("settings.subtitle")}</p>
        </header>

        <Section title={t("settings.your_name")}>
          <PlayerNameField name={name} onChange={setName} label={t("settings.player_name_label")} />
          <p className="text-[10px] text-muted-foreground mt-1">{t("settings.player_name_hint")}</p>
        </Section>

        <Section title={t("settings.your_account")}>
          <Button asChild variant="outline" className="w-full justify-start border-primary/40 text-primary hover:bg-primary/10">
            <Link to="/perfil">
              <User className="w-4 h-4 mr-2" />
              El meu perfil
            </Link>
          </Button>
          <AccountLinkSection />
        </Section>

        <Section title={t("settings.language")}>
          <div className="grid grid-cols-2 gap-2">
            {langOpts.map((o) => (
              <Chip
                key={o.value}
                selected={settings.language === o.value}
                onClick={() => update({ language: o.value })}
                label={o.label}
                hint=""
                leading={<FlagCircle lang={o.value} size={20} />}
              />
            ))}
          </div>
        </Section>

        <Section title={t("settings.cames_to_win")}>
          <div className="grid grid-cols-3 gap-2">
            {camesOpts.map((o) => (
              <Chip key={o.value} selected={settings.cames === o.value} onClick={() => update({ cames: o.value })} label={o.label} hint={o.hint} />
            ))}
          </div>
        </Section>

        <Section title={t("settings.piedras_per_cama")}>
          <div className="grid grid-cols-2 gap-2">
            {piedrasOpts.map((o) => (
              <Chip key={o.value} selected={settings.targetCama === o.value} onClick={() => update({ targetCama: o.value })} label={o.label} hint={o.hint} />
            ))}
          </div>
        </Section>

        <Section title={t("settings.turn_timeout")}>
          <div className="grid grid-cols-4 gap-2">
            {TURN_TIMEOUT_OPTS.map((sec) => (
              <Chip
                key={sec}
                selected={settings.turnTimeoutSec === sec}
                onClick={() => update({ turnTimeoutSec: sec })}
                label={`${sec}s`}
                hint=""
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{t("settings.turn_timeout.hint")}</p>
        </Section>

        <Section title={t("settings.sound")}>
          <div className="grid grid-cols-2 gap-2">
            <Chip
              selected={settings.soundEnabled === true}
              onClick={() => update({ soundEnabled: true })}
              label={t("settings.sound.on")}
              hint={t("settings.sound.on.hint")}
            />
            <Chip
              selected={settings.soundEnabled === false}
              onClick={() => update({ soundEnabled: false })}
              label={t("settings.sound.off")}
              hint={t("settings.sound.off.hint")}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{t("settings.sound.hint")}</p>
        </Section>

        <Section title={t("settings.difficulty")}>
          <div className="grid grid-cols-3 gap-2">
            {difficultyOpts.map((o) => {
              const disabled = o.value === "balanced" || o.value === "aggressive";
              return (
                <Chip
                  key={o.value}
                  selected={settings.botDifficulty === o.value}
                  onClick={() => update({ botDifficulty: o.value })}
                  label={o.label}
                  hint={o.hint}
                  disabled={disabled}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{t("settings.difficulty.hint")}</p>
        </Section>

        <Section title={t("settings.honesty")}>
          <div className="grid grid-cols-3 gap-2">
            {honestyOpts.map((o) => {
              const disabled = o.value === "pillo" || o.value === "mentider";
              return (
                <Chip
                  key={o.value}
                  selected={settings.botHonesty === o.value}
                  onClick={() => update({ botHonesty: o.value })}
                  label={o.label}
                  hint={o.hint}
                  disabled={disabled}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{t("settings.honesty.hint")}</p>
        </Section>



        {false && (
          <Section title={t("settings.admin")}>
            <div className="flex items-center gap-2">
              <ShieldCheck className={cn("w-4 h-4 shrink-0", adminPassword ? "text-team-nos" : "text-muted-foreground")} />
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={t("settings.admin.placeholder")}
                autoComplete="off"
                className="bg-background/40 border-primary/30"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{t("settings.admin.hint")}</p>
          </Section>
        )}

        <Section title={t("settings.privacy_data")}>
          <DataPrivacyBlock deviceId={deviceId} />
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="text-[10px] font-display tracking-widest uppercase text-primary/85">{title}</div>
      {children}
    </section>
  );
}

/**
 * Bloc de privacitat i dades. Mostra:
 *  - L'identificador anònim del dispositiu (per copiar i fer-lo servir
 *    a la pàgina pública /esborrar-dades si algun dia desinstal·les l'app).
 *  - Enllaços a la Política de Privacitat (requeriment Play Store).
 *  - Botó "Esborrar les meues dades" → crida `delete-account` i neteja
 *    el localStorage. Amb confirmació explícita per evitar accidents.
 */
function DataPrivacyBlock({ deviceId }: { deviceId: string }) {
  const t = useT();
  const [step, setStep] = useState<"idle" | "confirm" | "deleting" | "done">("idle");

  async function handleDelete() {
    if (!deviceId) return;
    setStep("deleting");
    try {
      const r = await requestAccountDeletion({ deviceId });
      const totals =
        Object.values(r.deleted).reduce((a, b) => a + b, 0) +
        Object.values(r.anonymized).reduce((a, b) => a + b, 0);
      wipeLocalDeviceData();
      setStep("done");
      toast.success(
        totals > 0
          ? t("settings.delete_processed", { n: totals })
          : t("settings.delete_no_server"),
      );
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.href = "/";
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(`${t("settings.delete_failed")}: ${msg}`);
      setStep("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-primary/20 bg-background/40 p-2 text-[11px] text-muted-foreground">
        <div className="font-medium text-foreground/80 mb-0.5">
          {t("settings.device_id_label")}
        </div>
        <code className="break-all text-[10px]">{deviceId || "—"}</code>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <Link to="/privacitat" className="underline text-primary">
          {t("common.privacy_policy")}
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/esborrar-dades" className="underline text-primary">
          {t("settings.deletion_page")}
        </Link>
      </div>

      {step === "idle" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStep("confirm")}
          disabled={!deviceId}
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          {t("settings.delete_my_data")}
        </Button>
      )}

      {step === "confirm" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 flex flex-col gap-2">
          <p className="text-[11px] flex items-center gap-1.5 text-destructive">
            <ShieldAlert className="w-3.5 h-3.5" />
            {t("settings.delete_irreversible")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("idle")}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      )}

      {step === "deleting" && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("settings.deleting")}
        </div>
      )}

      {step === "done" && (
        <div className="text-[11px] text-team-nos">{t("settings.delete_done")}</div>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  label,
  hint,
  leading,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  leading?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={cn(
        "rounded-md border px-2 py-1.5 text-center transition-all flex flex-col items-center gap-0.5 leading-tight",
        selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-primary/25 bg-background/30 text-foreground/80 hover:border-primary/50 hover:bg-primary/10",
        disabled && "opacity-40 cursor-not-allowed hover:border-primary/25 hover:bg-background/30",
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-display font-bold text-xs">
        {leading}
        {label}
      </span>
      {hint && <span className="chip-hint text-[9px] text-muted-foreground normal-case tracking-normal">{hint}</span>}
    </button>
  );
}
function VoiceSection(_: {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  onChange: (patch: { voiceURI?: string | null; voiceRate?: number; voicePitch?: number }) => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.voice_section")}>
      <AudioPreviewGrid />
    </Section>
  );
}

const SHOUT_KEYS = [
  "truc", "retruc", "quatre", "joc-fora",
  "envit", "renvit", "falta-envit",
  "vull", "no-vull",
  "truc-passe",
] as const;

const SHOUT_LABELS: Record<string, string> = {
  truc: "Truc", retruc: "Retruc", quatre: "Quatre", "joc-fora": "Joc fora",
  envit: "Envit", renvit: "Renvit", "falta-envit": "Falta envit",
  vull: "Vull", "no-vull": "No vull",
  "truc-passe": "Truc i passe",
};

function AudioPreviewGrid() {
  const play = async (key: string, lang: "ca" | "es") => {
    const { getShoutAudioUrl } = await import("@/lib/shoutAudio");
    const url = await getShoutAudioUrl(key as never, lang);
    if (!url) return;
    const a = new Audio(url);
    a.play().catch(() => {});
  };
  const download = async (key: string, lang: "ca" | "es") => {
    const { getShoutAudioUrl, SHOUT_AUDIO_URLS } = await import("@/lib/shoutAudio");
    const url = (await getShoutAudioUrl(key as never, lang)) ?? SHOUT_AUDIO_URLS[key as never]?.[lang];
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${key}_${lang}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="mt-4 rounded-md border border-primary/20 bg-background/40 p-3">
      <p className="text-[11px] font-bold text-primary mb-2">🔊 Preview audios pregravats</p>
      <div className="flex flex-col gap-1.5">
        {SHOUT_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-foreground/80 w-24 shrink-0">{SHOUT_LABELS[key]}</span>
            <button
              type="button"
              onClick={() => play(key, "ca")}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10"
            >
              🇪🇸 Val
            </button>
            <button
              type="button"
              onClick={() => download(key, "ca")}
              title="Descarregar valencià"
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10"
            >
              ⬇
            </button>
            <button
              type="button"
              onClick={() => play(key, "es")}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10"
            >
              🇪🇸 Cast
            </button>
            <button
              type="button"
              onClick={() => download(key, "es")}
              title="Descargar castellano"
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/10"
            >
              ⬇
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AjustesPage;