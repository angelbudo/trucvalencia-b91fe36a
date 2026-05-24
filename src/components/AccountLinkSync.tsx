import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncAccountLinkAfterLogin } from "@/lib/accountLink";
import { toast } from "sonner";

/**
 * Listener global: cada vegada que es detecta un SIGNED_IN (login email/password,
 * tornada del redirect de Google, o restauració de sessió en una pestanya nova),
 * sincronitza automàticament device_id ↔ user_id:
 *
 *   - Si el compte ja tenia un device_id associat → adopta'l localment i recarrega.
 *   - Si no → guarda el device_id local actual al compte.
 *
 * Es fa una única vegada per user_id i sessió de pestanya, per evitar bucles
 * de recàrrega o crides duplicades quan Supabase emet TOKEN_REFRESHED.
 */
export function AccountLinkSync() {
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run(userId: string) {
      if (syncedFor.current === userId) return;
      syncedFor.current = userId;
      try {
        const { changed } = await syncAccountLinkAfterLogin();
        if (cancelled) return;
        if (changed) {
          toast.success("Progrés recuperat. Recarregant…");
          setTimeout(() => {
            if (typeof window !== "undefined") window.location.reload();
          }, 600);
        }
      } catch {
        /* silenciós: no bloquegem la UI per un error de sync */
      }
    }

    // 1) Listener primer (segons regles d'auth de Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          // Diferim per evitar deadlocks dins del callback
          setTimeout(() => run(session.user.id), 0);
        }
        if (event === "SIGNED_OUT") {
          syncedFor.current = null;
        }
      },
    );

    // 2) Sessió ja existent en carregar la pàgina (ex. tornada de redirect OAuth)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) run(session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}