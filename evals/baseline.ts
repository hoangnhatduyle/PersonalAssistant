import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression gate for the live assistant eval.
 *
 * A baseline is a committed snapshot of one full eval run per driver: how often
 * each case passed, and the latency / cache profile of the turns. A later run is
 * compared against it, so "a prompt or schema change made something worse" is a
 * failing test instead of a number somebody has to remember to read.
 *
 * The model is non-deterministic, so a case is tracked as a pass RATE over the
 * baseline's repetitions, not a boolean -- a single unlucky sample of a
 * usually-passing case is noise, not a regression. A case counts as regressed
 * only when its pass rate falls by at least REGRESSION_DROP (half); a smaller
 * drop is a warning. A run with fewer reps than the baseline has too few
 * samples to call anything a regression, so there every drop is only a warning.
 *
 * The latency and cache thresholds live in the baseline file's `gate` block and
 * are `null` -- report only -- until they are set from real measurements.
 *
 * Pure apart from load/write, so it is unit-tested in the hermetic suite
 * (src/lib/voice/__tests__/eval-baseline.test.ts).
 */

/** A pass-rate drop of at least this much (0.5 = half the reps) is a regression; less is a warning. */
export const REGRESSION_DROP = 0.5;

export interface BaselineGate {
  /** Fail when p95 turn latency exceeds the baseline p95 by more than this many percent. */
  p95MarginPct: number | null;
  /** Fail when any single turn takes longer than this (ms). */
  maxTurnMs: number | null;
  /** Fail when cached input tokens fall below this share (percent) of input tokens. */
  minCachedSharePct: number | null;
}

export interface CaseStat {
  passed: number;
  reps: number;
}

export interface RunStats {
  cases: Record<string, CaseStat>;
  latency: { turns: number; mean: number; p50: number; p95: number; max: number };
  cachedSharePct: number | null;
  modelCallsPerTurn: number;
}

export interface Baseline extends RunStats {
  version: 2;
  driver: string;
  recordedAt: string;
  /** Repetitions per case the baseline was recorded with; a comparison run defaults to the same. */
  reps: number;
  gate: BaselineGate;
}

/** One repetition of one case. */
export interface ResultLike {
  caseId: string;
  passed: boolean;
  turns: Array<{ wallMs: number; inputTokens: number; cachedInputTokens: number; modelCalls: number }>;
}

export interface Comparison {
  /** Make the run fail. */
  regressions: string[];
  /** Printed, but do not fail the run: a smaller drop, or too few reps to be sure. */
  warnings: string[];
}

export const DEFAULT_GATE: BaselineGate = { p95MarginPct: null, maxTurnMs: null, minCachedSharePct: null };

/**
 * Gate thresholds a driver's baseline starts with when none has been recorded
 * yet (an existing baseline file always keeps its own). The Realtime driver is
 * seeded from its first live run (p95 5.9 s, slowest turn 8.5 s) with the same
 * 40% margin as push-to-talk, and no cache floor: every eval case opens a cold
 * session, so its cached share (about 60%) says little about a real call, where
 * the stable prefix is re-read turn after turn.
 */
export const INITIAL_GATES: Record<string, BaselineGate> = {
  realtime: { p95MarginPct: 40, maxTurnMs: 20_000, minCachedSharePct: null },
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const rate = (stat: CaseStat) => (stat.reps === 0 ? 0 : stat.passed / stat.reps);
const fraction = (stat: CaseStat) => `${stat.passed}/${stat.reps}`;

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
}

