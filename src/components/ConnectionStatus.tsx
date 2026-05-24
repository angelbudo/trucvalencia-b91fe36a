import { cn } from "@/lib/utils";

/**
 * Indicador visual de connexió: una bolleta verda (encesa o apagada) i un
 * text "Conectado" / "No conectado" al costat. S'usa als perfils d'usuari.
 */
export function ConnectionStatus({
  online,
  className,
}: {
  online: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        online ? "text-emerald-500" : "text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block w-2 h-2 rounded-full",
          online
            ? "bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.85)]"
            : "bg-muted-foreground/40",
        )}
      />
      <span>{online ? "Conectado" : "No conectado"}</span>
    </div>
  );
}