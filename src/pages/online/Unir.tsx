import { useNavigate } from "@/lib/router-shim";
import { useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { joinRoom } from "@/online/rooms.functions";
import { Loader2, LogIn, LogOut, Settings } from "lucide-react";
import { useT } from "@/i18n/useT";
import { ShareAppButton } from "@/components/ShareAppButton";

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </main>
  );
}

function OnlineUnirPage() {
  return (
    <ClientOnly fallback={<Loading />}><UnirSala /></ClientOnly>
  );
}

function UnirSala() {
  const navigate = useNavigate();
  const t = useT();
  const { deviceId, name, hasName, ready } = usePlayerIdentity();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Loading />;

  const cleanCode = code.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);

  const handleJoin = async () => {
    if (!hasName) { setError(t("unir.need_name")); return; }
    if (cleanCode.length !== 6) { setError(t("unir.code_six_chars")); return; }
    setSubmitting(true);
    setError(null);
    try {
      await joinRoom({ data: { code: cleanCode, deviceId, name } });
      navigate(`/online/sala/${cleanCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("nou.unexpected_error"));
      setSubmitting(false);
    }
  };

  return (
    <main className="menu-screen min-h-screen flex flex-col items-center justify-center px-5 py-8">
      <div className="fixed top-4 inset-x-4 z-50 flex items-center justify-between">
        <ShareAppButton />
        <Button
          onClick={() => navigate("/")}
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
          aria-label={t("common.back_home")}
          title={t("common.back_home")}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      <div className="w-full max-w-md flex flex-col gap-5">

        <header className="text-center">
          <h1 className="font-title font-black italic text-gold text-3xl pr-2 text-center">{t("unir.join_table")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("unir.code_intro")}</p>
        </header>

        {!hasName && (
          <section className="px-1 py-2 flex items-center justify-between gap-3">
            <p className="text-xs text-foreground">{t("unir.need_name")}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/ajustes")} className="border-primary/40">
              <Settings className="w-3 h-3 mr-1" /> {t("home.settings")}
            </Button>
          </section>
        )}

        <section className="wood-surface border-2 border-primary/40 rounded-2xl p-4 flex flex-col gap-2">
          <label className="text-[11px] font-display tracking-widest uppercase text-primary/85">
            {t("unir.code_label")}
          </label>
          <Input
            value={cleanCode}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD23"
            maxLength={6}
            className="text-center font-display font-black text-2xl tracking-[0.3em] uppercase h-14"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </section>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <Button
          size="lg"
          className="h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold text-lg gold-glow"
          onClick={handleJoin}
          disabled={submitting || !hasName || cleanCode.length !== 6}
        >
          {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
          {t("unir.enter_table")}
        </Button>
      </div>
    </main>
  );
}
export default OnlineUnirPage;