import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { unauthorizedResponse, type ApiResponseBody } from "@/lib/api/response";
import type { NextResponse } from "next/server";

export interface AuthenticatedContext {
  supabase: SupabaseClient<Database>;
  user: AuthUser;
}

/**
 * NC-API-001: every route verifies the authenticated user itself rather
 * than relying on RLS alone. Shared by every route in src/app/api so that
 * verification can never be silently skipped in one handler.
 */
export async function requireAuthenticatedContext(): Promise<
  AuthenticatedContext | NextResponse<ApiResponseBody<null>>
> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return unauthorizedResponse();
  }
  return { supabase, user };
}
