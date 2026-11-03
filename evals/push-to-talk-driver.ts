import { runConversationTurn } from "@/lib/voice/conversation-core";
import { setDraftMutation } from "@/lib/voice/conversation-memory";
import type { TurnRecord } from "./cases";
import type { TurnDriver } from "./drivers";
import type { EvalFixture } from "./fixture";
import { freshConversation } from "./fresh-conversation";
import { observe } from "./probe";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

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

export const pushToTalkDriver: TurnDriver = {
  id: "pushtotalk",
  async runCase(f, turns) {
    const conversationId = await freshConversation(f);
    const records: TurnRecord[] = [];

    for (const transcript of turns) {
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
      records.push(record);
      if (transcript !== turns.at(-1)) await persistTurn(f, conversationId, record);
    }
    return records;
  },
};
