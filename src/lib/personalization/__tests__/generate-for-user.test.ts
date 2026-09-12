import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createFeedback, createTask, type TestUser } from "../../../../supabase/tests/helpers";
import { generateSuggestionsForUser } from "../generate-for-user";
import { LOW_RATING_MIN_COUNT } from "../constants";

// Regression: the board merge (supabase/migrations/0029_board_merge.sql)
// forces reminders_enabled=false on every migrated Board Card, and a plain
// Task can independently have reminders turned off — tuning
// reminder_lead_minutes does nothing when reminders are off, so a candidate
// in that state must never reach generateSuggestion (which would call
// OpenAI) or produce a suggestion. This test exercises that skip directly
// (no OpenAI mocking needed, since a correct fix never gets that far).
describe("generateSuggestionsForUser", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("skips a task candidate with reminders_enabled=false instead of proposing a lead-time change", async () => {
    const taskId = await createTask(admin, userId, { title: "Migrated board card", reminders_enabled: false, reminder_lead_minutes: 60 });
    for (let i = 0; i < LOW_RATING_MIN_COUNT; i++) {
      await createFeedback(admin, userId, "task", taskId, { rating: 1 });
    }

    const result = await generateSuggestionsForUser(user.client, userId);

    expect(result.candidatesEvaluated).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);

    const { data: suggestions } = await admin.from("personalization_suggestions").select("id").eq("scope", "task").eq("target_id", taskId);
    expect(suggestions ?? []).toHaveLength(0);
  });
});
