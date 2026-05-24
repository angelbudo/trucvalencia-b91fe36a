/**
 * Locucions per a accions de cant (truc, envit, etc.) usant la
 * Web Speech API del navegador. No requereix backend ni claus.
 *
 * Estratègia de millora:
 *  - Triem la millor veu disponible: prioritzem veus "neural / natural /
 *    premium / online / enhanced" modernes (Microsoft Natural, Google,
 *    Apple enhanced) que sonen molt més humanes que les compactes.
 *  - Preferim veus masculines amb timbre ferm.
 *  - Apliquem prosòdia per tipus de cant (truc/envit/vull...) ajustant
 *    rate, pitch i pauses perquè soni com una crida real, no monòtona.
 *  - Reintents quan la llista de veus encara no ha carregat (Chrome
 *    sovint l'omple de forma asíncrona).
 */

// Estat global de mute per a totes les locucions
let isMuted = false;

export function getMuted(): boolean {
  return isMuted;
}

export function setMuted(muted: boolean): void {
  isMuted = muted;
  if (muted) cancelSpeech();
}

export function toggleMuted(): boolean {
  setMuted(!isMuted);
  return isMuted;
}

const SHOUT_TEXT_CA: Record<string, string> = {
  truc: "Truque!",
  retruc: "Retruque!",
  quatre: "Quatre val!",
  "joc-fora": "Joc fora!",
  envit: "Envide!",
  renvit: "Torne a envidar!",
  "falta-envit": "Envide la Falta!",
  vull: "Vull!",
  "no-vull": "No vull!",
};

const SHOUT_TEXT_ES: Record<string, string> = {
  truc: "¡Truco!",
  retruc: "¡Retruco!",
  quatre: "¡Vale Cuatro!",
  "joc-fora": "¡Juego fuera!",
  envit: "¡Envido!",
  renvit: "¡Vuelvo a envidar!",
  "falta-envit": "¡Envido la falta!",
  vull: "¡Quiero!",
  "no-vull": "¡No quiero!",
};

// Pistes per detectar veus masculines (els navegadors no exposen el gènere
// directament, però el nom de la veu sol indicar-ho).
const MALE_HINTS = [
  "male", "hombre", "masculin", "masculí",
  // ES
  "diego", "jorge", "carlos", "pablo", "enrique", "miguel", "juan",
  "alvaro", "álvaro", "dario", "darío", "gonzalo",
  // CA / VAL
  "pau", "jordi", "arnau", "marc", "roger", "david", "daniel", "enric",
  "vicent", "ferran", "joan", "guillem", "oriol", "biel", "pere",
  // Microsoft Neural / Apple
  "thomas", "elias", "tomas", "tomás",
];
const FEMALE_HINTS = [
  "female", "mujer", "femen", "femení",
  "monica", "mónica", "paulina", "marisol", "esperanza", "laura",
  "helena", "nuria", "núria", "montserrat", "sara", "elvira", "lucia",
  "lucía", "ximena", "abril", "dalia", "renata",
  "alba", "joana", "empar", "mar",
];

// Pistes de qualitat: noms que solen indicar veus de "nova generació".
const HIGH_QUALITY_HINTS = [
  "neural", "natural", "online", "premium", "enhanced",
  "microsoft", "google", "siri", "wavenet",
];

// Pistes valencianes/baleàriques per donar més puntuació quan l'idioma és català.
const VALENCIAN_HINTS = ["valencia", "valencià", "valenciana", "balear", "mallorqu"];

let cachedVoice: SpeechSynthesisVoice | null = null;

// Preferències de l'usuari (es sobreescriuen des de gameSettings).
let userVoiceURI: string | null = null;
let userRateMul = 1.0;   // multiplicador sobre la rate del perfil
let userPitchMul = 1.0;  // multiplicador sobre el pitch del perfil

