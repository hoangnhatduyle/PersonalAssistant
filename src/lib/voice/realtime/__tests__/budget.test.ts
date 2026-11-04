import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callSeconds, computeCallBudget, localDayStart, usedSeconds } from "../budget";
import { REALTIME_DAILY_SECONDS, REALTIME_MAX_CALL_SECONDS, REALTIME_MIN_START_SECONDS, REALTIME_WARNING_AT_SECONDS } from "../constants";

const NOW = new Date("2026-11-03T15:00:00.000Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const call = (startedSecondsAgo: number, endedSecondsAgo: number | null) => ({ started_at: ago(startedSecondsAgo), ended_at: endedSecondsAgo === null ? null : ago(endedSecondsAgo) });

describe("callSeconds", () => {
  it("counts an ended call from start to end", () => {
    expect(callSeconds(call(1000, 900), NOW)).toBe(100);
  });

  it("counts an open, recent call up to now", () => {
    expect(callSeconds(call(45, null), NOW)).toBe(45);
  });

  it("counts an open call older than the cap as exactly the cap -- closing the app cannot dodge the budget", () => {
    expect(callSeconds(call(5000, null), NOW)).toBe(REALTIME_MAX_CALL_SECONDS);
  });

  it("never counts a call for longer than the cap, even if its recorded end is later", () => {
    expect(callSeconds(call(3000, 100), NOW)).toBe(REALTIME_MAX_CALL_SECONDS);
  });

  it("treats a negative duration (clock skew) as zero", () => {
    expect(callSeconds({ started_at: ago(10), ended_at: ago(20) }, NOW)).toBe(0);
  });
});

describe("computeCallBudget", () => {
  it("gives a fresh day the full per-call cap", () => {
    expect(computeCallBudget([], NOW)).toEqual({ usedSeconds: 0, remainingSeconds: REALTIME_DAILY_SECONDS, maxSeconds: REALTIME_MAX_CALL_SECONDS, allowed: true });
  });

  it("sums the day's calls and shrinks the next call to what is left", () => {
    const rows = [call(5000, 4800), call(4000, 3400), call(3000, 2750)]; // 200 + 600 + 250 = 1050
    expect(computeCallBudget(rows, NOW)).toEqual({ usedSeconds: 1050, remainingSeconds: 150, maxSeconds: 150, allowed: true });
  });

  it("refuses a new call once less than the minimum remains", () => {
    const rows = [call(9000, 8400), call(8000, 7410)]; // 600 + 590 = 1190, 10 left
    expect(computeCallBudget(rows, NOW)).toMatchObject({ remainingSeconds: 10, allowed: true });
    const spent = [...rows, call(600, 595)]; // +5 => 1195, 5 left
    expect(computeCallBudget(spent, NOW)).toMatchObject({ remainingSeconds: 5, maxSeconds: 5, allowed: false });
    expect(REALTIME_MIN_START_SECONDS).toBe(10);
  });

  it("never goes negative when the day is overspent", () => {
    const rows = [call(9000, 8400), call(8000, 7400), call(7000, 6400)]; // three full 600s calls = 1800
    expect(computeCallBudget(rows, NOW)).toMatchObject({ usedSeconds: 1800, remainingSeconds: 0, maxSeconds: 0, allowed: false });
  });

  it("counts a call that was never ended against the day", () => {
    expect(usedSeconds([call(10_000, null), call(30, null)], NOW)).toBe(REALTIME_MAX_CALL_SECONDS + 30);
  });
});

describe("localDayStart", () => {
  it("is the user's local midnight, expressed in UTC", () => {
    // 20:00 on Nov 2 in New York (EST, after the Nov 1 DST change) -> midnight Nov 2 = 05:00Z.
    expect(localDayStart(new Date("2026-11-03T01:00:00.000Z"), "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("uses the user's calendar day, not UTC's, east of Greenwich", () => {
    // 05:00 on Nov 4 in Tokyo is still Nov 3 20:00Z; the Tokyo day began Nov 3 15:00Z.
    expect(localDayStart(new Date("2026-11-03T20:00:00.000Z"), "Asia/Tokyo").toISOString()).toBe("2026-11-03T15:00:00.000Z");
  });

  it("handles a day that contains the spring-forward gap", () => {
    // 2026-03-08 is the US DST start: midnight is still EST (UTC-5).
    expect(localDayStart(new Date("2026-03-08T18:00:00.000Z"), "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });
});

describe("limits stay consistent across layers", () => {
  // The call cap lives in SQL too (end_voice_realtime_call and close_open_voice_realtime_calls clamp the
  // recorded end time). Every migration that redefines them supersedes the last, so check the newest.
  const migrationsDir = path.join(__dirname, "../../../../../supabase/migrations");
  const newest = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && readFileSync(path.join(migrationsDir, file), "utf8").includes("function public.end_voice_realtime_call"))
    .sort()
    .at(-1)!;
  const migration = readFileSync(path.join(migrationsDir, newest), "utf8");

  it("the newest migration defining the call functions uses REALTIME_MAX_CALL_SECONDS everywhere it appears", () => {
    const caps = [...migration.matchAll(/interval '(\d+) seconds'/g)].map((m) => Number(m[1]));
    expect(caps.length).toBeGreaterThanOrEqual(2);
    expect(new Set(caps)).toEqual(new Set([REALTIME_MAX_CALL_SECONDS]));
  });

  it("the warning comes before the cap, and the daily budget fits whole calls", () => {
    expect(REALTIME_WARNING_AT_SECONDS).toBeLessThan(REALTIME_MAX_CALL_SECONDS);
    expect(REALTIME_DAILY_SECONDS % REALTIME_MAX_CALL_SECONDS).toBe(0);
  });

  it("is the 10-minute call and 20-minute day the user agreed", () => {
    expect(REALTIME_MAX_CALL_SECONDS).toBe(600);
    expect(REALTIME_DAILY_SECONDS).toBe(1200);
  });
});
