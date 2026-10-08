import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { classifyMessages, extractSuggestedAction } from "@/lib/email-triage/llm";
import { checkTriageRateLimit } from "@/lib/email-triage/rate-limit";
import { buildGmailQuery, buildGraphFilter } from "@/lib/email-triage/range";
import type { TriageDeps } from "@/lib/email-triage/run-triage";
import {
  loadExistingTriageRows,
  loadTriageItems,
  saveStage2Updates,
  upsertTriageRows,
} from "@/lib/email-triage/store";
import { getMailAccount } from "@/lib/mail/accounts";
import { getGoogleMessageDetail, searchGoogleMessages } from "@/lib/mail/google/client";
import { refreshGoogleAccessToken } from "@/lib/mail/google/oauth";
import { getMicrosoftMessageDetail, searchMicrosoftMessages } from "@/lib/mail/microsoft/client";
import { refreshMicrosoftAccessToken } from "@/lib/mail/microsoft/oauth";
import type { MailProvider } from "@/lib/mail/types";
import { loadUserTimezone } from "@/lib/voice/intent";

/** Production wiring for runEmailTriage: the caller's RLS-scoped client, the real provider APIs and OpenAI. */
export function createTriageDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: MailProvider,
): TriageDeps {
  return {
    now: () => new Date(),

    async getAccount() {
      const account = await getMailAccount(supabase, userId, provider);
      return account ? { id: account.id, refreshToken: account.refreshToken } : null;
    },

    async checkRateLimit() {
      return (await checkTriageRateLimit(supabase, userId, provider)).allowed;
    },

    refreshAccessToken: (refreshToken) =>
      provider === "google" ? refreshGoogleAccessToken(refreshToken) : refreshMicrosoftAccessToken(refreshToken),

    searchUnread: (accessToken, since, max) =>
      provider === "google"
        ? searchGoogleMessages(accessToken, { maxResults: max, query: buildGmailQuery(since) })
        : searchMicrosoftMessages(accessToken, { top: max, folder: "inbox", filter: buildGraphFilter(since) }),

    async fetchBody(accessToken, messageId) {
      const detail =
        provider === "google"
          ? await getGoogleMessageDetail(accessToken, messageId)
          : await getMicrosoftMessageDetail(accessToken, messageId);
      return { html: detail.html, text: detail.text };
    },

    loadExisting: (accountId, messageIds) => loadExistingTriageRows(supabase, userId, accountId, messageIds),

    async loadCourses() {
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, name")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .is("person_id", null);
      if (error) throw error;
      return data ?? [];
    },

    getTimeZone: () => loadUserTimezone(supabase, userId),

    classify: classifyMessages,
    extract: extractSuggestedAction,

    saveNew: (rows) => upsertTriageRows(supabase, userId, rows),
    saveStage2: (updates) => saveStage2Updates(supabase, userId, updates),
    loadOpenItems: () => loadTriageItems(supabase, userId, { scope: "open" }),
  };
}