export function setVoicePreferences(p: { voiceURI: string | null; rate: number; pitch: number }) {
  userVoiceURI = p.voiceURI ?? null;
  userRateMul = p.rate / 1.05;
  userPitchMul = p.pitch / 0.85;
  cachedVoice = null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Llista totes les veus disponibles (filtrades per qualitat ca/es). */
export async function listVoices(): Promise<SpeechSynthesisVoice[]> {
  const all = await ensureVoicesReady();
  return all
    .filter((v) => /^ca|^es/i.test(v.lang))
    .sort((a, b) => scoreVoice(b, getPreferredLang()) - scoreVoice(a, getPreferredLang()));
}

/** Retorna la veu que s'usaria ara mateix (respectant userVoiceURI) o null. */
export async function getActiveVoice(): Promise<SpeechSynthesisVoice | null> {
  await ensureVoicesReady();
  return pickVoice();
}

function getPreferredLang(): "ca" | "es" {
  if (typeof window === "undefined") return "ca";
  try {
    const raw = window.localStorage.getItem("truc:settings:v1");
    if (!raw) return "ca";
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language === "es" ? "es" : "ca";
  } catch {
    return "ca";
  }
}

function scoreVoice(v: SpeechSynthesisVoice, preferred: "ca" | "es"): number {
  const name = v.name.toLowerCase();
  let score = 0;

  // Idioma
  if (preferred === "ca") {
    if (/^ca/i.test(v.lang)) score += 120;
    else if (/^es/i.test(v.lang)) score += 70;
  } else {
    if (/^es/i.test(v.lang)) score += 120;
    else if (/^ca/i.test(v.lang)) score += 70;
  }

  // Qualitat (neural, natural, online, premium, enhanced...)
  for (const h of HIGH_QUALITY_HINTS) {
    if (name.includes(h)) score += 25;
  }
  // Bonus extra si combina varis senyals d'alta qualitat
  if (name.includes("neural") || name.includes("natural")) score += 25;

  // Gènere masculí preferit (molt prioritari)
  if (MALE_HINTS.some((h) => name.includes(h))) score += 80;
  if (FEMALE_HINTS.some((h) => name.includes(h))) score -= 80;

  // Bonus per veus valencianes/baleàriques quan l'idioma preferit és català
  if (preferred === "ca" && VALENCIAN_HINTS.some((h) => name.includes(h))) score += 30;

  // Penalitza veus "compactes" velles d'Apple
  if (name.includes("compact")) score -= 30;

  // Default del sistema sol ser de qualitat raonable
  if (v.default) score += 5;

  return score;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Si l'usuari ha triat una veu específica, respecta-la sempre que existeixi.
  if (userVoiceURI) {
    const chosen = voices.find((v) => v.voiceURI === userVoiceURI);
    if (chosen) {
      cachedVoice = chosen;
      return cachedVoice;
    }
  }
  const preferred = getPreferredLang();
  const sorted = [...voices].sort((a, b) => scoreVoice(b, preferred) - scoreVoice(a, preferred));
  cachedVoice = sorted[0] ?? null;
  return cachedVoice;
}

/** Invalida la veu cachejada perquè es torni a triar segons l'idioma. */
export function resetVoiceCache() {
  cachedVoice = null;
  voicesReady = null;
}

/**
 * Promesa que es resol quan la llista de veus està disponible.
 * Chrome la carrega de forma asíncrona (`onvoiceschanged`); Safari/Firefox
 * la solen tenir síncronament. Polling com a xarxa de seguretat per si
 * `onvoiceschanged` no es dispara mai.
 */
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function ensureVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReady) return voicesReady;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    voicesReady = Promise.resolve([]);
    return voicesReady;
  }
  const synth = window.speechSynthesis;
  voicesReady = new Promise((resolve) => {
    const initial = synth.getVoices();
    if (initial && initial.length) {
      resolve(initial);
      return;
    }
    let settled = false;
    const finish = (list: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      synth.removeEventListener?.("voiceschanged", onChange);
      resolve(list);
    };
    const onChange = () => {
      const list = synth.getVoices();
      if (list && list.length) finish(list);
    };
    synth.addEventListener?.("voiceschanged", onChange);
    // Polling de seguretat (alguns Chromium no disparen l'event fins a
    // la primera locució). Cada 100ms durant 3 segons com a màxim.
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const list = synth.getVoices();
      if (list && list.length) finish(list);
      else if (attempts >= 30) finish([]); // rendeix-te i deixa lang per defecte
    }, 100);
  });
  return voicesReady;
}

