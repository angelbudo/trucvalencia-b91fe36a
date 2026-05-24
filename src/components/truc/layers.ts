/**
 * Capes visuals del tauler de Truc.
 * Mantén el xat de mesa sempre per sota de seients, cartells i bombolles.
 */
export const TRUC_Z_INDEX = {
  tableChat: 5,
  board: 10,
  handArea: 20,
  seat: 30,
  tableActions: 40,
  chatDrawer: 45,
  chatControls: 55,
  shout: 60,
  chatBubble: 80,
  endGameOverlay: 120,
  pauseOverlay: 200,
} as const;