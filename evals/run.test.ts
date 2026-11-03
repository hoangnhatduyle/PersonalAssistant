import { describe, expect, it } from "vitest";
import { EVAL_CASES, type Check, type TurnRecord } from "./cases";
import { compareToBaseline, loadBaseline, quantile, summarizeRun, writeBaseline } from "./baseline";
import { selectDrivers, type TurnDriver } from "./drivers";
import { DRIVERS } from "./push-to-talk-driver";
import { seedEvalFixture, type EvalFixture } from "./fixture";
import { installProbe } from "./probe";

/**
 * Live assistant eval. Runs the shipped assistant against a seeded fixture and
 * grades the final turn of each case programmatically, so a prompt or schema
 * change can be checked for regressions instead of spot-tested by hand.
 *
 *   bash evals/run.sh                       # every case, push-to-talk path
 *   EVAL_ONLY=priority-advice bash evals/run.sh
 *   EVAL_REPS=5 bash evals/run.sh           # repeat, to see flakiness
 *   EVAL_DRIVER=both bash evals/run.sh      # also the Realtime path, once registered
 *   EVAL_UPDATE_BASELINE=1 bash evals/run.sh  # record this run as the baseline
 *
 * Each driver (see drivers.ts) is compared against its committed
 * evals/baseline.<driver>.json. The model is non-deterministic, so a case is
 * judged by pass RATE (see baseline.ts): only a drop of half or more fails the
 * run, a smaller one is a warning, and so are all drops on a run with fewer reps
 * than the baseline. Latency / cache thresholds in the baseline's `gate` block
 * fail the run too. Repetitions default to the baseline's own (EVAL_REPS
 * overrides). With no baseline for a driver, any failing case fails the run; in
 * EVAL_UPDATE_BASELINE mode nothing fails, because recording is not a check.
 *
 * Needs a running local Supabase and a real OPENAI_API_KEY; excluded from the
 * ordinary vitest run (see vitest.config.ts).
 */

const REPS_OVERRIDE = process.env.EVAL_REPS ? Number(process.env.EVAL_REPS) : null;
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 2);
const ONLY = process.env.EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const UPDATE_BASELINE = process.env.EVAL_UPDATE_BASELINE === "1";

interface CaseResult {
  driver: string;
  caseId: string;
  group: string;
  rep: number;
  turns: TurnRecord[];
  checks: Check[];
  passed: boolean;
  error?: string;
}

async function runCase(driver: TurnDriver, f: EvalFixture, evalCase: (typeof EVAL_CASES)[number], rep: number): Promise<CaseResult> {
  let turns: TurnRecord[] = [];
  try {
    turns = await driver.runCase(f, evalCase.turns);
  } catch (error) {
    return {
      driver: driver.id,
      caseId: evalCase.id,
      group: evalCase.group,
      rep,
      turns,
      checks: [],
      passed: false,
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
    };
  }

  const checks = evalCase.grade(turns.at(-1)!, f);
  return { driver: driver.id, caseId: evalCase.id, group: evalCase.group, rep, turns, checks, passed: checks.every((c) => c.ok) };
}

/**
 * The report goes straight to stdout: Vitest intercepts console.log and can
 * hide it for a passing test, which left a green run with no numbers at all.
 */
const out = (line: string) => void process.stdout.write(`${line}\n`);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

