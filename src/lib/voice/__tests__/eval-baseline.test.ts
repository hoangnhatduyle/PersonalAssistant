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
  type CaseStat,
  type ResultLike,
  type RunStats,
} from "../../../../evals/baseline";
import { selectDrivers, type TurnDriver } from "../../../../evals/drivers";
import { describeDateKey, emptyDayOffset } from "../../../../evals/empty-day";

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
  it("counts passes and repetitions per case", () => {
    const stats = summarizeRun([result("a", true), result("a", false), result("a", true), result("b", true)]);
    expect(stats.cases).toEqual({ a: { passed: 2, reps: 3 }, b: { passed: 1, reps: 1 } });
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
  const stat = (passed: number, reps: number): CaseStat => ({ passed, reps });
  const baseline = (cases: Record<string, CaseStat>, overrides: Partial<Baseline> = {}): Baseline => ({
    version: 2,
    driver: "pushtotalk",
    recordedAt: "2026-11-03T00:00:00.000Z",
    reps: 3,
    cases,
    latency: { turns: 3, mean: 2000, p50: 2000, p95: 4000, max: 5000 },
    cachedSharePct: 80,
    modelCallsPerTurn: 2,
    gate: { ...DEFAULT_GATE },
    ...overrides,
  });
  const current = (cases: Record<string, CaseStat>, overrides: Partial<RunStats> = {}): RunStats => ({
    cases,
    latency: { turns: 3, mean: 2000, p50: 2000, p95: 4000, max: 5000 },
    cachedSharePct: 80,
    modelCallsPerTurn: 2,
    ...overrides,
  });

  describe("case pass rates", () => {
    it("holds when nothing got worse, including an improvement", () => {
      const result = compareToBaseline(current({ a: stat(3, 3), b: stat(3, 3) }), baseline({ a: stat(3, 3), b: stat(2, 3) }), true);
      expect(result).toEqual({ regressions: [], warnings: [] });
    });

    it("treats one failing rep out of three as a warning, not a regression (the model is not deterministic)", () => {
      const result = compareToBaseline(current({ a: stat(2, 3) }), baseline({ a: stat(3, 3) }), true);
      expect(result.regressions).toEqual([]);
      expect(result.warnings).toEqual(['case "a" passed 3/3 in the baseline and 2/3 now (within noise for a non-deterministic model)']);
    });

    it("flags a drop of half or more as a regression when the run has as many reps as the baseline", () => {
      const result = compareToBaseline(current({ a: stat(1, 3), b: stat(0, 3) }), baseline({ a: stat(3, 3), b: stat(3, 3) }), true);
      expect(result.regressions).toEqual(['case "a" passed 3/3 in the baseline and 1/3 now', 'case "b" passed 3/3 in the baseline and 0/3 now']);
    });

    it("does NOT fail a 1-rep run against a 3-rep baseline, however badly that single sample went", () => {
      // The reported bug: one flaky sample of a 3/3 case must not read as a regression.
      const result = compareToBaseline(current({ a: stat(0, 1) }), baseline({ a: stat(3, 3) }), true);
      expect(result.regressions).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/only 1 rep\(s\) vs 3 in the baseline -- rerun with EVAL_REPS=3/);
    });

    it("never reports a case that was already failing in the baseline as a regression", () => {
      expect(compareToBaseline(current({ a: stat(0, 3) }), baseline({ a: stat(0, 3) }), true)).toEqual({ regressions: [], warnings: [] });
      expect(compareToBaseline(current({ a: stat(1, 3) }), baseline({ a: stat(2, 3) }), true).regressions).toEqual([]);
    });

    it("ignores baseline cases that were not run (EVAL_ONLY subset)", () => {
      expect(compareToBaseline(current({ a: stat(3, 3) }), baseline({ a: stat(3, 3), b: stat(3, 3) }), false)).toEqual({ regressions: [], warnings: [] });
    });
  });

  describe("a case the baseline has never seen", () => {
    it("is fine when it passes", () => {
      expect(compareToBaseline(current({ fresh: stat(3, 3) }), baseline({}), true)).toEqual({ regressions: [], warnings: [] });
    });

    it("warns on an occasional failure and regresses on a mostly-failing one", () => {
      expect(compareToBaseline(current({ fresh: stat(2, 3) }), baseline({}), true)).toEqual({
        regressions: [],
        warnings: ['new case "fresh" (not in the baseline) passed 2/3'],
      });
      expect(compareToBaseline(current({ fresh: stat(1, 3) }), baseline({}), true).regressions).toEqual(['new case "fresh" (not in the baseline) passed 1/3']);
    });

    it("only warns when the run has fewer reps than the baseline", () => {
      const result = compareToBaseline(current({ fresh: stat(0, 1) }), baseline({}), true);
      expect(result.regressions).toEqual([]);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("latency and cache thresholds", () => {
    it("are not enforced while the gate is unset", () => {
      const worse = current({ a: stat(3, 3) }, { latency: { turns: 3, mean: 1, p50: 1, p95: 99_000, max: 99_000 }, cachedSharePct: 0 });
      expect(compareToBaseline(worse, baseline({ a: stat(3, 3) }), true).regressions).toEqual([]);
    });

    it("are enforced on a full run once set", () => {
      const gated = baseline({ a: stat(3, 3) }, { gate: { p95MarginPct: 25, maxTurnMs: 10_000, minCachedSharePct: 70 } });
      const ok = current({ a: stat(3, 3) }, { latency: { turns: 3, mean: 1, p50: 1, p95: 5000, max: 9000 }, cachedSharePct: 75 });
      expect(compareToBaseline(ok, gated, true).regressions).toEqual([]);

      const bad = current({ a: stat(3, 3) }, { latency: { turns: 3, mean: 1, p50: 1, p95: 5100, max: 12_000 }, cachedSharePct: 60 });
      const { regressions } = compareToBaseline(bad, gated, true);
      expect(regressions).toHaveLength(3);
      expect(regressions[0]).toMatch(/p95 turn latency 5100ms/);
      expect(regressions[1]).toMatch(/slowest turn 12000ms/);
      expect(regressions[2]).toMatch(/cached input share 60%/);
    });

    it("are skipped on a partial run, which says nothing about the whole suite", () => {
      const gated = baseline({ a: stat(3, 3) }, { gate: { p95MarginPct: 1, maxTurnMs: 1, minCachedSharePct: 99 } });
      const worse = current({ a: stat(3, 3) }, { latency: { turns: 1, mean: 1, p50: 1, p95: 99_000, max: 99_000 }, cachedSharePct: 0 });
      expect(compareToBaseline(worse, gated, false).regressions).toEqual([]);
    });
  });
});

describe("baseline files", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  const tempDir = () => (dir = mkdtempSync(path.join(tmpdir(), "eval-baseline-")));

  it("returns null when no baseline exists", () => {
    expect(loadBaseline("pushtotalk", tempDir())).toBeNull();
  });

  it("round-trips a baseline and keeps hand-set gate thresholds when it is rewritten", () => {
    const d = tempDir();
    const first = writeBaseline("pushtotalk", 3, summarizeRun([result("a", true)]), d);
    expect(first).toMatchObject({ version: 2, reps: 3, gate: DEFAULT_GATE });

    const file = path.join(d, "baseline.pushtotalk.json");
    const edited = { ...JSON.parse(readFileSync(file, "utf8")), gate: { p95MarginPct: 30, maxTurnMs: 12_000, minCachedSharePct: null } };
    writeFileSync(file, JSON.stringify(edited));

    const second = writeBaseline("pushtotalk", 1, summarizeRun([result("a", false)]), d);
    expect(second.gate).toEqual({ p95MarginPct: 30, maxTurnMs: 12_000, minCachedSharePct: null });
    expect(loadBaseline("pushtotalk", d)?.cases).toEqual({ a: { passed: 0, reps: 1 } });
  });

  it("reads a first-format baseline: true is a full pass rate, false is read as 0 so it can never regress", () => {
    const d = tempDir();
    writeFileSync(
      path.join(d, "baseline.pushtotalk.json"),
      JSON.stringify({
        version: 1,
        driver: "pushtotalk",
        recordedAt: "2026-11-03T00:55:30.406Z",
        reps: 3,
        cases: { solid: true, flaky: false },
        latency: { turns: 72, mean: 3763, p50: 3402, p95: 6108, max: 6872 },
        cachedSharePct: 93.6,
        modelCallsPerTurn: 1.42,
        gate: { p95MarginPct: null, maxTurnMs: null, minCachedSharePct: null },
      }),
    );
    const loaded = loadBaseline("pushtotalk", d)!;
    expect(loaded.version).toBe(2);
    expect(loaded.cases).toEqual({ solid: { passed: 3, reps: 3 }, flaky: { passed: 0, reps: 3 } });
    expect(loaded.latency.p95).toBe(6108);
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

describe("emptyDayOffset", () => {
  // weekdayOf(n) for a run on weekday `today` (0 = Sunday): the day n days from today.
  const runningOn = (today: number) => (offset: number) => (today + offset) % 7;

  it.each([0, 1, 2, 3, 4, 5, 6])("lands on a Friday, Saturday or Sunday at least two weeks out when the eval runs on weekday %i", (today) => {
    const offset = emptyDayOffset(runningOn(today));
    expect(offset).toBeGreaterThanOrEqual(14);
    expect(offset).toBeLessThanOrEqual(18);
    expect([5, 6, 0]).toContain(runningOn(today)(offset));
  });

  it("is what the old fixed 21-day offset was not: on Monday through Thursday, 21 days out is a class day", () => {
    for (const today of [1, 2, 3, 4]) expect([5, 6, 0]).not.toContain(runningOn(today)(21));
  });

  it("takes the earliest qualifying day", () => {
    expect(emptyDayOffset(runningOn(5))).toBe(14); // run on a Friday: two weeks out is a Friday
    expect(emptyDayOffset(runningOn(1))).toBe(18); // run on a Monday: two weeks out is a Monday, and Friday is the first day with no class
  });
});

describe("describeDateKey", () => {
  it("names the day the way a person would", () => {
    expect(describeDateKey("2026-11-28")).toBe("Saturday, November 28");
    expect(describeDateKey("2026-12-01")).toBe("Tuesday, December 1");
  });
});
