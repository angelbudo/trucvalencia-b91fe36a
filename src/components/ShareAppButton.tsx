import { useState } from "react";
import { Share2, Mail, Copy, Check } from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005-.002l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.941z"/>
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHARE_TEXT =
  'Quiero compartir contigo una App para Jugar en tu móvil al "Truc Valencià" online o solo contra bots. Pruébala, creo que te puede gustar. Si te gusta compártela tú también. Descárgate la app en este enlace: https://dl.dropboxusercontent.com/scl/fi/79tn4dxjic6jo2b9oy8qc/TrucValencia.apk?rlkey=y0qv1npqidr0hx9v2m1xink1v&st=4svaimll';

export function ShareAppButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(
    "https://dl.dropboxusercontent.com/scl/fi/79tn4dxjic6jo2b9oy8qc/TrucValencia.apk?rlkey=y0qv1npqidr0hx9v2m1xink1v&st=4svaimll",
  )}&text=${encodeURIComponent(SHARE_TEXT)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("Truc Valencià")}&body=${encodeURIComponent(SHARE_TEXT)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 border-foreground/80 text-foreground hover:bg-foreground/10"
          aria-label="Compartir la App"
          title="Compartir la App"
        >
          <Share2 className="w-4 h-4" />
        </Button>
        <span className="text-xs font-medium text-foreground">Compartir la App</span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl border-2 border-gold">
          <DialogHeader>
            <DialogTitle className="font-title font-black italic text-gold text-2xl text-center">
              Compartir la App
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              asChild
              className="justify-start h-auto min-h-[42px] py-1 text-[15px] bg-[#25D366] text-white hover:bg-[#25D366]/90 border-0 [&_svg]:!w-6 [&_svg]:!h-6"
            >
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="mr-2 shrink-0" />
                Por WhatsApp
              </a>
            </Button>
            <Button
              asChild
              className="justify-start h-auto min-h-[42px] py-1 text-[15px] bg-[#229ED9] text-white hover:bg-[#229ED9]/90 border-0 [&_svg]:!w-6 [&_svg]:!h-6"
            >
              <a href={telegramHref} target="_blank" rel="noopener noreferrer">
                <TelegramIcon className="mr-2 shrink-0" />
                Por Telegram
              </a>
            </Button>
            <Button
              asChild
              className="justify-start h-auto min-h-[42px] py-1 text-[15px] bg-primary text-white hover:bg-primary/90 border-0 gold-glow [&_svg]:!w-6 [&_svg]:!h-6"
            >
              <a href={mailHref}>
                <Mail className="mr-2 shrink-0" />
                Por Email
              </a>
            </Button>
            <Button
              onClick={handleCopy}
              className="justify-start h-auto min-h-[42px] py-1 text-[15px] bg-orange-500 text-white hover:bg-orange-500/90 border-0 [&_svg]:!w-6 [&_svg]:!h-6"
            >
              {copied ? (
                <Check className="mr-2 shrink-0" />
              ) : (
                <Copy className="mr-2 shrink-0" />
              )}
              {copied ? "¡Copiado!" : "Copiar texto al portapapeles"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}