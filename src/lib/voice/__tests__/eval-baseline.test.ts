import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareToBaseline,
  DEFAULT_GATE,
  loadBaseline,
  quantile,
  summarizeRun,
  writeBaseline,
  type Baseline,
  type ResultLike,
} from "../../../../evals/baseline";
import { selectDrivers, type TurnDriver } from "../../../../evals/drivers";

const turn = (wallMs: number, inputTokens = 1000, cachedInputTokens = 800, modelCalls = 2) => ({ wallMs, inputTokens, cachedInputTokens, modelCalls });
const result = (caseId: string, passed: boolean, turns = [turn(1000)]): ResultLike => ({ caseId, passed, turns });

describe("quantile", () => {
  it("interpolates between neighbouring samples and handles empty input", () => {
    expect(quantile([], 0.95)).toBe(0);
    expect(quantile([10], 0.5)).toBe(10);
    expect(quantile([0, 10, 20, 30], 0.5)).toBe(15);
    expect(quantile([0, 100], 0.95)).toBe(95);
  });
});

describe("summarizeRun", () => {
  it("marks a case passed only when every repetition passed", () => {
    const stats = summarizeRun([result("a", true), result("a", false), result("b", true)]);
    expect(stats.cases).toEqual({ a: false, b: true });
  });

  it("computes latency percentiles, cache share and round-trips per turn", () => {
    const stats = summarizeRun([result("a", true, [turn(1000, 1000, 500, 2), turn(3000, 1000, 1000, 4)])]);
    expect(stats.latency).toEqual({ turns: 2, mean: 2000, p50: 2000, p95: 2900, max: 3000 });
    expect(stats.cachedSharePct).toBe(75);
    expect(stats.modelCallsPerTurn).toBe(3);
  });

  it("reports a null cache share when no input tokens were seen", () => {
    expect(summarizeRun([result("a", true, [turn(100, 0, 0)])]).cachedSharePct).toBeNull();
  });
});

describe("compareToBaseline", () => {
  const baseline = (overrides: Partial<Baseline> = {}): Baseline => ({
    version: 1,
    driver: "pushtotalk",
    recordedAt: "2026-11-03T00:00:00.000Z",
    reps: 1,
    cases: { a: true, b: true, c: false },
    latency: { turns: 3, mean: 2000, p50: 2000, p95: 4000, max: 5000 },
    cachedSharePct: 80,
    modelCallsPerTurn: 2,
    gate: { ...DEFAULT_GATE },
    ...overrides,
  });
  const current = (cases: Record<string, boolean>, p95 = 4000, max = 5000, cachedSharePct: number | null = 80) => ({
    cases,
    latency: { turns: 3, mean: 2000, p50: 2000, p95, max },
    cachedSharePct,
    modelCallsPerTurn: 2,
  });

  it("flags a case that passed in the baseline and fails now", () => {
    expect(compareToBaseline(current({ a: true, b: false, c: false }), baseline(), true)).toEqual(['case "b" passed in the baseline and fails now']);
  });

  it("does not flag a case that already failed in the baseline, or a new case", () => {
    expect(compareToBaseline(current({ a: true, b: true, c: false, d: false }), baseline(), true)).toEqual([]);
  });

  it("ignores baseline cases that were not run (EVAL_ONLY subset)", () => {
    expect(compareToBaseline(current({ a: true }), baseline(), false)).toEqual([]);
  });

  it("does not enforce latency or cache thresholds while the gate is unset", () => {
    expect(compareToBaseline(current({ a: true, b: true }, 99_000, 99_000, 0), baseline(), true)).toEqual([]);
  });

  it("enforces the configured p95 margin, turn ceiling and cache floor on a full run", () => {
    const gated = baseline({ gate: { p95MarginPct: 25, maxTurnMs: 10_000, minCachedSharePct: 70 } });
    expect(compareToBaseline(current({ a: true, b: true }, 5000, 9000, 75), gated, true)).toEqual([]);
    const problems = compareToBaseline(current({ a: true, b: true }, 5100, 12_000, 60), gated, true);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/p95 turn latency 5100ms/);
    expect(problems[1]).toMatch(/slowest turn 12000ms/);
    expect(problems[2]).toMatch(/cached input share 60%/);
  });

  it("skips aggregate thresholds on a partial run but still enforces case regressions", () => {
    const gated = baseline({ gate: { p95MarginPct: 1, maxTurnMs: 1, minCachedSharePct: 99 } });
    expect(compareToBaseline(current({ a: false }, 99_000, 99_000, 0), gated, false)).toEqual(['case "a" passed in the baseline and fails now']);
  });
});

describe("baseline files", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("returns null when no baseline exists", () => {
    dir = mkdtempSync(path.join(tmpdir(), "eval-baseline-"));
    expect(loadBaseline("pushtotalk", dir)).toBeNull();
  });

  it("round-trips a baseline and keeps hand-set gate thresholds when it is rewritten", () => {
    dir = mkdtempSync(path.join(tmpdir(), "eval-baseline-"));
    const stats = summarizeRun([result("a", true)]);
    const first = writeBaseline("pushtotalk", 3, stats, dir);
    expect(first.gate).toEqual(DEFAULT_GATE);
    expect(first.reps).toBe(3);

    const file = path.join(dir, "baseline.pushtotalk.json");
    const edited = { ...JSON.parse(readFileSync(file, "utf8")), gate: { p95MarginPct: 30, maxTurnMs: 12_000, minCachedSharePct: null } };
    writeFileSync(file, JSON.stringify(edited));

    const second = writeBaseline("pushtotalk", 1, summarizeRun([result("a", false)]), dir);
    expect(second.gate).toEqual({ p95MarginPct: 30, maxTurnMs: 12_000, minCachedSharePct: null });
    expect(loadBaseline("pushtotalk", dir)?.cases).toEqual({ a: false });
  });
});

describe("selectDrivers", () => {
  const fake = (id: TurnDriver["id"]): TurnDriver => ({ id, runCase: async () => [] });
  const onlyPushToTalk = { pushtotalk: fake("pushtotalk") };
  const both = { ...onlyPushToTalk, realtime: fake("realtime") };

  it("defaults to the push-to-talk driver", () => {
    expect(selectDrivers(undefined, onlyPushToTalk).map((d) => d.id)).toEqual(["pushtotalk"]);
    expect(selectDrivers("pushtotalk", onlyPushToTalk).map((d) => d.id)).toEqual(["pushtotalk"]);
  });

  it("selects both drivers for EVAL_DRIVER=both and a comma list", () => {
    expect(selectDrivers("both", both).map((d) => d.id)).toEqual(["pushtotalk", "realtime"]);
    expect(selectDrivers("realtime", both).map((d) => d.id)).toEqual(["realtime"]);
  });

  it("refuses a driver that is not registered yet rather than silently skipping it", () => {
    expect(() => selectDrivers("realtime", onlyPushToTalk)).toThrow(/not available yet/);
    expect(() => selectDrivers("both", onlyPushToTalk)).toThrow(/not available yet/);
  });
});
