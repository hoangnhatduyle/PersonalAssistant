import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { TRIAGE_VOICE_TOP_N } from "@/lib/email-triage/constants";
import { createTriageDeps } from "@/lib/email-triage/deps";
import { attentionItems } from "@/lib/email-triage/rank";
import { runEmailTriage } from "@/lib/email-triage/run-triage";
import { loadTriageItems } from "@/lib/email-triage/store";
import { buildAttentionSpeech } from "@/lib/email-triage/summary";
import type { SuggestedAction, TriageBucket, TriageItem } from "@/lib/email-triage/types";
import { getMailAccount } from "@/lib/mail/accounts";
import { MailReauthRequiredError } from "@/lib/mail/errors";
import type { MailProvider } from "@/lib/mail/types";

/** The part of a triage item the model needs to read it out and propose a follow-up mutation (never the email body, which isn't stored). */
export interface VoiceTriageItem {
  id: string;
  bucket: TriageBucket;
  subject: string;
  from: string;
  reason: string;
  suggestedAction: SuggestedAction | null;
}

export interface EmailTriageLookupResult {
  message: string;
  items?: VoiceTriageItem[];
  /** Set when the provider wasn't specified and the model must ask which account. */
  needsProvider?: boolean;
  connected?: MailProvider[];
}

const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };

function toVoiceItems(items: readonly TriageItem[]): VoiceTriageItem[] {
  return attentionItems(items)
    .slice(0, TRIAGE_VOICE_TOP_N)
    .map((item) => ({
      id: item.id,
      bucket: item.bucket,
      subject: item.subject,
      from: item.sender,
      reason: item.reason,
      suggestedAction: item.suggestedAction,
    }));
}

export interface EmailTriageLookupFn {
  (supabase: SupabaseClient<Database>, userId: string): Promise<EmailTriageLookupResult>;
}

/** get_email_triage: reads the STORED attention list only (no provider or OpenAI calls). */
export const runStoredEmailTriageLookup: EmailTriageLookupFn = async (supabase, userId) => {
  const items = await loadTriageItems(supabase, userId, { scope: "open" });
  return { message: buildAttentionSpeech(items), items: toVoiceItems(items) };
};

export interface RunEmailTriageLookupFn {
  (
    supabase: SupabaseClient<Database>,
    userId: string,
    args: { provider: MailProvider | null; days: number | null },
  ): Promise<EmailTriageLookupResult>;
}

/**
 * triage_email: a live triage run, only for an explicit "check my email". With
 * no provider it does not run: it reports which accounts are connected so the
 * model asks "Gmail or Outlook?" and calls again with the answer.
 */
export const runEmailTriageLookup: RunEmailTriageLookupFn = async (supabase, userId, args) => {
  if (!args.provider) {
    const connected: MailProvider[] = [];
    for (const provider of ["google", "microsoft"] as const) {
      try {
        if (await getMailAccount(supabase, userId, provider)) connected.push(provider);
      } catch (error) {
        // An undecryptable account is still "connected" (it needs reconnecting), so it is offered and the run reports reauth.
        if (error instanceof MailReauthRequiredError) connected.push(provider);
        else throw error;
      }
    }
    if (connected.length === 0) {
      return { message: "You haven't connected Gmail or Outlook yet. Connect one from the dashboard first.", connected, needsProvider: false };
    }
    return {
      message: "Which account should I check, Gmail or Outlook?",
      needsProvider: true,
      connected,
    };
  }

  const label = PROVIDER_LABEL[args.provider];
  let outcome;
  try {
    outcome = await runEmailTriage(createTriageDeps(supabase, userId, args.provider), {
      provider: args.provider,
      days: args.days,
    });
  } catch (error) {
    console.error(`voice email triage failed for ${args.provider}`, error);
    return { message: `I couldn't check your ${label} just now. Please try again in a bit.` };
  }

  switch (outcome.status) {
    case "not_connected":
      return { message: `${label} isn't connected yet. You can connect it from the dashboard.` };
    case "needs_reauth":
      return { message: `Your ${label} connection expired. Reconnect it from the dashboard and I can check again.` };
    case "rate_limited":
      return { message: "You've checked email a lot recently. Try again in a little while." };
    case "ok": {
      const providerItems = outcome.items.filter((item) => item.provider === args.provider);
      const { classified, skippedAlreadyTriaged, truncated } = outcome.stats;
      const lead =
        classified === 0 && skippedAlreadyTriaged === 0
          ? `I found no unread ${label} mail in that range. `
          : `I checked ${classified} new ${classified === 1 ? "email" : "emails"} in ${label}. `;
      const tail = truncated ? " There was more unread mail than I check in one go." : "";
      return { message: `${lead}${buildAttentionSpeech(providerItems)}${tail}`, items: toVoiceItems(providerItems) };
    }
  }
};
