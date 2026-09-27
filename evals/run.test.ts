import { describe, expect, it } from "vitest";
import { runConversationTurn } from "@/lib/voice/conversation-core";
import { setDraftMutation } from "@/lib/voice/conversation-memory";
import { EVAL_CASES, type Check, type TurnRecord } from "./cases";
import { seedEvalFixture, type EvalFixture } from "./fixture";
import { installProbe, observe } from "./probe";

/**
 * Live assistant eval. Runs the shipped `runConversationTurn` against a seeded
 * fixture and grades the final turn of each case programmatically, so a prompt
 * or schema change can be checked for regressions instead of spot-tested by
 * hand.
 *
 *   bash evals/run.sh                       # every case
 *   EVAL_ONLY=priority-advice bash evals/run.sh
 *   EVAL_REPS=5 bash evals/run.sh           # repeat, to see flakiness
 *
 * Needs a running local Supabase and a real OPENAI_API_KEY; excluded from the
 * ordinary vitest run (see vitest.config.ts).
 */

const REPS = Number(process.env.EVAL_REPS ?? 1);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 2);
const ONLY = process.env.EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

interface CaseResult {
  caseId: string;
  group: string;
  rep: number;
  turns: TurnRecord[];
  checks: Check[];
  passed: boolean;
  error?: string;
}

/**
 * Each run gets its own conversation row, inserted already-ended so it never
 * collides with the partial unique index that allows only one active
 * conversation per user -- that is what lets runs share one fixture user and
 * still execute concurrently.
 */
async function freshConversation(f: EvalFixture): Promise<string> {
  const { data, error } = await f.admin
    .from("voice_conversations")
    // end_reason is constrained to be set exactly when ended_at is, and the
    // enum only has "explicit" | "timeout".
    .insert({ user_id: f.userId, ended_at: new Date().toISOString(), end_reason: "explicit" })
    .select("id")
    .single();
  if (error) throw new Error(`failed to create eval conversation: ${error.message}`);
  return data.id as string;
}

/** Mirrors the cross-turn state session.ts persists, so turn N+1 sees what production would. */
async function persistTurn(f: EvalFixture, conversationId: string, record: TurnRecord): Promise<void> {
  const { outcome } = record;
  if (outcome.kind === "answer") {
    await f.admin.from("voice_sessions").insert({
      user_id: f.userId,
      conversation_id: conversationId,
      transcript: record.transcript,
      response_message: outcome.message,
    });
    await setDraftMutation(f.admin as never, f.userId, conversationId, outcome.draftMutation ?? null);
    return;
  }
  // A proposal is spoken back as its summary and awaits a yes/no, which is
  // exactly what the next turn should see in history.
  await f.admin.from("voice_sessions").insert({
    user_id: f.userId,
    conversation_id: conversationId,
    transcript: record.transcript,
    response_message: outcome.summary,
  });
}

async function runCase(f: EvalFixture, evalCase: (typeof EVAL_CASES)[number], rep: number): Promise<CaseResult> {
  const conversationId = await freshConversation(f);
  const turns: TurnRecord[] = [];

  try {
    for (const transcript of evalCase.turns) {
      const started = Date.now();
      const { value: outcome, calls } = await observe(() => runConversationTurn(f.client, f.userId, transcript, conversationId));
      const record: TurnRecord = {
        transcript,
        outcome,
        toolCalls: calls.flatMap((c) => c.toolCalls),
        wallMs: Date.now() - started,
        modelCalls: calls.length,
        inputTokens: sum(calls.map((c) => c.inputTokens)),
        cachedInputTokens: sum(calls.map((c) => c.cachedInputTokens)),
        outputTokens: sum(calls.map((c) => c.outputTokens)),
        reasoningTokens: sum(calls.map((c) => c.reasoningTokens)),
      };
      turns.push(record);
      if (transcript !== evalCase.turns.at(-1)) await persistTurn(f, conversationId, record);
    }
  } catch (error) {
    return {
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
  return { caseId: evalCase.id, group: evalCase.group, rep, turns, checks, passed: checks.every((c) => c.ok) };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
}

describe("assistant eval", () => {
  it(
    "grades every case against the shipped conversation core",
    async () => {
      installProbe();
      const fixture = await seedEvalFixture();

      const selected = ONLY ? EVAL_CASES.filter((c) => ONLY.includes(c.id)) : EVAL_CASES;
      expect(selected.length, `no cases matched EVAL_ONLY=${ONLY?.join(",")}`).toBeGreaterThan(0);

      const queue = selected.flatMap((c) => Array.from({ length: REPS }, (_, rep) => ({ evalCase: c, rep })));
      const results: CaseResult[] = [];
      let index = 0;
      let done = 0;

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (index < queue.length) {
            const task = queue[index++];
            const result = await runCase(fixture, task.evalCase, task.rep);
            results.push(result);
            done++;
            console.log(`[${String(done).padStart(3)}/${queue.length}] ${result.passed ? "PASS" : "FAIL"} ${result.caseId}`);
          }
        }),
      );

      report(results);

      const failed = results.filter((r) => !r.passed);
      expect(failed.map((r) => r.caseId), "see the failure detail printed above").toEqual([]);
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

  console.log(`\n=== LATENCY (runConversationTurn, ms) ===`);
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
