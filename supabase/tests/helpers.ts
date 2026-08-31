import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Deliberately untyped (no Database generic): several tests here insert
// intentionally-invalid payloads (e.g. an out-of-range enum value) to prove
// the DB trigger rejects them, which a typed client would refuse to compile.
export interface TestUser {
  userId: string;
  email: string;
  client: SupabaseClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set (needed for supabase/tests/*.test.ts)`);
  }
  return value;
}

export function adminClient(): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a confirmed test user + profile row and returns a client
 * authenticated as that user (RLS applies as it would for a real request).
 */
export async function createAuthenticatedUser(): Promise<TestUser> {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const admin = adminClient();

  const email = `test-${randomUUID()}@example.com`;
  const password = `Pw-${randomUUID()}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`failed to create test user: ${createError?.message}`, { cause: createError });
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`failed to sign in test user: ${signInError.message}`, { cause: signInError });
  }

  return { userId: created.user.id, email, client };
}

export async function createCourse(
  admin: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("courses")
    .insert({ user_id: userId, name: "Test Course", ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create course: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createDeadline(
  admin: SupabaseClient,
  userId: string,
  courseId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("deadlines")
    .insert({
      user_id: userId,
      course_id: courseId,
      title: "Test Deadline",
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create deadline: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createTask(
  admin: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("tasks")
    .insert({ user_id: userId, title: "Test Task", ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create task: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createReminder(
  admin: SupabaseClient,
  userId: string,
  targetType: "deadline" | "task",
  targetId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("reminders")
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      trigger_at: new Date(Date.now() + 3_600_000).toISOString(),
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create reminder: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createVoiceSession(
  admin: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("voice_sessions")
    .insert({ user_id: userId, ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create voice_session: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createVoiceSpeakRequest(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin.from("voice_speak_requests").insert({ user_id: userId }).select("id").single();
  if (error) throw new Error(`failed to create voice_speak_request: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createFeedback(
  admin: SupabaseClient,
  userId: string,
  targetType: "deadline" | "task" | "reminder",
  targetId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("feedback")
    .insert({ user_id: userId, target_type: targetType, target_id: targetId, rating: 4, ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create feedback: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createUserPreferences(
  admin: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("user_preferences")
    .insert({ user_id: userId, ...overrides })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create user_preferences: ${error.message}`, { cause: error });
  return data.id as string;
}

export async function createKnowledgeSource(
  admin: SupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("knowledge_sources")
    .insert({
      user_id: userId,
      source_type: "pasted_text",
      title: "Test Knowledge Source",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create knowledge_source: ${error.message}`, { cause: error });
  return data.id as string;
}

/** A valid, cheaply-constructed 1536-dim vector literal for pgvector columns. */
export function fakeEmbedding(seed = 0): string {
  return `[${Array.from({ length: 1536 }, (_, i) => ((i + seed) % 7) / 7).join(",")}]`;
}

export async function createKnowledgeChunk(
  admin: SupabaseClient,
  sourceId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("knowledge_chunks")
    .insert({
      source_id: sourceId,
      user_id: userId,
      chunk_index: 0,
      chunk_text: "Test chunk text",
      embedding: fakeEmbedding(),
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create knowledge_chunk: ${error.message}`, { cause: error });
  return data.id as string;
}

/** Applies a sequence of legal state transitions via sequential UPDATEs. */
export async function walkTransitions(
  admin: SupabaseClient,
  table: string,
  id: string,
  column: string,
  path: string[],
): Promise<void> {
  for (const state of path) {
    const { error } = await admin.from(table).update({ [column]: state }).eq("id", id);
    if (error) {
      throw new Error(`unexpected rejection walking ${table}.${column} to ${state}: ${error.message}`, {
        cause: error,
      });
    }
  }
}
