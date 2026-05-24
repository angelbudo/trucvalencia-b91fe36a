import type { PlayerId } from "@/game/types";
import type { RoomChatFlagRow } from "./useRoomChatFlags";

export type ChatFlagNoticeKind =
  | "muted-target"      // ets el reportat — silenci iniciat
  | "muted-extended-target" // ets el reportat — silenci ampliat
  | "muted-reporter"    // tu has silenciat algú
  | "muted-extended-reporter" // tu has ampliat el silenci d'algú
  | "review-dismissed-target" // revisió: t'aixequen el silenci
  | "review-dismissed-reporter" // revisió: el teu report s'ha desestimat
  | "review-approved-target"  // revisió: confirmen el silenci
  | "review-approved-reporter"; // revisió: confirmen el teu report

export interface ChatFlagNotice {
  /** Stable id (per device) so React keys don't collide. */
  id: string;
  kind: ChatFlagNoticeKind;
  /** ms epoch when this notice should appear (chronologically interleaved with text messages). */
  createdAt: number;
  /** Display name of the target seat (the silenced player). */
  targetName: string;
  targetSeat: PlayerId;
  /** Active mute expiry at this moment (ms epoch), only set for "muted-*" kinds. */
  expiresAt?: number;
}

/** Build the list of moderation notices that the local device should see in
 *  its TableChat. Pure function: given the same flags + identity it returns
 *  the same notices. We never persist anything — the notices are derived
 *  entirely from the existing `room_chat_flags` rows.
 *
 *  Rules:
 *   - For each flag where I am the TARGET: emit a "muted-target" notice at
 *     `createdAt`. If at that moment another active flag against me already
 *     existed (older `createdAt`, still alive at this point), tag it as
 *     "muted-extended-target" instead (so the second/third report is shown
 *     as an extension, not a fresh silence).
 *   - For each flag where I am the REPORTER: emit a "muted-reporter" notice
 *     (or "muted-extended-reporter" with the same extension rule, looking
 *     at any active flag against the same target).
 *   - When a flag is no longer pending and has a `decidedAt`, emit the
 *     corresponding "review-*" notice for me if I am the target or one of
 *     the reporters of that flag.
 */
export function buildChatFlagNotices(
  flags: readonly RoomChatFlagRow[],
  myDeviceId: string | null,
  seatNames: Record<PlayerId, string>,
): ChatFlagNotice[] {
  if (!myDeviceId) return [];
  const sorted = [...flags].sort((a, b) => a.createdAt - b.createdAt);
  const notices: ChatFlagNotice[] = [];

  const isExtensionAt = (
    targetDeviceId: string,
    createdAt: number,
    selfId: number,
  ): boolean => {
    // Was there any earlier flag against the same target whose silence
    // was still active when `createdAt` happened (and not the same flag,
    // and not yet dismissed before that moment)?
    return sorted.some(
      (f) =>
        f.id !== selfId &&
        f.targetDeviceId === targetDeviceId &&
        f.createdAt < createdAt &&
        f.expiresAt > createdAt &&
        // If it was dismissed before our createdAt, it doesn't count as still active.
        !(f.status === "dismissed" && f.decidedAt != null && f.decidedAt <= createdAt),
    );
  };

  for (const f of sorted) {
    const targetName =
      seatNames[f.targetSeat] ?? `Seient ${f.targetSeat + 1}`;
    const iAmTarget = f.targetDeviceId === myDeviceId;
    const iAmReporter = f.reporterDeviceId === myDeviceId;

    if (iAmTarget) {
      const extended = isExtensionAt(f.targetDeviceId, f.createdAt, f.id);
      notices.push({
        id: `flag-${f.id}-target-start`,
        kind: extended ? "muted-extended-target" : "muted-target",
        createdAt: f.createdAt,
        targetName,
        targetSeat: f.targetSeat,
        expiresAt: f.expiresAt,
      });
    } else if (iAmReporter) {
      const extended = isExtensionAt(f.targetDeviceId, f.createdAt, f.id);
      notices.push({
        id: `flag-${f.id}-reporter-start`,
        kind: extended ? "muted-extended-reporter" : "muted-reporter",
        createdAt: f.createdAt,
        targetName,
        targetSeat: f.targetSeat,
        expiresAt: f.expiresAt,
      });
    }

    // Resolution notice (only when admin already decided and we are involved).
    if (f.status !== "pending" && f.decidedAt != null && (iAmTarget || iAmReporter)) {
      const role = iAmTarget ? "target" : "reporter";
      const kind: ChatFlagNoticeKind =
        f.status === "dismissed"
          ? (iAmTarget ? "review-dismissed-target" : "review-dismissed-reporter")
          : (iAmTarget ? "review-approved-target" : "review-approved-reporter");
      notices.push({
        id: `flag-${f.id}-${role}-review`,
        kind,
        createdAt: f.decidedAt,
        targetName,
        targetSeat: f.targetSeat,
      });
    }
  }

  // Stable order: by createdAt ASC, breaking ties by notice id.
  notices.sort((a, b) =>
    a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.id.localeCompare(b.id),
  );
  return notices;
}

/** Catalan UI text for each notice kind. Keep here so TableChat stays a
 *  presentational component. */
export function formatChatFlagNotice(n: ChatFlagNotice): string {
  switch (n.kind) {
    case "muted-target":
      return `Has estat reportat. No pots escriure durant uns minuts mentre es revisa el contingut.`;
    case "muted-extended-target":
      return `Un altre jugador t'ha reportat: el teu silenci s'ha ampliat.`;
    case "muted-reporter":
      return `Has silenciat ${n.targetName} mentre es revisa el contingut.`;
    case "muted-extended-reporter":
      return `Has ampliat el silenci de ${n.targetName}.`;
    case "review-dismissed-target":
      return `Revisió completada: el teu silenci s'ha aixecat.`;
    case "review-dismissed-reporter":
      return `Revisió completada: el report contra ${n.targetName} s'ha desestimat.`;
    case "review-approved-target":
      return `Revisió completada: el silenci s'ha confirmat.`;
    case "review-approved-reporter":
      return `Revisió completada: el report contra ${n.targetName} s'ha aprovat.`;
  }
}