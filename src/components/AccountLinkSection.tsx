import { useState } from "react";
import {
  Mail,
  LogOut,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Unlink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-shim";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { unlinkAccount } from "@/lib/accountUnlink";
import { toast } from "sonner";
import { useT } from "@/i18n/useT";

export function AccountLinkSection() {
  const t = useT();
  const { user, ready } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      toast.success(t("account.session_closed"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(msg);
    } finally {
      setSigningOut(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      await unlinkAccount();
      toast.success(t("account.unlinked"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(msg);
    } finally {
      setUnlinking(false);
    }
  }

  if (user) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-foreground">
              {t("account.linked")}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {user.email}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("account.if_change_device")}
        </p>
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut || unlinking}
            className="border-foreground/30"
          >
            {signingOut ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t("account.signout")}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={signingOut || unlinking}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {unlinking ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Unlink className="w-3.5 h-3.5 mr-1.5" />
                )}
                {t("account.unlink")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("account.unlink_title")}</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      {t("account.unlink_p1_a")}
                      <span className="font-medium">{user.email}</span>
                      {t("account.unlink_p1_b")}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        {t("account.unlink_p2_strong")}
                      </span>
                      {t("account.unlink_p2_rest")}
                    </p>
                    <p className="text-muted-foreground">
                      {t("account.unlink_p3")}
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={unlinking}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {unlinking ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : null}
                  {t("account.unlink_confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[11px] font-medium text-foreground">
            {t("account.save_progress")}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("account.save_progress_hint")}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        asChild
        className="w-full border-primary/40 text-primary hover:bg-primary/10"
      >
        <Link to="/auth">
          <Mail className="w-3.5 h-3.5 mr-1.5" />
          {t("account.link_email")}
        </Link>
      </Button>
    </div>
  );
}