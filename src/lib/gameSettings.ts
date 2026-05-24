import { useEffect, useState } from "react";
import type { PlayerId } from "@/game/types";
import type { BotDifficulty } from "@/game/profileAdaptation";

/**
 * Preferències de partida solo. Es guarden a localStorage i s'apliquen quan
 * comences una nova partida. El idioma també afecta la selecció de veu TTS.
 */

export type GameLanguage = "ca" | "es";
/** -1 vol dir "aleatori". Altrament, seient (0..3) que comença com a mà. */
export type ManoSetting = -1 | 0 | 1 | 2 | 3;
/** Temps màxim per torn (segons) abans de jugar carta automàticament. */
export type TurnTimeoutSec = 15 | 30 | 45 | 60;

export const TURN_TIMEOUT_OPTS: TurnTimeoutSec[] = [15, 30, 45, 60];

/**
 * Perfil d'honestedat dels bots. Controla el percentatge de faroles i
 * mentides que fan els bots tant quan canten envit/truc com quan
 * responen al seu company:
 *  - sincero  → 0 % (mai farolegen ni menteixen)
 *  - pillo    → 10 %
 *  - mentider → 20 %
 */
export type BotHonesty = "sincero" | "pillo" | "mentider";
export const BOT_HONESTY_OPTS: BotHonesty[] = ["sincero", "pillo", "mentider"];

export function bluffRateOf(h: BotHonesty): number {
  if (h === "pillo") return 0.10;
  if (h === "mentider") return 0.20;
  return 0;
}

export interface GameSettings {
  cames: 1 | 2 | 3;
  /** Piedras per meitat de cama: 9 (=18 totals) o 12 (=24 totals). */
  targetCama: 9 | 12;
  language: GameLanguage;
  mano: ManoSetting;
  turnTimeoutSec: TurnTimeoutSec;
  /** Estil d'aprenentatge dels bots. */
  botDifficulty: BotDifficulty;
  /** Perfil d'honestedat dels bots (faroles i mentides). */
  botHonesty: BotHonesty;
  /** Si està actiu, es reprodueixen veus i efectes de so durant la partida. */
  soundEnabled: boolean;
  /** voiceURI seleccionada per l'usuari (null = automàtica). */
  voiceURI: string | null;
  /** Velocitat de la locució (0.7 .. 1.3). */
  voiceRate: number;
  /** To de la locució (0.5 .. 1.2). */
  voicePitch: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  cames: 2,
  targetCama: 12,
  language: "ca",
  mano: 0,
  turnTimeoutSec: 30,
  botDifficulty: "conservative",
  botHonesty: "sincero",
  soundEnabled: true,
  voiceURI: null,
  voiceRate: 0.85,
  voicePitch: 1.20,
};

const KEY = "truc:settings:v1";

function isTurnTimeout(v: unknown): v is TurnTimeoutSec {
  return v === 15 || v === 30 || v === 45 || v === 60;
}

function isDifficulty(v: unknown): v is BotDifficulty {
  return v === "conservative" || v === "balanced" || v === "aggressive";
}

function isHonesty(v: unknown): v is BotHonesty {
  return v === "sincero" || v === "pillo" || v === "mentider";
}

export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      cames: (parsed.cames === 1 || parsed.cames === 2 || parsed.cames === 3 ? parsed.cames : DEFAULT_SETTINGS.cames),
      targetCama: (parsed.targetCama === 9 || parsed.targetCama === 12 ? parsed.targetCama : DEFAULT_SETTINGS.targetCama),
      language: (parsed.language === "es" || parsed.language === "ca" ? parsed.language : DEFAULT_SETTINGS.language),
      mano: ([-1, 0, 1, 2, 3].includes(parsed.mano as number) ? (parsed.mano as ManoSetting) : DEFAULT_SETTINGS.mano),
      turnTimeoutSec: isTurnTimeout(parsed.turnTimeoutSec) ? parsed.turnTimeoutSec : DEFAULT_SETTINGS.turnTimeoutSec,
      botDifficulty: isDifficulty(parsed.botDifficulty) ? parsed.botDifficulty : DEFAULT_SETTINGS.botDifficulty,
      botHonesty: isHonesty(parsed.botHonesty) ? parsed.botHonesty : DEFAULT_SETTINGS.botHonesty,
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : DEFAULT_SETTINGS.voiceURI,
      voiceRate: typeof parsed.voiceRate === "number" && parsed.voiceRate >= 0.7 && parsed.voiceRate <= 1.3 ? parsed.voiceRate : DEFAULT_SETTINGS.voiceRate,
      voicePitch: typeof parsed.voicePitch === "number" && parsed.voicePitch >= 0.5 && parsed.voicePitch <= 1.2 ? parsed.voicePitch : DEFAULT_SETTINGS.voicePitch,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: GameSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    // Invalida la cache de veu perquè la propera locució trie segons l'idioma.
    // També aplica l'estat de so global (mute si l'usuari l'ha desactivat).
    import("./speech").then((m) => {
      m.resetVoiceCache?.();
      m.setMuted?.(!s.soundEnabled);
      m.setVoicePreferences?.({ voiceURI: s.voiceURI, rate: s.voiceRate, pitch: s.voicePitch });
    }).catch(() => {});
    // Notifica el canvi d'idioma a la capa i18n perquè totes les vistes
    // es re-renderitzen amb el text traduït.
    import("@/i18n/useT")
      .then((m) => m.notifyLanguageChanged?.(s.language))
      .catch(() => {});
  } catch {
    /* noop */
  }
}

/** Resol la mà inicial: si és aleatori, escull un seient a l'atzar. */
export function resolveInitialMano(setting: ManoSetting): PlayerId {
  if (setting === -1) return Math.floor(Math.random() * 4) as PlayerId;
  return setting as PlayerId;
}

/** Hook reactiu per llegir/escriure settings. */
export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    // Aplica l'estat de so global i preferències de veu en arrencar.
    import("./speech").then((m) => {
      m.setMuted?.(!loaded.soundEnabled);
      m.setVoicePreferences?.({ voiceURI: loaded.voiceURI, rate: loaded.voiceRate, pitch: loaded.voicePitch });
    }).catch(() => {});
    setReady(true);
  }, []);

  const update = (patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  return { settings, update, ready };
}