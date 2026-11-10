import { describe, expect, it } from "vitest";
import { summarizeChecklistRows } from "../checklist-summary";

describe("summarizeChecklistRows", () => {
  it("returns nothing for no rows", () => {
    expect(summarizeChecklistRows([])).toEqual([]);
  });

  it("tallies done and total per task", () => {
    const rows = [
      { task_id: "t-1", is_done: true },
      { task_id: "t-1", is_done: false },
      { task_id: "t-2", is_done: true },
      { task_id: "t-1", is_done: true },
    ];
    expect(summarizeChecklistRows(rows)).toEqual([
      { task_id: "t-1", done: 2, total: 3 },
      { task_id: "t-2", done: 1, total: 1 },
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [{ task_id: "t-1", is_done: true }];
    const snapshot = structuredClone(rows);
    summarizeChecklistRows(rows);
    expect(rows).toEqual(snapshot);
  });
});
