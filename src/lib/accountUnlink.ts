import { supabase } from "@/integrations/supabase/client";

/**
 * Trenca la vinculació compte ↔ device_id i tanca sessió.
 *
 * - Crida l'edge function `account-unlink` que esborra la fila a
 *   `account_links` corresponent a l'usuari autenticat.
 * - NO toca `player_profiles` ni cap altra dada del joc → tot el progrés
 *   continua disponible localment via `device_id`.
 * - Després tanca la sessió (sign out) per deixar l'app en estat anònim.
 */
export async function unlinkAccount(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No hi ha sessió activa");

  const { data, error } = await supabase.functions.invoke("account-unlink", {
    method: "POST",
  });
  if (error) throw error;
  if (!data?.ok) {
    throw new Error(data?.error ?? "No s'ha pogut desvincular el compte");
  }

  await supabase.auth.signOut();
}