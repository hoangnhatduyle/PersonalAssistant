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
 * evals/baseline.<driver>.json: a case that passed in the baseline and fails now
 * fails the run, as do any latency / cache thresholds set in the baseline's
 * `gate` block. No baseline file means the comparison is skipped with a note.
 *
 * Needs a running local Supabase and a real OPENAI_API_KEY; excluded from the
 * ordinary vitest run (see vitest.config.ts).
 */

const REPS = Number(process.env.EVAL_REPS ?? 1);
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
        console.log(`\n##### DRIVER: ${driver.id} #####`);
        const queue = selected.flatMap((c) => Array.from({ length: REPS }, (_, rep) => ({ evalCase: c, rep })));
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
              console.log(`[${String(done).padStart(3)}/${queue.length}] ${result.passed ? "PASS" : "FAIL"} ${result.caseId}`);
            }
          }),
        );

        report(results);
        allFailures.push(...results.filter((r) => !r.passed).map((r) => `${driver.id}:${r.caseId}`));

        const stats = summarizeRun(results);
        const fullRun = !ONLY;
        if (UPDATE_BASELINE) {
          if (!fullRun) throw new Error("EVAL_UPDATE_BASELINE=1 needs a full run: unset EVAL_ONLY");
          const written = writeBaseline(driver.id, REPS, stats);
          console.log(`\nBASELINE written: evals/baseline.${driver.id}.json (gate: ${JSON.stringify(written.gate)})`);
          continue;
        }
        const baseline = loadBaseline(driver.id);
        if (!baseline) {
          console.log(`\nBASELINE: none for "${driver.id}" -- run with EVAL_UPDATE_BASELINE=1 to record one. Comparison skipped.`);
          continue;
        }
        const problems = compareToBaseline(stats, baseline, fullRun);
        console.log(`\nBASELINE (${baseline.recordedAt}): ${problems.length === 0 ? "holds" : `${problems.length} regression(s)`}`);
        for (const p of problems) console.log(`  x ${p}`);
        regressions.push(...problems.map((p) => `${driver.id}: ${p}`));
      }

      expect(allFailures, "see the failure detail printed above").toEqual([]);
      expect(regressions, "regressions against the committed baseline").toEqual([]);
    },
    // No cap: a full run makes dozens of real model calls. `testTimeout: 0` in
    // evals/vitest.config.ts covers the runner; this keeps it explicit here too.
    0,
  );
});

function report(results: CaseResult[]): void {
  const allTurns = results.flatMap((r) => r.turns);
  const latencies = allTurns.map((t) => t.wallMs).sort((a, b) => a - b);
  const inputTokens = sum(allTurns.map((t) => t.inputTokens));
  const cachedTokens = sum(allTurns.map((t) => t.cachedInputTokens));

  console.log(`\n=== RESULT ===`);
  console.log(`cases   ${results.filter((r) => r.passed).length}/${results.length} passed`);
  console.log(`checks  ${sum(results.map((r) => r.checks.filter((c) => c.ok).length))}/${sum(results.map((r) => r.checks.length))} passed`);

  console.log(`\n=== BY GROUP ===`);
  for (const group of [...new Set(results.map((r) => r.group))].sort()) {
    const inGroup = results.filter((r) => r.group === group);
    console.log(`${group.padEnd(12)} ${inGroup.filter((r) => r.passed).length}/${inGroup.length}`);
  }

  console.log(`\n=== LATENCY (turn, ms) ===`);
  console.log(
    `turns ${latencies.length}  mean ${Math.round(sum(latencies) / latencies.length)}  p50 ${Math.round(quantile(latencies, 0.5))}  ` +
      `p95 ${Math.round(quantile(latencies, 0.95))}  max ${latencies.at(-1)}  over 10s ${latencies.filter((ms) => ms > 10_000).length}`,
  );

  console.log(`\n=== TOKENS (per turn) ===`);
  console.log(
    `input ${Math.round(inputTokens / allTurns.length)}  cached ${Math.round(cachedTokens / allTurns.length)} ` +
      `(${pct(cachedTokens, inputTokens)} of input)  output ${Math.round(sum(allTurns.map((t) => t.outputTokens)) / allTurns.length)}  ` +
      `reasoning ${Math.round(sum(allTurns.map((t) => t.reasoningTokens)) / allTurns.length)}`,
  );
  console.log(`model round-trips per turn ${(sum(allTurns.map((t) => t.modelCalls)) / allTurns.length).toFixed(2)}`);

  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) return;
  console.log(`\n=== FAILURE DETAIL ===`);
  for (const failure of failures) {
    const final = failure.turns.at(-1);
    console.log(`\n${failure.caseId}${REPS > 1 ? ` [rep ${failure.rep}]` : ""} -> ${final?.outcome.kind ?? "threw"}`);
    if (failure.error) console.log(`  ! ${failure.error}`);
    for (const turn of failure.turns) console.log(`  > "${turn.transcript}"`);
    if (final) console.log(`  tools: ${final.toolCalls.map((c) => c.name).join(", ") || "none"}`);
    for (const c of failure.checks.filter((c) => !c.ok)) console.log(`  x ${c.label}${c.got ? ` | got: ${c.got}` : ""}`);
  }
}
