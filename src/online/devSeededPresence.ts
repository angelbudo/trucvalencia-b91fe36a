// Mock de presència per a desenvolupament/testing.
//
// Quan `DEV_MOCK_PRESENCE` està actiu, els hooks `useLobbyPresence` i
// `useOnlinePresenceLookup` injecten 8 jugadors falsos com si estiguessin
// connectats. Així es pot veure com es renderitzen perfils, llistes online,
// invitacions i indicadors "Conectado" sense obrir múltiples navegadors.
//
// Per desactivar-ho: posar `DEV_MOCK_PRESENCE = false`.

import type { OnlinePlayer } from "./useLobbyPresence";

export const DEV_MOCK_PRESENCE = false;

/**
 * 8 dels 13 perfils sembrats apareixen com a "connectats" (els 5 restants
 * estan a la base de dades però no a la presència → indicador apagat).
 */
export const DEV_MOCK_ONLINE_PLAYERS: OnlinePlayer[] = [
  // Jugant en mesa
  { deviceId: "mock-device-1", name: "Maria Trucàs",  userId: "9e962701-3996-4da1-951e-d90565959e40", roomCode: "T3R8P1", salaSlug: "la-falta" },
  { deviceId: "mock-device-2", name: "Joan Manilla",  userId: "5bf5a31e-c4dc-4312-a81b-cfe8d8c5a534", roomCode: "T3R8P1", salaSlug: "la-falta" },
  { deviceId: "mock-device-3", name: "Laia Envit",    userId: "9e1015d4-1521-4ecb-8f62-a4041177dbef", roomCode: "T3R8P1", salaSlug: "la-falta" },
  { deviceId: "mock-device-4", name: "Pau Espases",   userId: "6ef4f835-c72c-4766-a85b-d4a3e2c3b865", roomCode: "T3R8P1", salaSlug: "la-falta" },
  // Lliures (sense mesa)
  { deviceId: "mock-device-5", name: "Núria Bastos",  userId: "a28dd10d-3efe-4dc7-a6c4-a85e24bb748d", roomCode: null, salaSlug: "la-falta" },
  { deviceId: "mock-device-6", name: "Marc Oros",     userId: "d208c1aa-2f7a-428c-80e1-daee818c2553", roomCode: null, salaSlug: "la-falta" },
  { deviceId: "mock-device-7", name: "Carla Copes",   userId: "2fac2a3d-1263-4984-9d6d-95253d1cbe3e", roomCode: null, salaSlug: "la-falta" },
  { deviceId: "mock-device-8", name: "Toni Set",      userId: "39202db6-c5a7-440f-8238-d4c9a05c8854", roomCode: null, salaSlug: "la-falta" },
];

export const DEV_MOCK_ONLINE_DEVICE_IDS: Set<string> = new Set(
  DEV_MOCK_ONLINE_PLAYERS.map((p) => p.deviceId),
);

export const DEV_MOCK_ONLINE_USER_IDS: Set<string> = new Set(
  DEV_MOCK_ONLINE_PLAYERS.map((p) => p.userId).filter(
    (u): u is string => !!u,
  ),
);