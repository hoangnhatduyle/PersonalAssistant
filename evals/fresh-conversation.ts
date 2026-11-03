import type { EvalFixture } from "./fixture";

/**
 * Each run gets its own conversation row, inserted already-ended so it never
 * collides with the partial unique index that allows only one active
 * conversation per user -- that is what lets runs share one fixture user and
 * still execute concurrently.
 */
export async function freshConversation(f: EvalFixture): Promise<string> {
  const { data, error } = await f.admin
    .from("voice_conversations")
    // end_reason is constrained to be set exactly when ended_at is, and the
    // enum only has "explicit" | "timeout".
    .insert({ user_id: f.userId, ended_at: new Date().toISOString(), end_reason: "explicit" })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create eval conversation: ${error.message}`);
  return data.id as string;
}