describe("assistant eval", () => {
  it(
    "grades every case against the shipped assistant",
    async () => {
      installProbe();
      const drivers = selectDrivers(process.env.EVAL_DRIVER, DRIVERS);
      const fixture = await seedEvalFixture();

      const selected = ONLY ? EVAL_CASES.filter((c) => ONLY.includes(c.id)) : EVAL_CASES;
      expect(selected.length, `no cases matched EVAL_ONLY=${ONLY?.join(",")}`).toBeGreaterThan(0);

      const allFailures: string[] = [];
      const regressions: string[] = [];

      for (const driver of drivers) {
        const baseline = loadBaseline(driver.id);
        const reps = REPS_OVERRIDE ?? baseline?.reps ?? 1;
        out(`\n##### DRIVER: ${driver.id} (${reps} rep(s) per case${REPS_OVERRIDE === null && baseline ? ", the baseline's" : ""}) #####`);
        const queue = selected.flatMap((c) => Array.from({ length: reps }, (_, rep) => ({ evalCase: c, rep })));
        const results: CaseResult[] = [];
        let index = 0;
        let done = 0;

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (index < queue.length) {
              const task = queue[index++];
              const result = await runCase(driver, fixture, task.evalCase, task.rep);
              results.push(result);
              done++;
              out(`[${String(done).padStart(3)}/${queue.length}] ${result.passed ? "PASS" : "FAIL"} ${result.caseId}`);
            }
          }),
        );

        report(results, reps);

        const stats = summarizeRun(results);
        const fullRun = !ONLY;
        if (UPDATE_BASELINE) {
          if (!fullRun) throw new Error("EVAL_UPDATE_BASELINE=1 needs a full run: unset EVAL_ONLY");
          const written = writeBaseline(driver.id, reps, stats);
          out(`\nBASELINE written: evals/baseline.${driver.id}.json (${reps} rep(s); gate: ${JSON.stringify(written.gate)})`);
          continue;
        }
        if (!baseline) {
          out(`\nBASELINE: none for "${driver.id}" -- run with EVAL_UPDATE_BASELINE=1 to record one. Any failing case fails this run.`);
          allFailures.push(...results.filter((r) => !r.passed).map((r) => `${driver.id}:${r.caseId}`));
          continue;
        }
        const comparison = compareToBaseline(stats, baseline, fullRun);
        out(`\nBASELINE (${baseline.recordedAt}, ${baseline.reps} rep(s)): ${comparison.regressions.length === 0 ? "holds" : `${comparison.regressions.length} regression(s)`}`);
        for (const w of comparison.warnings) out(`  ~ ${w}`);
        for (const r of comparison.regressions) out(`  x ${r}`);
        regressions.push(...comparison.regressions.map((r) => `${driver.id}: ${r}`));
      }

      expect(allFailures, "failing cases with no baseline to judge them against; see the failure detail printed above").toEqual([]);
      expect(regressions, "regressions against the committed baseline").toEqual([]);
    },
    // No cap: a full run makes dozens of real model calls. `testTimeout: 0` in
    // evals/vitest.config.ts covers the runner; this keeps it explicit here too.
    0,
  );
});

function report(results: CaseResult[], reps: number): void {
  const allTurns = results.flatMap((r) => r.turns);
  const latencies = allTurns.map((t) => t.wallMs).sort((a, b) => a - b);
  const inputTokens = sum(allTurns.map((t) => t.inputTokens));
  const cachedTokens = sum(allTurns.map((t) => t.cachedInputTokens));

  out(`\n=== RESULT ===`);
  out(`cases   ${results.filter((r) => r.passed).length}/${results.length} passed`);
  out(`checks  ${sum(results.map((r) => r.checks.filter((c) => c.ok).length))}/${sum(results.map((r) => r.checks.length))} passed`);

  out(`\n=== BY GROUP ===`);
  for (const group of [...new Set(results.map((r) => r.group))].sort()) {
    const inGroup = results.filter((r) => r.group === group);
    out(`${group.padEnd(12)} ${inGroup.filter((r) => r.passed).length}/${inGroup.length}`);
  }

  out(`\n=== LATENCY (turn, ms) ===`);
  out(
    `turns ${latencies.length}  mean ${Math.round(sum(latencies) / latencies.length)}  p50 ${Math.round(quantile(latencies, 0.5))}  ` +
      `p95 ${Math.round(quantile(latencies, 0.95))}  max ${latencies.at(-1)}  over 10s ${latencies.filter((ms) => ms > 10_000).length}`,
  );

  out(`\n=== TOKENS (per turn) ===`);
  out(
    `input ${Math.round(inputTokens / allTurns.length)}  cached ${Math.round(cachedTokens / allTurns.length)} ` +
      `(${pct(cachedTokens, inputTokens)} of input)  output ${Math.round(sum(allTurns.map((t) => t.outputTokens)) / allTurns.length)}  ` +
      `reasoning ${Math.round(sum(allTurns.map((t) => t.reasoningTokens)) / allTurns.length)}`,
  );
  out(`model round-trips per turn ${(sum(allTurns.map((t) => t.modelCalls)) / allTurns.length).toFixed(2)}`);

  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) return;
  out(`\n=== FAILURE DETAIL ===`);
  for (const failure of failures) {
    const final = failure.turns.at(-1);
    out(`\n${failure.caseId}${reps > 1 ? ` [rep ${failure.rep}]` : ""} -> ${final?.outcome.kind ?? "threw"}`);
    if (failure.error) out(`  ! ${failure.error}`);
    for (const turn of failure.turns) out(`  > "${turn.transcript}"`);
    if (final) out(`  tools: ${final.toolCalls.map((c) => c.name).join(", ") || "none"}`);
    for (const c of failure.checks.filter((c) => !c.ok)) out(`  x ${c.label}${c.got ? ` | got: ${c.got}` : ""}`);
  }
}
