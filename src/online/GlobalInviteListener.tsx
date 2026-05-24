import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useIncomingInvites } from "@/online/useInvites";

/** Escolta invitacions a la taula arreu de l'app i mostra toasts. */
export function GlobalInviteListener() {
  const { deviceId, ready } = usePlayerIdentity();
  useIncomingInvites({ deviceId, enabled: ready && !!deviceId });
  return null;
}