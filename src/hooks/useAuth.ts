import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook simple per accedir a l'estat d'autenticació.
 * IMPORTANT: l'ordre dels listeners és crític — primer onAuthStateChange,
 * després getSession (per evitar deadlocks).
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1) listener primer
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    // 2) després getSession
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, ready, isAuthenticated: !!user };
}