/**
 * Crida-la des d'un gest de l'usuari (clic a "Començar partida", "Mute"
 * toggle, etc.) per "desbloquejar" el TTS i forçar la càrrega de veus.
 * En navegadors mòbils, fer una primera locució buida durant un gest
 * d'usuari permet que les locucions posteriors siguin immediates.
 */
let primed = false;

export function primeSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  // Força la inicialització del motor TTS amb una utterance silenciosa.
  try {
    synth.cancel();
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    warm.rate = 1;
    synth.speak(warm);
  } catch { /* noop */ }
  // Inicia (o reutilitza) la promesa de veus i precachea la triada.
  void ensureVoicesReady().then(() => {
    cachedVoice = null;
    pickVoice();
  });

  // Android WebView sovint no carrega les veus fins que es fan múltiples
  // intents. Reintentem cada 500ms fins a 10s després del primer prime.
  if (!primed) {
    primed = true;
    let retries = 0;
    const retryInterval = setInterval(() => {
      retries++;
      const voices = synth.getVoices();
      if ((voices && voices.length) || retries >= 20) {
        clearInterval(retryInterval);
        if (voices && voices.length) {
          cachedVoice = null;
          voicesReady = null;
          void ensureVoicesReady().then(() => pickVoice());
        }
        return;
      }
      // Re-trigger amb una utterance silenciosa per despertar el motor
      try {
        synth.cancel();
        const ping = new SpeechSynthesisUtterance(" ");
        ping.volume = 0;
        synth.speak(ping);
      } catch { /* noop */ }
    }, 500);
  }
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
  // Inicia la càrrega asíncrona des del primer moment.
  void ensureVoicesReady().then(() => pickVoice());
}

/**
 * Prosòdia específica segons el tipus de cant. Retorna paràmetres de la
 * Web Speech API i una versió textual amb pauses/èmfasi per controlar
 * el ritme. La majoria de motors TTS respecten els signes de
 * puntuació per fer pauses curtes (",") i mitjanes ("."), i el "!"
 * dona entonació exclamativa.
 */
interface SpeechProfile {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}

function profileFor(what: string, baseText: string): SpeechProfile {
  const clean = baseText.replace(/!+$/g, "").trim();
  // Defaults: exclamació enèrgica
  let rate = 1.05;
  let pitch = 0.85;
  let text = `¡${clean}!`;

  switch (what) {
    case "truc":
      // Curt, sec, contundent
      rate = 1.05; pitch = 0.75;
      text = `¡${clean}!`;
      break;
    case "retruc":
      // Una mica més agut i ràpid, com pujant l'aposta
      rate = 1.1; pitch = 0.9;
      text = `¡${clean}!`;
      break;
    case "quatre":
      // Triomfal, més greu i marcat
      rate = 0.95; pitch = 0.7;
      text = `¡${clean}!`;
      break;
    case "joc-fora":
      // Solemne, lent
      rate = 0.9; pitch = 0.7;
      text = `¡${clean}!`;
      break;
    case "envit":
      // Provocador, una mica pujat
      rate = 1.1; pitch = 0.9;
      text = `¡${clean}!`;
      break;
    case "renvit":
      // Encara més pujat i ràpid
      rate = 1.15; pitch = 0.95;
      text = `¡${clean}!`;
      break;
    case "falta-envit":
      // L'aposta màxima: dues parts amb pausa breu
      rate = 1.0; pitch = 0.85;
      text = `¡${clean}!`;
      break;
    case "vull":
      // Acceptació decidida, curta i greu
      rate = 1.0; pitch = 0.7;
      text = `¡${clean}!`;
      break;
    case "no-vull":
      // Rebuig clar
      rate = 1.0; pitch = 0.75;
      text = `¡${clean}!`;
      break;
    default:
      break;
  }

  return { text, rate, pitch, volume: 1.0 };
}

