import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { decryptToken, encryptToken } from "@/lib/crypto/token-encryption";
import { MailReauthRequiredError } from "@/lib/mail/errors";
import type { MailProvider } from "@/lib/mail/types";

export interface MailAccount {
  provider: MailProvider;
  providerEmail: string;
  refreshToken: string;
}

/**
 * Looks up the caller's connected account for a provider. Takes the
 * per-request, RLS-scoped client from requireAuthenticatedContext()
 * (src/lib/api/auth.ts) — never createServiceRoleClient() — RLS already
 * confines every row to its owner.
 */
export async function getMailAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
): Promise<MailAccount | null> {
  const { data, error } = await supabase
    .from("mail_accounts")
    .select("provider, provider_email, refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let refreshToken: string;
  try {
    refreshToken = decryptToken({
      ciphertext: data.refresh_token_ciphertext,
      iv: data.refresh_token_iv,
      authTag: data.refresh_token_auth_tag,
    });
  } catch (error) {
    // A rotated/wrong TOKEN_ENCRYPTION_KEY or corrupted row fails GCM's
    // auth-tag check here. Treat it exactly like a provider-revoked
    // token — same "Reconnect" UI, not an uncaught 500 on every dashboard
    // load (see /api/mail/messages/route.ts, which relies on this).
    console.error(`mail account decrypt failed for provider ${provider}`, error);
    throw new MailReauthRequiredError(provider);
  }

  return {
    provider: data.provider as MailProvider,
    providerEmail: data.provider_email,
    refreshToken,
  };
}

/** Encrypts the refresh token before it ever reaches Postgres, then upserts on (user_id, provider). */
export async function upsertMailAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
  providerEmail: string,
  refreshToken: string,
): Promise<void> {
  const encrypted = encryptToken(refreshToken);
  const { error } = await supabase
    .from("mail_accounts")
    .upsert(
      {
        user_id: userId,
        provider,
        provider_email: providerEmail,
        refresh_token_ciphertext: encrypted.ciphertext,
        refresh_token_iv: encrypted.iv,
        refresh_token_auth_tag: encrypted.authTag,
      },
      { onConflict: "user_id,provider" },
    );
  if (error) throw error;
}

export async function deleteMailAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
): Promise<void> {
  const { error } = await supabase
    .from("mail_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}
