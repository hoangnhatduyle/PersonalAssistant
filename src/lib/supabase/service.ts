import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * SPEC-INFRA-007 NC-INF-012: SUPABASE_SERVICE_ROLE_KEY usage stays confined
 * to server-only modules that actually need to bypass RLS — never
 * client-bundled. Only src/lib/knowledge/ingestion.ts and the two routes
 * that invoke it (create, retry) — to call the service_role-only
 * knowledge-import RPCs (start_knowledge_import, complete_knowledge_import,
 * fail_knowledge_import) — and src/app/api/cron/send-reminder-emails/route.ts
 * — to read/claim every user's Delivered reminders on a scheduled,
 * non-user-session invocation — may import this. Mirrors
 * supabase/tests/helpers.ts's adminClient(), production-side.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
