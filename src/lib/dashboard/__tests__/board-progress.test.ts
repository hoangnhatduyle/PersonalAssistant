import { describe, expect, it } from "vitest";
import { buildBoardProgress } from "../board-progress";
import { makeTask, makeTodoList } from "./fixtures";

describe("buildBoardProgress", () => {
  it("tallies task progress for a course-linked list", () => {
    const result = buildBoardProgress(
      [makeTodoList({ id: "list-1", name: "Reading", course_id: "c-1" })],
      [
        makeTask({ id: "t-1", list_id: "list-1", status: "Done" }),
        makeTask({ id: "t-2", list_id: "list-1", status: "Open" }),
      ],
    );
    expect(result).toEqual([{ listId: "list-1", listName: "Reading", done: 1, total: 2, ratio: 0.5 }]);
  });

  it("includes freestanding lists with no course_id, unlike buildCourseProgress", () => {
    const result = buildBoardProgress(
      [makeTodoList({ id: "list-personal", name: "Personal", course_id: null })],
      [makeTask({ id: "t-1", list_id: "list-personal", status: "Done" })],
    );
    expect(result).toEqual([{ listId: "list-personal", listName: "Personal", done: 1, total: 1, ratio: 1 }]);
  });

  it("excludes cancelled tasks from both done and total", () => {
    const result = buildBoardProgress(
      [makeTodoList({ id: "list-1" })],
      [
        makeTask({ id: "t-1", list_id: "list-1", status: "Done" }),
        makeTask({ id: "t-2", list_id: "list-1", status: "Cancelled" }),
      ],
    );
    expect(result[0]).toMatchObject({ done: 1, total: 1 });
  });

  it("excludes a plain task with no list_id from every list", () => {
    const result = buildBoardProgress([makeTodoList({ id: "list-1" })], [makeTask({ id: "t-1", list_id: null, status: "Open" })]);
    expect(result).toEqual([]);
  });

  it("excludes lists with no tasks filed under them", () => {
    const result = buildBoardProgress([makeTodoList({ id: "list-1" }), makeTodoList({ id: "list-2" })], [makeTask({ list_id: "list-1" })]);
    expect(result.map((r) => r.listId)).toEqual(["list-1"]);
  });

  it("sorts by ratio ascending (furthest behind first)", () => {
    const result = buildBoardProgress(
      [makeTodoList({ id: "list-behind" }), makeTodoList({ id: "list-ahead" })],
      [
        makeTask({ id: "t-1", list_id: "list-behind", status: "Open" }),
        makeTask({ id: "t-2", list_id: "list-ahead", status: "Done" }),
      ],
    );
    expect(result.map((r) => r.listId)).toEqual(["list-behind", "list-ahead"]);
  });
});
