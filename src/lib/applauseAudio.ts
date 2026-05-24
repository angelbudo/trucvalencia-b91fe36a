/**
 * Aplaudiments curts (~4s) que es reprodueixen quan apareix la pantalla
 * de fi de partida. La font \u00e9s un fitxer p\u00fablic de Google Actions
 * Sounds (lliure d'\u00fas). Es cacheja al navegador a la primera
 * desc\u00e0rrega; si no hi ha xarxa la primera vegada, s'ignora silenciosament.
 */

const APPLAUSE_URL =
  "https://actions.google.com/sounds/v1/human_voices/applause.ogg";

const DURATION_MS = 4000;

let audioEl: HTMLAudioElement | null = null;
let stopTimer: number | null = null;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    try {
      audioEl = new Audio(APPLAUSE_URL);
      audioEl.preload = "auto";
      audioEl.volume = 0.9;
    } catch {
      audioEl = null;
    }
  }
  return audioEl;
}

export function playApplause(): void {
  const a = getAudio();
  if (!a) return;
  try {
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(() => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    stopTimer = null;
  }, DURATION_MS) as unknown as number;
}

export function stopApplause(): void {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}