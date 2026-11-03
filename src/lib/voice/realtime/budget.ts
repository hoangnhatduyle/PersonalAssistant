import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { localMidnightUtc, partsInZone } from "@/lib/voice/schedule-time-window";
import { REALTIME_DAILY_SECONDS, REALTIME_MAX_CALL_SECONDS, REALTIME_MIN_START_SECONDS } from "@/lib/voice/realtime/constants";

/**
 * Call-time accounting for the Realtime voice call caps.
 *
 * A call's audio never passes through this server, so usage is derived from the
 * voice_realtime_calls rows (written by the server, see 0058) rather than from
 * anything the browser claims. The rule is deliberately conservative: a call is
 * never counted for longer than the per-call cap, and a call that was never
 * ended (app killed mid-call) is counted up to the cap once it is old enough
 * that it must be over, so closing the app cannot be used to dodge the budget.
 */

export interface CallRow {
  started_at: string;
  ended_at: string | null;
}

export interface CallBudget {
  usedSeconds: number;
  remainingSeconds: number;
  /** Seconds the next call may run: the per-call cap, or what is left of the day if that is less. */
  maxSeconds: number;
  /** False once too little of the day remains to be worth starting a call. */
  allowed: boolean;
}

/** Seconds one call counts for. */
export function callSeconds(row: CallRow, now: Date): number {
  const start = new Date(row.started_at).getTime();
  const capEnd = start + REALTIME_MAX_CALL_SECONDS * 1000;
  // An open call has lasted until now at most; one older than the cap must be over.
  const end = Math.min(row.ended_at ? new Date(row.ended_at).getTime() : now.getTime(), capEnd);
  return Math.max(0, Math.round((end - start) / 1000));
}

export function usedSeconds(rows: readonly CallRow[], now: Date): number {
  return rows.reduce((total, row) => total + callSeconds(row, now), 0);
}

export function computeCallBudget(rows: readonly CallRow[], now: Date): CallBudget {
  const used = usedSeconds(rows, now);
  const remaining = Math.max(0, REALTIME_DAILY_SECONDS - used);
  return {
    usedSeconds: used,
    remainingSeconds: remaining,
    maxSeconds: Math.min(REALTIME_MAX_CALL_SECONDS, remaining),
    allowed: remaining >= REALTIME_MIN_START_SECONDS,
  };
}

/** The UTC instant the user's current local day began. A call counts toward the day it started in. */
export function localDayStart(now: Date, timezone: string): Date {
  const { year, month, day } = partsInZone(now, timezone);
  return localMidnightUtc(year, month, day, timezone);
}

export async function loadCallBudget(supabase: SupabaseClient<Database>, userId: string, timezone: string, now: Date): Promise<CallBudget> {
  const { data, error } = await supabase
    .from("voice_realtime_calls")
    .select("started_at, ended_at")
    .eq("user_id", userId)
    .gte("started_at", localDayStart(now, timezone).toISOString());
  if (error) throw new Error(`call budget lookup failed: ${error.message}`);
  return computeCallBudget(data ?? [], now);
}
