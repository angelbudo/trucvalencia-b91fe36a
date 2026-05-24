// Hook per a la contrasenya d'administrador, guardada localment.
// No la validem al client: el backend ho fa servir comparant amb el secret del servidor.
import { useCallback, useEffect, useState } from "react";

const KEY = "truc:admin-password";

function read(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function useAdminPassword() {
  const [password, setPasswordState] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPasswordState(read());
    setReady(true);
  }, []);

  const setPassword = useCallback((next: string) => {
    const clean = next.trim();
    setPasswordState(clean);
    try {
      if (clean) window.localStorage.setItem(KEY, clean);
      else window.localStorage.removeItem(KEY);
    } catch { /* noop */ }
  }, []);

  return { password, setPassword, ready, isAdmin: password.length > 0 };
}