/**
 * Locuta el text donat amb molt d'ímpetu, com una exclamació.
 */
/**
 * Adapta paraules catalanes/valencianes a una grafia que un TTS castellà
 * pronuncia de forma propera al so original. Substitucions cas-insensitives
 * però preservant la capitalització de la primera lletra.
 */
const PHONETIC_MAP: Array<[RegExp, string]> = [
  [/\bvull\b/gi, "vull"],          // ya sona bé en es-ES (v→b, ll→y)
  [/\bno vull\b/gi, "no vull"],
  [/\benvit\b/gi, "envit"],
  [/\brenvit\b/gi, "rrenvit"],
  [/\bfalta envit\b/gi, "falta envit"],
  [/\btruc\b/gi, "truc"],
  [/\bretruc\b/gi, "rretruc"],
  [/\bquatre val\b/gi, "cuatre val"],
  [/\bjoc fora\b/gi, "yoc fora"],
  [/\btinc\b/gi, "tinc"],
  [/\bsí\b/gi, "sí"],
  [/\bvine a mi\b/gi, "bine a mi"],
  [/\bvine a vore\b/gi, "bine a vore"],
];

function catalanToSpanishPhonetic(text: string): string {
  let out = text;
  for (const [re, rep] of PHONETIC_MAP) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Locuta el text donat amb molt d'ímpetu, com una exclamació.
 */
export function speak(text: string) {
  enqueue({ text, rate: 1.1, pitch: 0.85, volume: 1.0 });
}

// Cola de locución: encadena utterances para que no se solapen.
const speechQueue: SpeechProfile[] = [];
let speaking = false;

function enqueue(p: SpeechProfile) {
  if (isMuted) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechQueue.push(p);
  pump();
}

function pump() {
  if (speaking) return;
  const next = speechQueue.shift();
  if (!next) return;
  speaking = true;
  void speakNow(next).finally(() => {
    speaking = false;
    pump();
  });
}

function speakNow(p: SpeechProfile): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (isMuted) { resolve(); return; }
      if (typeof window === "undefined" || !("speechSynthesis" in window)) { resolve(); return; }
      const synth = window.speechSynthesis;

      // Android WebView bug: si speechSynthesis.speaking és true però no
      // hi ha cap locució real, speak() falla silenciosament. Cancel·lem
      // primer per netejar l'estat.
      if (synth.speaking || synth.pending) {
        synth.cancel();
      }

      const utter = new SpeechSynthesisUtterance(p.text);
      utter.rate = clamp(p.rate * userRateMul, 0.5, 1.6);
      utter.pitch = clamp(p.pitch * userPitchMul, 0.3, 1.5);
      utter.volume = p.volume;

      // Timeout de seguretat: si l'onend/onerror no es disparen (passa
      // en alguns WebViews), resolem igualment després de 8s.
      const safety = setTimeout(() => resolve(), 8000);
      utter.onend = () => { clearTimeout(safety); resolve(); };
      utter.onerror = () => { clearTimeout(safety); resolve(); };

      const start = (v: SpeechSynthesisVoice | null) => {
        if (v) {
          utter.voice = v;
          utter.lang = v.lang;
          if (!/^ca/i.test(v.lang)) {
            utter.text = catalanToSpanishPhonetic(p.text);
          }
        } else {
          utter.lang = "ca-ES";
        }
        // Petit delay per Android WebView: després de cancel() cal esperar
        // un tick perquè el motor estigui llest.
        setTimeout(() => synth.speak(utter), 50);
      };

      const voice = pickVoice();
      if (voice) {
        start(voice);
      } else {
        void ensureVoicesReady().then(() => {
          cachedVoice = null;
          start(pickVoice());
        });
      }
    } catch {
      resolve();
    }
  });
}
// Referència a l'àudio HTML5 actual per poder cancel·lar-lo.
let currentAudio: HTMLAudioElement | null = null;

