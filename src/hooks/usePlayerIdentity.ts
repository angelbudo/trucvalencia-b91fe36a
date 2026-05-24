import { useCallback, useEffect, useState } from "react";

const DEVICE_KEY = "truc:device-id";
const NAME_KEY = "truc:player-name";

function generateDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `d-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function readDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = generateDeviceId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function readName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Sanitiza i limita el nom a 24 caràcters (coincideix amb el CHECK del DB). */
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 24);
}

/**
 * Identitat lleugera del jugador:
 *  - device_id: UUID generat al primer ús, persistit a localStorage.
 *  - name: nom mostrat. Editable. Si està buit, l'app demanarà introduir-lo.
 * Sense email ni dades personals.
 */
export function usePlayerIdentity() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [name, setNameState] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDeviceId(readDeviceId());
    setNameState(readName());
    setReady(true);
  }, []);

  const setName = useCallback((next: string) => {
    const clean = sanitizeName(next);
    setNameState(clean);
    try {
      if (clean) window.localStorage.setItem(NAME_KEY, clean);
      else window.localStorage.removeItem(NAME_KEY);
    } catch { /* noop */ }
  }, []);

  return { deviceId, name, setName, ready, hasName: name.length > 0 };
}