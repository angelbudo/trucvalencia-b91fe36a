/**
 * Estat de presència derivat d'un jugador a partir de `is_online` i
 * `last_seen` de la taula `room_players`. Es calcula al client per a
 * disposar d'un indicador en temps real sense dependre d'un nou refresc
 * del servidor entre heartbeats.
 *
 *  - "online":  heartbeat recent (< 30 s) i `is_online === true`.
 *  - "away":    heartbeat fa 30 s – 2 min, encara marcat com a online.
 *  - "offline": `is_online === false` o sense heartbeat des de fa més de 2 min.
 */
export type PresenceStatus = "online" | "away" | "offline";

/** Llindar (ms) per a considerar un jugador "online" actiu. */
export const PRESENCE_ONLINE_MS = 30_000;
/** Llindar (ms) per a considerar un jugador "away" (encara connectat però inactiu). */
export const PRESENCE_AWAY_MS = 2 * 60_000;

export function getPresenceStatus(
  isOnline: boolean,
  lastSeenIso: string | null | undefined,
  now: number = Date.now(),
): PresenceStatus {
  if (!isOnline) return "offline";
  if (!lastSeenIso) return "offline";
  const ts = new Date(lastSeenIso).getTime();
  if (!Number.isFinite(ts)) return "offline";
  const age = now - ts;
  if (age <= PRESENCE_ONLINE_MS) return "online";
  if (age <= PRESENCE_AWAY_MS) return "away";
  return "offline";
}

const RTF = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
  ? new Intl.RelativeTimeFormat("ca", { numeric: "auto" })
  : null;

/** Etiqueta humana curta per a tooltip (català). */
export function describePresence(
  status: PresenceStatus,
  lastSeenIso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (status === "online") return "En línia";
  if (!lastSeenIso) {
    return status === "away" ? "Inactiu" : "Desconnectat";
  }
  const age = Math.max(0, now - new Date(lastSeenIso).getTime());
  const sec = Math.floor(age / 1000);
  let agoLabel: string;
  if (sec < 60) agoLabel = `fa ${sec}s`;
  else if (sec < 3600) agoLabel = `fa ${Math.floor(sec / 60)} min`;
  else if (sec < 86400) agoLabel = `fa ${Math.floor(sec / 3600)} h`;
  else agoLabel = `fa ${Math.floor(sec / 86400)} d`;
  // RTF reservat per si es vol localitzar més endavant.
  void RTF;
  return status === "away" ? `Inactiu (${agoLabel})` : `Desconnectat (${agoLabel})`;
}

/** Classes Tailwind per al punt indicador (color de fons + halo). */
export function presenceDotClasses(status: PresenceStatus): string {
  switch (status) {
    case "online":
      return "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]";
    case "away":
      return "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]";
    case "offline":
    default:
      return "bg-muted-foreground/60";
  }
}