import { useEffect, useState } from "react";

// Imatge de cartes (CDN públic). S'utilitza tant a la pantalla de
// benvinguda com a la pantalla principal.
export const cartasTrucSrc =
  "https://dl.dropboxusercontent.com/scl/fi/inge6b250dauyolf5m3pw/Cartas-truc.png?rlkey=znjnnpt8om53ghywv8fzkrup0&st=0e1a64rt";

let cachedPromise: Promise<void> | null = null;
let cachedLoaded = false;

function preload(): Promise<void> {
  if (cachedLoaded) return Promise.resolve();
  if (cachedPromise) return cachedPromise;
  if (typeof window === "undefined") return Promise.resolve();
  cachedPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      cachedLoaded = true;
      resolve();
    };
    img.onerror = () => {
      // No bloquegem indefinidament si falla la càrrega.
      cachedLoaded = true;
      resolve();
    };
    img.src = cartasTrucSrc;
  });
  return cachedPromise;
}

/**
 * Espera que la imatge de cartes estigui descarregada abans de
 * mostrar la resta del contingut. Així evitem el flaix on tot
 * està renderitzat menys la imatge.
 */
export function useCartasTrucReady(): boolean {
  const [ready, setReady] = useState<boolean>(cachedLoaded);
  useEffect(() => {
    if (cachedLoaded) {
      setReady(true);
      return;
    }
    let mounted = true;
    preload().then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return ready;
}