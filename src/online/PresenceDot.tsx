import { cn } from "@/lib/utils";
import {
  describePresence,
  presenceDotClasses,
  type PresenceStatus,
} from "@/online/presence";

interface Props {
  status: PresenceStatus;
  lastSeen?: string | null;
  /** Mida del punt en píxels (default 10). */
  size?: number;
  className?: string;
  /** Anell exterior (útil sobre fons d'avatar). */
  ring?: boolean;
}

/**
 * Petit indicador de presència (verd/ambar/gris) amb tooltip nadiu i text
 * accessible. Pensat per a sobreposar-se a un avatar o seient.
 */
export function PresenceDot({ status, lastSeen, size = 10, className, ring = true }: Props) {
  const label = describePresence(status, lastSeen ?? null);
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block rounded-full",
        ring && "ring-2 ring-background",
        presenceDotClasses(status),
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}