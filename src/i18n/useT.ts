import { useCallback, useEffect, useState } from "react";
import { DICTS } from "./dict";
import { loadSettings, type GameLanguage } from "@/lib/gameSettings";

/**
 * Sistema d'i18n lleuger. Un sol hook `useT()` reactiu al canvi d'idioma.
 * Si la clau no existeix en l'idioma actual, retorna el text en valencià
 * (idioma per defecte) o la pròpia clau si tampoc hi és.
 *
 * Suporta interpolació simple amb `{var}`:
 *   t("hello", { name: "Pep" })  →  diccionari: "Hola, {name}!"
 */

const LISTENERS = new Set<() => void>();
let currentLang: GameLanguage = "ca";

function readLang(): GameLanguage {
  try {
    return loadSettings().language;
  } catch {
    return "ca";
  }
}

function ensureInit() {
  if (typeof window === "undefined") return;
  currentLang = readLang();
}

if (typeof window !== "undefined") {
  ensureInit();
  window.addEventListener("storage", () => {
    const next = readLang();
    if (next !== currentLang) {
      currentLang = next;
      LISTENERS.forEach((cb) => cb());
    }
  });
}

/** Notifica un canvi d'idioma fet en aquesta mateixa pestanya. */
export function notifyLanguageChanged(next: GameLanguage) {
  if (next === currentLang) return;
  currentLang = next;
  LISTENERS.forEach((cb) => cb());
}

export function getLanguage(): GameLanguage {
  return currentLang;
}

function format(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

export function translate(
  key: string,
  vars?: Record<string, string | number>,
  lang: GameLanguage = currentLang,
): string {
  const dict = DICTS[lang] ?? DICTS.ca;
  const value = dict[key] ?? DICTS.ca[key] ?? key;
  return format(value, vars);
}

export function useT() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    LISTENERS.add(listener);
    return () => {
      LISTENERS.delete(listener);
    };
  }, []);

  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, vars),
    [],
  );
}