import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression gate for the live assistant eval.
 *
 * A baseline is a committed snapshot of one full eval run per driver: which
 * cases passed, and the latency / cache profile of the turns. A later run is
 * compared against it, so "a prompt or schema change made something worse" is a
 * failing test instead of a number somebody has to remember to read.
 *
 * Case regressions (passed in the baseline, fails now) are always enforced.
 * The latency and cache thresholds live in the baseline file's `gate` block and
 * are `null` -- report only -- until they are set from real measurements; they
 * are deliberately not guessed here.
 *
 * Pure apart from load/write, so it is unit-tested in the hermetic suite
 * (src/lib/voice/__tests__/eval-baseline.test.ts).
 */

export interface BaselineGate {
  /** Fail when p95 turn latency exceeds the baseline p95 by more than this many percent. */
  p95MarginPct: number | null;
  /** Fail when any single turn takes longer than this (ms). */
  maxTurnMs: number | null;
  /** Fail when cached input tokens fall below this share (percent) of input tokens. */
  minCachedSharePct: number | null;
}

export interface RunStats {
  /** caseId -> true when every repetition of the case passed. */
  cases: Record<string, boolean>;
  latency: { turns: number; mean: number; p50: number; p95: number; max: number };
  cachedSharePct: number | null;
  modelCallsPerTurn: number;
}

export interface Baseline extends RunStats {
  version: 1;
  driver: string;
  recordedAt: string;
  reps: number;
  gate: BaselineGate;
}

export interface ResultLike {
  caseId: string;
  passed: boolean;
  turns: Array<{ wallMs: number; inputTokens: number; cachedInputTokens: number; modelCalls: number }>;
}

export const DEFAULT_GATE: BaselineGate = { p95MarginPct: null, maxTurnMs: null, minCachedSharePct: null };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
}

export function summarizeRun(results: ResultLike[]): RunStats {
  const cases: Record<string, boolean> = {};
  for (const r of results) cases[r.caseId] = (cases[r.caseId] ?? true) && r.passed;

  const turns = results.flatMap((r) => r.turns);
  const latencies = turns.map((t) => t.wallMs).sort((a, b) => a - b);
  const inputTokens = sum(turns.map((t) => t.inputTokens));
  const cachedTokens = sum(turns.map((t) => t.cachedInputTokens));

  return {
    cases,
    latency: {
      turns: latencies.length,
      mean: latencies.length ? Math.round(sum(latencies) / latencies.length) : 0,
      p50: Math.round(quantile(latencies, 0.5)),
      p95: Math.round(quantile(latencies, 0.95)),
      max: latencies.at(-1) ?? 0,
    },
    cachedSharePct: inputTokens > 0 ? Math.round((cachedTokens / inputTokens) * 1000) / 10 : null,
    modelCallsPerTurn: turns.length ? Math.round((sum(turns.map((t) => t.modelCalls)) / turns.length) * 100) / 100 : 0,
  };
}

/**
 * Returns the reasons the current run is worse than the baseline; empty means
 * it holds. `fullRun` is false when EVAL_ONLY narrowed the cases, in which case
 * only the cases actually run are compared and the aggregate thresholds are
 * skipped (a subset's p95 says nothing about the whole suite).
 */
export function compareToBaseline(current: RunStats, baseline: Baseline, fullRun: boolean): string[] {
  const problems: string[] = [];

  for (const [id, passedBefore] of Object.entries(baseline.cases)) {
    if (!(id in current.cases)) continue;
    if (passedBefore && !current.cases[id]) problems.push(`case "${id}" passed in the baseline and fails now`);
  }

  if (!fullRun) return problems;

  const { gate } = baseline;
  if (gate.p95MarginPct !== null) {
    const limit = baseline.latency.p95 * (1 + gate.p95MarginPct / 100);
    if (current.latency.p95 > limit) {
      problems.push(`p95 turn latency ${current.latency.p95}ms exceeds the baseline ${baseline.latency.p95}ms by more than ${gate.p95MarginPct}% (limit ${Math.round(limit)}ms)`);
    }
  }
  if (gate.maxTurnMs !== null && current.latency.max > gate.maxTurnMs) {
    problems.push(`slowest turn ${current.latency.max}ms exceeds the ${gate.maxTurnMs}ms ceiling`);
  }
  if (gate.minCachedSharePct !== null && (current.cachedSharePct ?? 0) < gate.minCachedSharePct) {
    problems.push(`cached input share ${current.cachedSharePct ?? 0}% is below the ${gate.minCachedSharePct}% floor`);
  }
  return problems;
}

export function baselinePath(driver: string, dir = __dirname): string {
  return path.join(dir, `baseline.${driver}.json`);
}

export function loadBaseline(driver: string, dir = __dirname): Baseline | null {
  const file = baselinePath(driver, dir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Baseline;
}

/** Rewrites the baseline from `stats`, keeping any gate thresholds already chosen. */
export function writeBaseline(driver: string, reps: number, stats: RunStats, dir = __dirname): Baseline {
  const gate = loadBaseline(driver, dir)?.gate ?? DEFAULT_GATE;
  const baseline: Baseline = { version: 1, driver, recordedAt: new Date().toISOString(), reps, ...stats, gate };
  writeFileSync(baselinePath(driver, dir), `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}
