import { useEffect, useState } from "react";
import { listMyActiveRooms, type MyActiveRoomDTO } from "./rooms.functions";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";

/**
 * Polls the edge function for in-progress rooms where this device occupies a
 * seat. Used by the home screen banner to offer "tornar a la partida". We
 * keep the polling lightweight (every 30s) since it's only meaningful while
 * the user is parked on the landing page.
 */
export function useMyActiveRooms() {
  const { deviceId, ready } = usePlayerIdentity();
  const [rooms, setRooms] = useState<MyActiveRoomDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !deviceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchRooms = async () => {
      try {
        const res = await listMyActiveRooms({ data: { deviceId } });
        if (!cancelled) setRooms(res.rooms);
      } catch {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRooms();
    const interval = window.setInterval(fetchRooms, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ready, deviceId]);

  return { rooms, loading };
}