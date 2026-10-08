import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { TRIAGE_TTL_DAYS } from "@/lib/email-triage/constants";
import { rankTriageItems } from "@/lib/email-triage/rank";
import type { ExistingTriageRow, NewTriageRow, Stage2Update } from "@/lib/email-triage/run-triage";
import {
  suggestedActionSchema,
  type TriageBucket,
  type TriageItem,
  type TriageStatus,
} from "@/lib/email-triage/types";
import type { MailProvider } from "@/lib/mail/types";

type TriageRow = Database["public"]["Tables"]["mail_triage_items"]["Row"];

const MAX_STORED_TEXT_CHARS = 500;

function clip(text: string): string {
  return text.length > MAX_STORED_TEXT_CHARS ? text.slice(0, MAX_STORED_TEXT_CHARS) : text;
}

export function rowToTriageItem(row: TriageRow): TriageItem {
  // A stored action that no longer validates is dropped, never trusted.
  const action = row.suggested_action ? suggestedActionSchema.safeParse(row.suggested_action) : null;
  return {
    id: row.id,
    provider: row.provider as MailProvider,
    messageId: row.provider_message_id,
    subject: row.subject,
    sender: row.sender,
    receivedAt: row.received_at,
    webLink: row.web_link,
    bucket: row.bucket as TriageBucket,
    reason: row.reason,
    suggestedAction: action?.success ? action.data : null,
    status: row.status as TriageStatus,
    triagedAt: row.triaged_at,
    expiresAt: row.expires_at,
  };
}

/** Non-expired stored results, ranked. `scope: "open"` = unresolved only; "all" includes dismissed/acted (for mail-card badges). */
export async function loadTriageItems(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: { provider?: MailProvider; scope?: "open" | "all"; now?: Date } = {},
): Promise<TriageItem[]> {
  const { provider, scope = "open", now = new Date() } = options;
  let query = supabase
    .from("mail_triage_items")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", now.toISOString());
  if (scope === "open") query = query.eq("status", "open");
  if (provider) query = query.eq("provider", provider);
  const { data, error } = await query;
  if (error) throw error;
  return rankTriageItems((data ?? []).map(rowToTriageItem));
}

/** Non-expired rows for these message ids on one account (any status): what a run must not re-classify. */
export async function loadExistingTriageRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
  messageIds: string[],
  now: Date = new Date(),
): Promise<ExistingTriageRow[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("mail_triage_items")
    .select("id, provider_message_id, bucket, status, stage2_at, received_at")
    .eq("user_id", userId)
    .eq("mail_account_id", accountId)
    .in("provider_message_id", messageIds)
    .gt("expires_at", now.toISOString());
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    messageId: row.provider_message_id,
    bucket: row.bucket as TriageBucket,
    status: row.status,
    stage2At: row.stage2_at,
    receivedAt: row.received_at,
  }));
}

/** Inserts new results. Upserts on (mail_account_id, provider_message_id) so a message whose earlier row expired but hasn't been swept yet is refreshed rather than conflicting. */
export async function upsertTriageRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: NewTriageRow[],
  now: Date = new Date(),
): Promise<void> {
  if (rows.length === 0) return;
  const triagedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TRIAGE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("mail_triage_items").upsert(
    rows.map((row) => ({
      user_id: userId,
      mail_account_id: row.accountId,
      provider: row.message.provider,
      provider_message_id: row.message.id,
      subject: clip(row.message.subject),
      sender: clip(row.message.from),
      received_at: row.message.receivedAt,
      web_link: row.message.webLink ?? null,
      bucket: row.bucket,
      reason: row.reason,
      suggested_action: (row.suggestedAction as Json | null) ?? null,
      stage2_at: row.stage2At,
      status: "open",
      resolved_at: null,
      triaged_at: triagedAt,
      expires_at: expiresAt,
    })),
    { onConflict: "mail_account_id,provider_message_id" },
  );
  if (error) throw error;
}

export async function saveStage2Updates(
  supabase: SupabaseClient<Database>,
  userId: string,
  updates: Stage2Update[],
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase
      .from("mail_triage_items")
      .update({ suggested_action: (update.suggestedAction as Json | null) ?? null, stage2_at: update.stage2At })
      .eq("id", update.id)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

/** Resolves an open item. Returns false when no open item with that id belongs to the user (already resolved, expired-and-swept, or not theirs). */
export async function setTriageItemStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  status: Exclude<TriageStatus, "open">,
  now: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from("mail_triage_items")
    .update({ status, resolved_at: now.toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
