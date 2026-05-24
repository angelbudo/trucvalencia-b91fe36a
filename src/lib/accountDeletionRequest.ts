import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

/** Esquema compartit (client + servidor reaplicat). Vegeu també la check
 *  constraint i la RLS policy d'`account_deletion_requests`. */
export const accountDeletionRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, { message: "L'adreça és massa curta" })
    .max(254, { message: "L'adreça és massa llarga" })
    .email({ message: "Adreça de correu invàlida" }),
  reason: z
    .string()
    .trim()
    .max(1000, { message: "Màxim 1000 caràcters" })
    .optional()
    .or(z.literal("")),
  deviceId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]{4,80}$/, {
      message: "Format invàlid (4-80 caràcters alfanumèrics, _, -)",
    })
    .optional()
    .or(z.literal("")),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Cal confirmar la sol·licitud" }),
  }),
});

export type AccountDeletionRequestInput = z.infer<typeof accountDeletionRequestSchema>;

export interface AccountDeletionRequestResult {
  ok: true;
  requestId: string;
}

/** Envia la sol·licitud al servidor. Llança Error amb missatge llegible si
 *  alguna validació o el servidor falla. */
export async function submitAccountDeletionRequest(
  input: AccountDeletionRequestInput,
): Promise<AccountDeletionRequestResult> {
  const parsed = accountDeletionRequestSchema.parse(input);
  const { data, error } = await supabase.functions.invoke<
    AccountDeletionRequestResult | { error: string }
  >("account-deletion-request", {
    body: {
      email: parsed.email,
      reason: parsed.reason || undefined,
      deviceId: parsed.deviceId || undefined,
      confirmed: true,
    },
  });
  if (error) {
    throw new Error(error.message ?? "Error de connexió");
  }
  if (!data || "error" in data) {
    throw new Error((data as { error: string } | null)?.error ?? "Error desconegut");
  }
  return data;
}