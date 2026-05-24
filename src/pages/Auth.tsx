import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-shim";
import { z } from "zod";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientOnly } from "@/components/ClientOnly";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { syncAccountLinkAfterLogin } from "@/lib/accountLink";
import { toast } from "sonner";

type MedianBridge = {
  window?: {
    open?: (url: string) => unknown;
  };
};

function isEmbeddedWebView() {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";
  const hasMedianBridge = typeof (window as Window & { Median?: MedianBridge }).Median !== "undefined";
  const isIOSWebView = /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
  const isAndroidWebView =
    /\bwv\b/i.test(ua) ||
    /; wv\)/i.test(ua) ||
    (/Android/i.test(ua) && /Version\/[\d.]+/i.test(ua) && !/Chrome\/[.0-9]*/.test(ua));

  return hasMedianBridge || /median|gonative/i.test(ua) || isIOSWebView || isAndroidWebView;
}

function openOAuthOutsideWebView(url: string) {
  if (typeof window === "undefined") return false;

  const median = (window as Window & { Median?: MedianBridge }).Median;
  if (typeof median?.window?.open === "function") {
    try {
      median.window.open(url);
      return true;
    } catch {
      // continuem amb fallbacks web si el bridge natiu falla
    }
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return true;

  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

const emailSchema = z.string().trim().email("Correu no vàlid").max(254);
const passwordSchema = z
  .string()
  .min(8, "Mínim 8 caràcters")
  .max(72, "Màxim 72 caràcters");

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function AuthPage() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Auth />
    </ClientOnly>
  );
}

function Auth() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { deviceId } = usePlayerIdentity();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Si ja està autenticat, fora d'aquí.
  useEffect(() => {
    if (ready && user) {
      navigate("/ajustes");
    }
  }, [ready, user, navigate]);

  async function afterLoginSync() {
    const { changed } = await syncAccountLinkAfterLogin();
    if (changed) {
      toast.success("Progrés recuperat. Recarregant…");
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.href = "/ajustes";
      }, 800);
    } else {
      toast.success("Sessió iniciada");
      navigate("/ajustes");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const emailParsed = emailSchema.safeParse(email);
    if (!emailParsed.success) {
      toast.error(emailParsed.error.issues[0].message);
      return;
    }
    const passParsed = passwordSchema.safeParse(password);
    if (!passParsed.success) {
      toast.error(passParsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailParsed.data,
          password: passParsed.data,
          options: {
            emailRedirectTo: `${window.location.origin}/ajustes`,
            data: { device_id: deviceId || null },
          },
        });
        if (error) throw error;
        toast.success(
          "Compte creat. Revisa el teu correu per confirmar-lo abans d'iniciar sessió.",
        );
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailParsed.data,
          password: passParsed.data,
        });
        if (error) throw error;
        await afterLoginSync();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconegut";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setBusy(true);
    let popup: Window | null = null;
    let pollTimer: number | null = null;
    try {
      const currentOrigin = window.location.origin;

      // Obrim el popup immediatament (dins del gest d'usuari) per evitar bloquejos.
      const width = 480;
      const height = 640;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
      popup = window.open("about:blank", "lovable-google-oauth", features);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: currentOrigin,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        popup?.close();
        toast.error(error.message || "Error amb Google");
        return;
      }
      if (!data.url) {
        popup?.close();
        toast.error("No s'ha pogut generar l'enllaç de Google");
        return;
      }

      if (!popup || popup.closed) {
        toast.error("El navegador ha bloquejat la finestra emergent");
        return;
      }

      // Redirigim el popup ja obert a la URL d'OAuth.
      try {
        popup.location.href = data.url;
      } catch {
        popup.close();
        toast.error("No s'ha pogut obrir Google al popup");
        return;
      }

      // Quan Supabase completi el callback i estableixi la sessió, tanquem el popup.
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") {
          try {
            popup?.close();
          } catch {
            /* noop */
          }
          if (pollTimer) window.clearInterval(pollTimer);
          sub.subscription.unsubscribe();
          afterLoginSync();
        }
      });

      // Si l'usuari tanca el popup manualment, alliberem el listener i el botó.
      pollTimer = window.setInterval(() => {
        if (!popup || popup.closed) {
          if (pollTimer) window.clearInterval(pollTimer);
          sub.subscription.unsubscribe();
          setBusy(false);
        }
      }, 600);
      return;
    } catch (e) {
      try {
        popup?.close();
      } catch {
        /* noop */
      }
      const msg = e instanceof Error ? e.message : "Error desconegut";
      toast.error(msg);
    } finally {
      // Si el flow del popup ha quedat actiu, mantenim busy fins que es resolgui.
      if (!popup || popup.closed) setBusy(false);
    }
  }

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-4 py-5">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex justify-end">
          <Button
            onClick={() => navigate("/ajustes")}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
            aria-label="Tornar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-2xl pr-1.5">
            {mode === "signin" ? "Iniciar sessió" : "Crear compte"}
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Vincula un correu per guardar el teu progrés
          </p>
        </header>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <GoogleIcon className="w-4 h-4 mr-2" />
          )}
          Continuar amb Google
        </Button>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-foreground/20" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            o
          </span>
          <div className="flex-1 h-px bg-foreground/20" />
        </div>

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
          <label className="text-[11px] text-muted-foreground">
            Correu electrònic
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@exemple.com"
            autoComplete="email"
            required
            className="bg-background/40 border-primary/30"
          />
          <label className="text-[11px] text-muted-foreground mt-1">
            Contrasenya
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínim 8 caràcters"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            maxLength={72}
            className="bg-background/40 border-primary/30"
          />
          <Button type="submit" disabled={busy} className="w-full mt-2">
            {busy ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            {mode === "signin" ? "Iniciar sessió" : "Crear compte"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-[11px] text-primary underline text-center"
        >
          {mode === "signin"
            ? "No tens compte? Crea'n un"
            : "Ja tens compte? Inicia sessió"}
        </button>
      </div>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export default AuthPage;