import { describe, expect, it } from "vitest";
import { buildSessionProgress } from "../session-progress";

describe("buildSessionProgress", () => {
  it("returns an empty array for empty input", () => {
    expect(buildSessionProgress([])).toEqual([]);
  });

  it("counts a skipped session in total but not done — the core deliberate behavior", () => {
    const result = buildSessionProgress([
      { deadline_id: "d-1", session_status: "done" },
      { deadline_id: "d-1", session_status: "skipped" },
      { deadline_id: "d-1", session_status: "planned" },
    ]);
    expect(result).toEqual([{ deadlineId: "d-1", done: 1, total: 3, ratio: 1 / 3 }]);
  });

  it("drops done by one (4/5 -> 3/5) when a done session is reopened back to planned", () => {
    const sessions = ["done", "done", "done", "done", "planned"] as const;
    const before = buildSessionProgress(sessions.map((session_status) => ({ deadline_id: "d-1", session_status })));
    expect(before).toEqual([{ deadlineId: "d-1", done: 4, total: 5, ratio: 4 / 5 }]);

    const reopened = ["done", "done", "done", "planned", "planned"] as const;
    const after = buildSessionProgress(reopened.map((session_status) => ({ deadline_id: "d-1", session_status })));
    expect(after).toEqual([{ deadlineId: "d-1", done: 3, total: 5, ratio: 3 / 5 }]);
  });

  it("groups multiple deadlines independently", () => {
    const result = buildSessionProgress([
      { deadline_id: "d-1", session_status: "done" },
      { deadline_id: "d-1", session_status: "planned" },
      { deadline_id: "d-2", session_status: "done" },
    ]);
    expect(result.find((p) => p.deadlineId === "d-1")).toEqual({ deadlineId: "d-1", done: 1, total: 2, ratio: 0.5 });
    expect(result.find((p) => p.deadlineId === "d-2")).toEqual({ deadlineId: "d-2", done: 1, total: 1, ratio: 1 });
  });

  it("ignores sessions with deadline_id null", () => {
    const result = buildSessionProgress([
      { deadline_id: null, session_status: "planned" },
      { deadline_id: "d-1", session_status: "done" },
    ]);
    expect(result).toEqual([{ deadlineId: "d-1", done: 1, total: 1, ratio: 1 }]);
  });
});
