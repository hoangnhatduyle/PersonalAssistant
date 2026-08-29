import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Gates the `rollout` state machine's STAGED -> LIVE promotion
 * (SPEC-INFRA-004 NC-INF-002/AC-1): confirms Postgres is actually reachable
 * through this deployment's Supabase config, not just that the process
 * started.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" });

    if (error) {
      // NC-API-004: no raw DB error text to an unauthenticated caller — log
      // it server-side and return a generic status instead.
      console.error("health check: Postgres query failed", error);
      return NextResponse.json({ status: "unhealthy" }, { status: 503 });
    }

    return NextResponse.json({ status: "healthy" }, { status: 200 });
  } catch (error) {
    console.error("health check: unexpected error", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
