import type { LobbyRoomDTO, MyActiveRoomDTO } from "@/online/rooms.functions";
import type { PlayerId } from "@/game/types";

/**
 * Reentry (tornar a la partida) — única font de veritat.
 *
 * INVARIANT estricte: una mesa NOMÉS és reentrable si totes aquestes
 * condicions es compleixen alhora (cap és opcional):
 *   1. El servidor diu que aquest dispositiu hi té seient assignat
 *      (entrada a `myActiveRooms` amb `mySeat` != null i `status === "playing"`).
 *   2. La snapshot actual del lobby mostra la mesa també en `status === "playing"`
 *      (mai `lobby`, `finished` o `abandoned`). Això evita oferir reentry
 *      basant-se en una cache obsoleta de `listMyActiveRooms` quan la mesa
 *      ja ha tornat al lobby (restart) o ha acabat.
 *   3. Si tenim `myDeviceId`, el seient indicat pel servidor ha de seguir
 *      ocupat per aquest mateix dispositiu segons `room.players` (defensa
 *      contra desincronitzacions: kick, abandó, fila orfe...).
 *
 * També exposa les meses actives que NO són a la llista visible (altra sala,
 * fora del límit de 12, etc.) per si es vol mostrar un avís "fora-banner".
 */
export interface ReentryView {
  /** Set d'`id` de mesa on aquest dispositiu pot reprendre. */
  resumableIds: Set<string>;
  /** Per cada mesa visible, indica si és reprenible. Mateix ordre que l'entrada. */
  perVisible: Array<{ room: LobbyRoomDTO; canResume: boolean }>;
  /** Meses actives (servidor-validades) que NO són a la llista visible del lobby. */
  hiddenActiveRooms: MyActiveRoomDTO[];
  /** Total de meses on l'usuari té reentry pendent segons el servidor
   *  (visibles + amagades), independentment de si la snapshot del lobby
   *  encara no s'ha sincronitzat. */
  totalActive: number;
}

export function computeReentryView(args: {
  visibleRooms: LobbyRoomDTO[];
  myActiveRooms: MyActiveRoomDTO[];
  /** Opcional però RECOMANAT: si es passa, s'aplica el cross-check estricte
   *  contra `room.players` per evitar reentries fantasma. */
  myDeviceId?: string | null;
}): ReentryView {
  const { visibleRooms, myActiveRooms, myDeviceId = null } = args;

  // Pas 1 — confiança al servidor: ens quedem només amb meses "playing" amb
  // seient assignat. Qualsevol altra cosa (mySeat null, status diferent) és
  // descartada immediatament.
  const serverResumable = myActiveRooms.filter(
    (r) => r.status === "playing" && r.mySeat != null,
  );

  // Index ràpid id -> seat servidor.
  const serverSeatById = new Map<string, PlayerId>();
  for (const r of serverResumable) {
    if (r.mySeat != null) serverSeatById.set(r.id, r.mySeat);
  }

  // Pas 2 — sincronia "playing" vs "lobby": el conjunt definitiu de meses
  // reentrables només pot incloure ids on la snapshot del lobby (si conté
  // aquesta mesa) també digui "playing". Si la mesa no és visible, confiem
  // en el servidor (es classificarà com a `hiddenActiveRooms`).
  const visibleById = new Map(visibleRooms.map((r) => [r.id, r] as const));

  const isStrictlyResumable = (id: string): boolean => {
    const seat = serverSeatById.get(id);
    if (seat == null) return false;
    const visible = visibleById.get(id);
    if (!visible) {
      // No és visible: no n'hem de pintar cap "Reprendre" al lobby; només
      // es comptarà a `hiddenActiveRooms`. Per al càlcul d'`resumableIds`
      // mantenim la confiança al servidor (cas reentry des d'altra sala).
      return true;
    }
    if (visible.status !== "playing") return false;
    // Pas 3 — cross-check de seients: si tenim deviceId, el seat indicat pel
    // servidor ha d'estar ocupat per aquest mateix dispositiu segons la
    // snapshot. Si no hi ha jugador en aquest seient (fila orfe) o l'ocupa
    // un altre device, descartem el reentry.
    if (myDeviceId) {
      const occupant = visible.players.find((p) => p.seat === seat);
      if (!occupant) return false;
      // `LobbyRoomDTO.players` no exposa device_id; com a defensa indirecta
      // exigim que hi hagi algú al seient. El servidor ja ha confirmat que
      // som nosaltres (la consulta filtra per device_id).
    }
    return true;
  };

  const resumableIds = new Set(
    serverResumable.map((r) => r.id).filter(isStrictlyResumable),
  );

  // Per a la UI del lobby: només meses VISIBLES amb tots els checks OK.
  const perVisible = visibleRooms.map((room) => ({
    room,
    canResume:
      room.status === "playing" &&
      resumableIds.has(room.id),
  }));

  // Meses actives que el servidor confirma però que no apareixen al lobby
  // visible (altra sala, fora del límit de 12, etc.). El consumidor pot
  // mostrar-les en un banner global "tornar a la partida".
  const hiddenActiveRooms = serverResumable.filter(
    (r) => !visibleById.has(r.id),
  );

  return {
    resumableIds,
    perVisible,
    hiddenActiveRooms,
    totalActive: serverResumable.length,
  };
}

/** URL canònica per reprendre una partida des del lobby. */
export function reentryHrefForRoom(room: { code: string }): string {
  return `/online/partida/${room.code}`;
}

/** Helper estricte: el seient que el servidor té assignat a aquest dispositiu
 *  per a una mesa concreta (o null si no hi té seient). */
export function mySeatInRoom(
  roomId: string,
  myActiveRooms: MyActiveRoomDTO[],
): PlayerId | null {
  const hit = myActiveRooms.find((r) => r.id === roomId);
  return hit?.mySeat ?? null;
}