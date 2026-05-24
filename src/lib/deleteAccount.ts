/**
 * Client wrapper for the `delete-account` edge function.
 *
 * Compleix dos requisits:
 *  1. Google Play Store (User Data deletion, exigit des de 2024).
 *  2. Dret de supressió RGPD (art. 17).
 *
 * S'usa des de:
 *  - `Ajustes.tsx` → botó "Esborrar les meues dades" dins de l'app.
 *  - `EsborrarDades.tsx` → pàgina pública /esborrar-dades, l'enllaç que
 *    declarem a la fitxa de Google Play (data deletion URL).
 */
import { supabase } from "@/integrations/supabase/client";

export interface DeleteAccountResult {
  ok: true;
  dryRun?: boolean;
  deleted: Record<string, number>;
  anonymized: Record<string, number>;
}

export async function requestAccountDeletion(args: {
  deviceId: string;
  dryRun?: boolean;
}): Promise<DeleteAccountResult> {
  const { deviceId, dryRun = false } = args;
  if (!deviceId) throw new Error("deviceId requerit");
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { deviceId, dryRun },
  });
  if (error) throw new Error(error.message ?? "Error de xarxa");
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as DeleteAccountResult;
}

/** Esborra completament les dades locals (localStorage) del dispositiu.
 *  Es crida després d'un esborrat servidor exitós dins de l'app per deixar
 *  el dispositiu en estat "primera obertura". */
export function wipeLocalDeviceData(): void {
  if (typeof window === "undefined") return;
  try {
    // Esborrem totes les claus de l'app (prefixades amb "truc:").
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("truc:")) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* noop — entorns sense localStorage (mode privat estricte) */
  }
}