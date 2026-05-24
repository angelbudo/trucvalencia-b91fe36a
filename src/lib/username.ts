import { supabase } from "@/integrations/supabase/client";

export const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameFormat(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "El nom d'usuari no pot estar buit";
  if (u.length < 3) return "Mínim 3 caràcters";
  if (u.length > 20) return "Màxim 20 caràcters";
  if (!USERNAME_REGEX.test(u))
    return "Només lletres minúscules, xifres i _ (ha de començar per lletra)";
  return null;
}

function readLocalDisplayName(): string {
  if (typeof window === "undefined") return "Jugador";
  try {
    const stored = window.localStorage.getItem("truc:player-name")?.trim();
    return stored ? stored.slice(0, 24) : "Jugador";
  } catch {
    return "Jugador";
  }
}

function makeFriendCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function ensureOwnProfileExists(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Has d'iniciar sessió");

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return;
  if (readError && readError.code !== "PGRST116") {
    console.warn("[ensureOwnProfileExists] read", readError.message);
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    user_id: user.id,
    display_name: readLocalDisplayName(),
    email: user.email ?? null,
    friend_code: makeFriendCode(),
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}

async function isUsernameFreeInProfiles(username: string): Promise<boolean | null> {
  const { count, error } = await supabase
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("username", username);
  if (error) return null;
  return (count ?? 0) === 0;
}

async function isUsernameReserved(username: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("is_username_reserved", { p_username: username });
  if (error) return null;
  return Boolean(data);
}

export async function isUsernameAvailable(raw: string): Promise<boolean | null> {
  const u = normalizeUsername(raw);
  if (validateUsernameFormat(u)) return false;
  const { data, error } = await supabase.rpc("is_username_available", { p_username: u });
  if (!error && data === true) return true;

  const reserved = await isUsernameReserved(u);
  if (reserved === true) return false;

  const freeInProfiles = await isUsernameFreeInProfiles(u);
  if (freeInProfiles !== null) return freeInProfiles;

  if (error) console.warn("[isUsernameAvailable]", error.message);
  return null;
}

const ERR_MAP: Record<string, string> = {
  invalid_username: "Nom d'usuari no vàlid",
  invalid_format: "Format incorrecte",
  reserved_username: "Aquest nom està reservat",
  username_taken: "Aquest nom d'usuari ja està agafat",
  not_authenticated: "Has d'iniciar sessió",
  profile_not_found: "Perfil no trobat",
};

export async function setUsername(raw: string): Promise<void> {
  const u = normalizeUsername(raw);
  const formatErr = validateUsernameFormat(u);
  if (formatErr) throw new Error(formatErr);
  await ensureOwnProfileExists();
  let { error } = await supabase.rpc("set_username", { p_username: u });
  const firstMessage = (error?.message || "").toLowerCase();
  if (error && firstMessage.includes("profile_not_found")) {
    await ensureOwnProfileExists();
    ({ error } = await supabase.rpc("set_username", { p_username: u }));
  }
  if (error) {
    const msg = (error.message || "").toLowerCase();
    for (const [k, v] of Object.entries(ERR_MAP)) {
      if (msg.includes(k)) throw new Error(v);
    }
    throw new Error(error.message);
  }
}