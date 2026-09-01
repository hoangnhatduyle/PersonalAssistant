import { Resend } from "resend";
import { requireEnv } from "@/lib/env";

/**
 * Lazily constructed (mirrors requireEnv's own lazy-per-module-use
 * convention, src/lib/env.ts) so RESEND_API_KEY is only required once a
 * reminder email is actually about to be sent, not at module load/boot.
 */
export function getResendClient(): Resend {
  return new Resend(requireEnv("RESEND_API_KEY"));
}
