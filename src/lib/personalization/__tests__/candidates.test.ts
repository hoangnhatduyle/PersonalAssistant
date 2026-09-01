import { describe, expect, it } from "vitest";
import { groupLowRatingFeedback, type LowRatingFeedbackRow } from "@/lib/personalization/candidates";

function row(overrides: Partial<LowRatingFeedbackRow> = {}): LowRatingFeedbackRow {
  return {
    id: crypto.randomUUID(),
    scope: "course",
    targetId: "course-1",
    rating: 1,
    comment: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("groupLowRatingFeedback", () => {
  it("groups rows by (scope, targetId)", () => {
    const rows = [
      row({ targetId: "course-1" }),
      row({ targetId: "course-1" }),
      row({ targetId: "course-1" }),
      row({ scope: "task", targetId: "task-1" }),
    ];

    const groups = groupLowRatingFeedback(rows, 3);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ scope: "course", targetId: "course-1" });
    expect(groups[0].feedbackIds).toHaveLength(3);
    expect(groups[0].ratings).toHaveLength(3);
  });

  it("excludes a target with fewer than minCount rows", () => {
    const rows = [row({ targetId: "course-1" }), row({ targetId: "course-1" })];

    expect(groupLowRatingFeedback(rows, 3)).toHaveLength(0);
  });

  it("keeps course and task groups with the same targetId separate", () => {
    const sharedId = "shared-id";
    const rows = [
      row({ scope: "course", targetId: sharedId }),
      row({ scope: "course", targetId: sharedId }),
      row({ scope: "task", targetId: sharedId }),
      row({ scope: "task", targetId: sharedId }),
    ];

    const groups = groupLowRatingFeedback(rows, 2);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.scope).sort()).toEqual(["course", "task"]);
  });

  it("returns an empty array for no rows", () => {
    expect(groupLowRatingFeedback([], 3)).toEqual([]);
  });

  it("preserves each row's rating/comment/createdAt in the group", () => {
    const rows = [
      row({ targetId: "course-1", rating: 1, comment: "too late" }),
      row({ targetId: "course-1", rating: 2, comment: null }),
    ];

    const groups = groupLowRatingFeedback(rows, 2);

    expect(groups[0].ratings).toEqual([
      { rating: 1, comment: "too late", createdAt: rows[0].createdAt },
      { rating: 2, comment: null, createdAt: rows[1].createdAt },
    ]);
  });
});