export function summarizeRun(results: ResultLike[]): RunStats {
  const cases: Record<string, CaseStat> = {};
  for (const r of results) {
    const stat = (cases[r.caseId] ??= { passed: 0, reps: 0 });
    stat.reps += 1;
    if (r.passed) stat.passed += 1;
  }

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
 * Compares the current run to the baseline. `fullRun` is false when EVAL_ONLY
 * narrowed the cases: only the cases actually run are compared and the
 * aggregate thresholds are skipped (a subset's p95 says nothing about the whole
 * suite).
 */
export function compareToBaseline(current: RunStats, baseline: Baseline, fullRun: boolean): Comparison {
  const regressions: string[] = [];
  const warnings: string[] = [];

  // A case the baseline has never seen has no rate to drop from, so judge it on
  // its own: a failing rate at or under REGRESSION_DROP, with as many samples as
  // the baseline used, is a regression; any other failure is a warning.
  for (const [id, now] of Object.entries(current.cases)) {
    if (id in baseline.cases || now.passed === now.reps) continue;
    const detail = `new case "${id}" (not in the baseline) passed ${fraction(now)}`;
    if (rate(now) <= REGRESSION_DROP && now.reps >= baseline.reps) regressions.push(detail);
    else warnings.push(detail);
  }

  for (const [id, before] of Object.entries(baseline.cases)) {
    const now = current.cases[id];
    if (!now) continue;
    const drop = rate(before) - rate(now);
    if (drop <= 0) continue;

    const detail = `case "${id}" passed ${fraction(before)} in the baseline and ${fraction(now)} now`;
    const enoughSamples = now.reps >= before.reps;
    if (drop >= REGRESSION_DROP && enoughSamples) regressions.push(detail);
    else if (drop >= REGRESSION_DROP) warnings.push(`${detail} (only ${now.reps} rep(s) vs ${before.reps} in the baseline -- rerun with EVAL_REPS=${before.reps} to confirm)`);
    else warnings.push(`${detail} (within noise for a non-deterministic model)`);
  }

  if (!fullRun) return { regressions, warnings };

  const { gate } = baseline;
  if (gate.p95MarginPct !== null) {
    const limit = baseline.latency.p95 * (1 + gate.p95MarginPct / 100);
    if (current.latency.p95 > limit) {
      regressions.push(`p95 turn latency ${current.latency.p95}ms exceeds the baseline ${baseline.latency.p95}ms by more than ${gate.p95MarginPct}% (limit ${Math.round(limit)}ms)`);
    }
  }
  if (gate.maxTurnMs !== null && current.latency.max > gate.maxTurnMs) {
    regressions.push(`slowest turn ${current.latency.max}ms exceeds the ${gate.maxTurnMs}ms ceiling`);
  }
  if (gate.minCachedSharePct !== null && (current.cachedSharePct ?? 0) < gate.minCachedSharePct) {
    regressions.push(`cached input share ${current.cachedSharePct ?? 0}% is below the ${gate.minCachedSharePct}% floor`);
  }
  return { regressions, warnings };
}

export function baselinePath(driver: string, dir = __dirname): string {
  return path.join(dir, `baseline.${driver}.json`);
}

interface BaselineV1 extends Omit<Baseline, "version" | "cases"> {
  version: 1;
  /** caseId -> true when every repetition passed. */
  cases: Record<string, boolean>;
}

/**
 * Reads a baseline, upgrading the first format in memory. v1 stored only
 * whether every rep passed: `true` means all reps did (full rate), and `false`
 * only says "at least one failed" with no count, so it is read as 0 -- an
 * already-failing case can then never be reported as a regression. Re-record
 * to get real rates.
 */
export function loadBaseline(driver: string, dir = __dirname): Baseline | null {
  const file = baselinePath(driver, dir);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as Baseline | BaselineV1;
  if (raw.version === 2) return raw;
  const cases = Object.fromEntries(Object.entries(raw.cases).map(([id, allPassed]) => [id, { passed: allPassed ? raw.reps : 0, reps: raw.reps }]));
  return { ...raw, version: 2, cases };
}

/** Rewrites the baseline from `stats`, keeping any gate thresholds already chosen. */
export function writeBaseline(driver: string, reps: number, stats: RunStats, dir = __dirname): Baseline {
  const gate = loadBaseline(driver, dir)?.gate ?? INITIAL_GATES[driver] ?? DEFAULT_GATE;
  const baseline: Baseline = { version: 2, driver, recordedAt: new Date().toISOString(), reps, ...stats, gate };
  writeFileSync(baselinePath(driver, dir), `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}
