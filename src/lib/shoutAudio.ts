/**
 * Gestió dels àudios pregravats dels cants (shouts).
 *
 * Els fitxers ja no s'inclouen al bundle de l'APK: es descarreguen des
 * d'unes URLs públiques la primera vegada que s'obre l'aplicació i es
 * cachegen al dispositiu (via Cache API) perquè en arrencades futures
 * no calgui tornar-los a baixar i funcionin sense connexió.
 *
 * Si en algun moment cal canviar d'allotjament, només cal actualitzar
 * `SHOUT_AUDIO_URLS`. La resta de l'app continua cridant
 * `getShoutAudioUrl(key, lang)` i tot funciona igual.
 */

export type ShoutLang = "ca" | "es";
export type ShoutAudioKey =
  | "truc" | "retruc" | "quatre" | "joc-fora"
  | "envit" | "renvit" | "falta-envit"
  | "vull" | "no-vull"
  | "truc-passe";

type UrlMap = Record<ShoutAudioKey, Record<ShoutLang, string>>;

/**
 * URLs remotes dels àudios. Es poden moure d'allotjament i el sistema
 * continuarà funcionant: les còpies cachejades al dispositiu es
 * mantenen i quan canvies aquestes URLs, la pròxima neteja de cache
 * o reinstal·lació tornarà a baixar les noves.
 */
export const SHOUT_AUDIO_URLS: UrlMap = {
  envit: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/jrt4lc2vqsxkdfhqpzqbk/envit_ca.mp3?rlkey=zyqk1iwuji0fa2dxnyfphzgll",
    es: "https://dl.dropboxusercontent.com/scl/fi/84jufynyvnz3dtg3opdsi/envit_es.mp3?rlkey=b9p5yu4fms3h4g4dc74xrw05e",
  },
  "falta-envit": {
    ca: "https://dl.dropboxusercontent.com/scl/fi/nmfx8dy6irazbvuap79rm/falta-envit_ca.mp3?rlkey=qf6tjphu15to0gdxs3agr2lf2",
    es: "https://dl.dropboxusercontent.com/scl/fi/nmfx8dy6irazbvuap79rm/falta-envit_ca.mp3?rlkey=qf6tjphu15to0gdxs3agr2lf2",
  },
  "joc-fora": {
    ca: "https://dl.dropboxusercontent.com/scl/fi/385yt98enpwm6bhujhdj1/joc-fora_ca.mp3?rlkey=v3dcza4to8edcben1x94y89y7",
    es: "https://dl.dropboxusercontent.com/scl/fi/jlbr6opvtda75bo2x1met/joc-fora_es.mp3?rlkey=jsreq3w9kanybtchj6p6lo2q0",
  },
  "no-vull": {
    ca: "https://dl.dropboxusercontent.com/scl/fi/p56b3mz7p8c0wobkxsh4c/no-vull_ca.mp3?rlkey=ujmght3wdd79btu4umwq6p4r1",
    es: "https://dl.dropboxusercontent.com/scl/fi/y6w70layh73ig7utbbtwm/no-vull_es.mp3?rlkey=bvlkum35xqegzo0mtykd9e5nf",
  },
  quatre: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/no6osv0bszijltvhju6g7/quatre_ca.mp3?rlkey=hx9rsl26gmln4qzmcigw2frog",
    es: "https://dl.dropboxusercontent.com/scl/fi/ex1cv83no9x80u4hlo0b6/quatre_es.mp3?rlkey=53p5pnanl8y1fxyb4jsewwepa",
  },
  renvit: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/hdkb8ffpuvittq6h9asyl/renvit_ca.mp3?rlkey=c3fbb5tfg0vn6jbua7zx15zb9",
    es: "https://dl.dropboxusercontent.com/scl/fi/ffwuf7xzqs74jpoe5vj20/renvit_es.mp3?rlkey=5ld4jy88tz4fgjg6ucohk1w12",
  },
  retruc: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/cg7tmtmbu7d2ck12ctu50/retruc_ca.mp3?rlkey=cao63l7qo6zdputkmdokolcuf",
    es: "https://dl.dropboxusercontent.com/scl/fi/ibcm35le1bivsxig4dlja/retruc_es.mp3?rlkey=szh1me8brhv6hqeyz8hqhmi05",
  },
  truc: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/h88lx8r9eibthtxgzxj2t/truc_ca.mp3?rlkey=qrj6kj3l15qqdg9vdksshsh1v",
    es: "https://dl.dropboxusercontent.com/scl/fi/l254nimnqmkp3im46aeuo/truc_es.mp3?rlkey=kenu30fdvy189dlaaxssxpzc9",
  },
  "truc-passe": {
    ca: "https://dl.dropboxusercontent.com/scl/fi/t0qvp48eravhv4hbej548/truc-passe_ca.mp3?rlkey=w25cr7nlk1m27illkd0rofxzg",
    es: "https://dl.dropboxusercontent.com/scl/fi/um6j6suoihqk3wr5d7inv/truc-passe_es.mp3?rlkey=yq4d31ou4snosizfluvdunwot",
  },
  vull: {
    ca: "https://dl.dropboxusercontent.com/scl/fi/1vekzuegge0bkqt0tnz9y/vull_ca.mp3?rlkey=ik6b3jsrwp8bjk3ak9m72c5ql",
    es: "https://dl.dropboxusercontent.com/scl/fi/hsriefm7rcics3svmqmo4/vull_es.mp3?rlkey=k1rpr8nrrzewbezmxpo2vlke4",
  },
};

