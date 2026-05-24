import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadShoutAudios } from "./lib/shoutAudio";

createRoot(document.getElementById("root")!).render(<App />);

// Descarrega i cacheja al dispositiu els àudios dels cants la primera
// vegada que s'obre l'app. Si ja són a la cache, és pràcticament gratis.
if (typeof window !== "undefined") {
  // Petit delay perquè no competeixi amb el render inicial.
  window.setTimeout(() => {
    void preloadShoutAudios();
  }, 1500);
}