/** Cancel·la la cua i atura la locució actual. */
export function cancelSpeech() {
  speechQueue.length = 0;
  speaking = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Claus de cant que tenen àudio pregravat a /audio/shouts/{key}_{lang}.mp3
 */
const PRERECORDED_SHOUTS = new Set([
  "truc", "retruc", "quatre", "joc-fora",
  "envit", "renvit", "falta-envit",
  "vull", "no-vull", "passe",
]);

/**
 * Intenta reproduir l'àudio pregravat. Retorna true si ha pogut,
 * false si no existeix o falla (i caldrà usar TTS de fallback).
 * Resol quan l'àudio ha acabat de sonar.
 */
async function playPrerecorded(key: string, lang: "ca" | "es"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { getShoutAudioElement } = await import("./shoutAudio");
    const audio = await getShoutAudioElement(key as never, lang);
    if (!audio) return false;
    return await new Promise<boolean>((resolve) => {
      try {
        // Atura qualsevol reproducció anterior d'aquest mateix element.
        try { audio.pause(); audio.currentTime = 0; } catch { /* noop */ }
        currentAudio = audio;
        audio.volume = 1.0;
        const cleanup = () => {
          audio.onended = null;
          audio.onerror = null;
          if (currentAudio === audio) currentAudio = null;
        };
        const safety = setTimeout(() => { cleanup(); resolve(true); }, 8000);
        audio.onended = () => { clearTimeout(safety); cleanup(); resolve(true); };
        audio.onerror = () => { clearTimeout(safety); cleanup(); resolve(false); };
        const p = audio.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => { clearTimeout(safety); cleanup(); resolve(false); });
        }
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Locuta el cant (shout) corresponent. Primer intenta l'àudio pregravat;
 * si falla, usa TTS del navegador com a fallback.
 * Accepta un `labelOverride` (per exemple "Truc i passe!") per dir
 * exactament el text que apareix en pantalla (en eixe cas sempre TTS).
 *
 * Retorna una promesa que es resol quan l'àudio acaba (o immediatament
 * si no hi ha res a reproduir). Útil per encadenar visuals al ritme real
 * de la veu.
 */
export async function speakShout(what: string, labelOverride?: string): Promise<void> {
  if (isMuted) return;
  // Cancel·la qualsevol àudio anterior per evitar que se superposen dues veus.
  cancelSpeech();
  // Petit retard perquè l'àudio sone una mica després del cartell visual.
  // Per als cants d'envit, afegim 200 ms extra perquè no sone abans
  // que el cartell central acabe d'aparèixer.
  const isEnvitShout = what === "envit" || what === "renvit" || what === "falta-envit";
  const baseDelay = 100;
  const extraDelay = isEnvitShout ? 200 : 0;
  await new Promise<void>((resolve) => setTimeout(resolve, baseDelay + extraDelay));
  if (isMuted) return;
  const lang = getPreferredLang();
  const dict = lang === "es" ? SHOUT_TEXT_ES : SHOUT_TEXT_CA;
  const text = labelOverride ?? dict[what];
  if (!text) return;

  // Si hi ha labelOverride personalitzat, no hi ha àudio pregravat → TTS directe.
  if (labelOverride || !PRERECORDED_SHOUTS.has(what)) {
    const profile = profileFor(what, text);
    if (labelOverride) {
      const clean = labelOverride.replace(/!+$/g, "").trim();
      profile.text = `¡${clean}!`;
    }
    enqueue(profile);
    return;
  }

  // Intentem àudio pregravat; si falla, fem fallback a TTS.
  const ok = await playPrerecorded(what, lang);
  if (!ok) {
    const profile = profileFor(what, text);
    enqueue(profile);
  }
}