const CACHE_NAME = "truc-shouts-v1";

/** URL canònica que utilitzem com a clau dins la Cache API. */
function cacheKeyFor(key: ShoutAudioKey, lang: ShoutLang): string {
  return `/__shout-audio__/${key}_${lang}.mp3`;
}

/** Memòria viva de blob URLs ja resolts (evita refetch dins la sessió). */
const blobUrlCache = new Map<string, string>();

/**
 * `HTMLAudioElement` ja preparat (blob URL assignat i `load()` cridat) per
 * a cada (key, lang). Es reutilitza en cada reproducció per evitar la
 * latència de `new Audio()` + decodificació la primera vegada.
 */
const audioElementCache = new Map<string, HTMLAudioElement>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

async function getCache(): Promise<Cache | null> {
  if (!isBrowser() || !("caches" in window)) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * Descarrega tots els àudios i els guarda a la Cache del dispositiu.
 * És segur cridar-la diverses vegades: si ja són a la cache no es
 * tornen a baixar.
 */
export async function preloadShoutAudios(): Promise<void> {
  if (!isBrowser()) return;
  const cache = await getCache();
  const tasks: Promise<void>[] = [];
  for (const key of Object.keys(SHOUT_AUDIO_URLS) as ShoutAudioKey[]) {
    for (const lang of ["ca", "es"] as ShoutLang[]) {
      tasks.push(ensureCached(key, lang, cache));
    }
  }
  await Promise.allSettled(tasks);
}

async function ensureCached(
  key: ShoutAudioKey,
  lang: ShoutLang,
  cache: Cache | null,
): Promise<void> {
  const remoteUrl = SHOUT_AUDIO_URLS[key]?.[lang];
  if (!remoteUrl) return;
  const cacheKey = cacheKeyFor(key, lang);
  try {
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return;
    }
    const res = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return;
    if (cache) {
      // Guardem amb una Request "interna" perquè la URL remota pot canviar
      // (query strings de Dropbox amb rlkey) sense invalidar la cache.
      const body = await res.clone().blob();
      const stored = new Response(body, {
        headers: { "Content-Type": "audio/mpeg" },
      });
      await cache.put(cacheKey, stored);
    }
  } catch {
    // Sense connexió o error de xarxa: no fem res. Quan toqui reproduir,
    // `getShoutAudioUrl` farà fallback directe a la URL remota.
  }
}

/**
 * Retorna una URL utilitzable per crear un `new Audio(url)`. Prioritza
 * la versió cachejada al dispositiu (blob URL local i instantani); si
 * no està disponible, retorna la URL remota com a fallback.
 */
export async function getShoutAudioUrl(
  key: ShoutAudioKey,
  lang: ShoutLang,
): Promise<string | null> {
  const remoteUrl = SHOUT_AUDIO_URLS[key]?.[lang];
  if (!remoteUrl) return null;
  const cacheKey = cacheKeyFor(key, lang);

  const memHit = blobUrlCache.get(cacheKey);
  if (memHit) return memHit;

  const cache = await getCache();
  if (cache) {
    try {
      let hit = await cache.match(cacheKey);
      if (!hit) {
        await ensureCached(key, lang, cache);
        hit = await cache.match(cacheKey);
      }
      if (hit) {
        const blob = await hit.blob();
        // Forcem el tipus MIME perquè la resposta original de Dropbox arriba
        // amb Content-Type: application/json + nosniff i el navegador no
        // reprodueix l'àudio si no és audio/*.
        const typed = blob.type.startsWith("audio/")
          ? blob
          : new Blob([blob], { type: "audio/mpeg" });
        const url = URL.createObjectURL(typed);
        blobUrlCache.set(cacheKey, url);
        return url;
      }
    } catch {
      // Cau a baix → fetch directe
    }
  }

  // Sense Cache API (o ha fallat): descarreguem ara, envolcallem amb el
  // tipus correcte i creem un blob URL en memòria.
  try {
    const res = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return remoteUrl;
    const raw = await res.blob();
    const typed = raw.type.startsWith("audio/")
      ? raw
      : new Blob([raw], { type: "audio/mpeg" });
    const url = URL.createObjectURL(typed);
    blobUrlCache.set(cacheKey, url);
    return url;
  } catch {
    return remoteUrl;
  }
}

/**
 * Retorna (o crea) un `HTMLAudioElement` ja preparat amb la font assignada
 * i `load()` cridat, perquè `play()` arrenqui sense latència perceptible.
 * Cau a `null` si no està disponible.
 */
export async function getShoutAudioElement(
  key: ShoutAudioKey,
  lang: ShoutLang,
): Promise<HTMLAudioElement | null> {
  if (!isBrowser()) return null;
  const cacheKey = cacheKeyFor(key, lang);
  const cached = audioElementCache.get(cacheKey);
  if (cached) return cached;
  const url = await getShoutAudioUrl(key, lang);
  if (!url) return null;
  try {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    audio.load();
    audioElementCache.set(cacheKey, audio);
    return audio;
  } catch {
    return null;
  }
}

/** Allibera els blob URLs en memòria (útil en tests). */
export function clearShoutAudioMemory(): void {
  for (const url of blobUrlCache.values()) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
  blobUrlCache.clear();
  audioElementCache.clear();
}