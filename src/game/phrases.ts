import { PlayerId } from "@/game/types";
import { translate } from "@/i18n/useT";

export type ChatPhraseId =
  | "puc-anar"
  | "vine-a-mi"
  | "vine-a-vore"
  | "a-tu"
  | "tens-mes-dun-tres"
  | "portes-un-tres"
  | "vine-al-meu-tres"
  | "vine-al-teu-tres"
  | "tinc-un-tres"
  | "tinc-bona"
  | "que-tens"
  | "tens-envit"
  | "vols-envide"
  | "vols-tornar-envidar"
  | "quant-envit"
  | "si"
  | "si-tinc-n"
  | "no"
  | "envida"
  | "tira-falta"
  | "pon-fort"
  | "pon-molesto"
  | "truca"
  | "juega-callado"
  | "vamonos"
  | "no-tinc-res";

export interface ChatPhrase {
  id: ChatPhraseId;
  text: string;
  category: "pregunta" | "resposta" | "indicacio";
  tone: "neutral" | "positive" | "negative" | "envit";
}

export const PHRASES: ChatPhrase[] = [
  { id: "puc-anar",          text: "Puc anar a tu?",      category: "pregunta",   tone: "neutral" },
  { id: "que-tens",          text: "Què tens?",           category: "pregunta",   tone: "neutral" },
  { id: "tens-mes-dun-tres", text: "Tens més d'un tres?", category: "pregunta",   tone: "neutral" },
  { id: "portes-un-tres",    text: "Portes un tres?",     category: "pregunta",   tone: "neutral" },
  { id: "tens-envit",        text: "Tens envit?",         category: "pregunta",   tone: "envit" },
  { id: "vols-envide",       text: "Vols que envide?",    category: "pregunta",   tone: "envit" },
  { id: "vols-tornar-envidar", text: "Vols tornar a envidar?", category: "pregunta", tone: "envit" },
  { id: "quant-envit",       text: "Quant envit tens?",   category: "pregunta",   tone: "envit" },

  { id: "vine-a-mi",         text: "Vine a mi!",          category: "resposta",   tone: "positive" },
  { id: "tinc-bona",         text: "Algo tinc",           category: "resposta",   tone: "positive" },
  { id: "tinc-un-tres",      text: "Tinc un tres",        category: "resposta",   tone: "neutral" },
  { id: "vine-a-vore",       text: "Vine a vore!",        category: "resposta",   tone: "neutral" },
  { id: "vine-al-meu-tres",  text: "Vine al meu tres!",   category: "resposta",   tone: "neutral" },
  { id: "a-tu",              text: "A tu!",               category: "resposta",   tone: "negative" },
  { id: "no-tinc-res",       text: "No tinc res",         category: "resposta",   tone: "negative" },
  { id: "si",                text: "Sí",                  category: "resposta",   tone: "positive" },
  { id: "si-tinc-n",         text: "Tinc {n}",            category: "resposta",   tone: "positive" },
  { id: "no",                text: "No",                  category: "resposta",   tone: "negative" },

  { id: "envida",            text: "Envida!",             category: "indicacio",  tone: "positive" },
  { id: "tira-falta",        text: "Tira la falta!",      category: "indicacio",  tone: "positive" },
  { id: "vine-al-teu-tres",  text: "Vaig al teu tres!",   category: "indicacio",  tone: "neutral" },
  { id: "pon-fort",          text: "Fica algo fort!",     category: "indicacio",  tone: "neutral" },
  { id: "pon-molesto",       text: "Fica algo que moleste!", category: "indicacio", tone: "neutral" },
  { id: "truca",             text: "Truca!",              category: "indicacio",  tone: "positive" },
  { id: "juega-callado",     text: "Juga callat!",        category: "indicacio",  tone: "neutral" },
  { id: "vamonos",           text: "Au! Anem-se'n!",      category: "indicacio",  tone: "negative" },
];

/**
 * Retorna el text d'una frase en l'idioma actiu de l'app. Es delega al
 * diccionari (clau "phrase.<id>"). Si no s'ha pogut carregar, cau al text
 * en valencià definit a `PHRASES`.
 */
export function phraseText(
  id: ChatPhraseId,
  vars?: Record<string, string | number>,
): string {
  try {
    return translate(`phrase.${id}`, vars);
  } catch {
    return PHRASES.find((p) => p.id === id)?.text ?? id;
  }
}

export const PHRASES_BY_CATEGORY = {
  pregunta:   PHRASES.filter(p => p.category === "pregunta"),
  resposta:   PHRASES.filter(p => p.category === "resposta"),
  indicacio:  PHRASES.filter(p => p.category === "indicacio"),
};

export interface ChatMessage {
  id: string;
  player: PlayerId;
  phraseId: ChatPhraseId;
  timestamp: number;
  /** Variables d'interpolació per a la frase (p. ex. {n: 31}). */
  vars?: Record<string, string | number>;
  /** Text literal a mostrar en lloc de la frase (per a cants tipus
   *  envit/truc/vull/no-vull, que no són ChatPhrase pròpies). */
  text?: string;
}