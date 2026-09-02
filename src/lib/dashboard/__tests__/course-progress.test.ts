import { describe, expect, it } from "vitest";
import { buildCourseProgress } from "../course-progress";
import { makeCourse, makeDeadline, makeTodoItem, makeTodoList } from "./fixtures";

describe("buildCourseProgress", () => {
  it("tallies deadline-only course progress", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-1", code: "CS101", name: "Intro to CS" })],
      [
        makeDeadline({ id: "d-1", course_id: "c-1", status: "Completed" }),
        makeDeadline({ id: "d-2", course_id: "c-1", status: "Not Started" }),
      ],
      [],
      [],
    );
    expect(result).toEqual([{ courseId: "c-1", courseCode: "CS101", courseName: "Intro to CS", done: 1, total: 2, ratio: 0.5 }]);
  });

  it("tallies to-do items via their list's course_id", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-1" })],
      [],
      [
        makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: true }),
        makeTodoItem({ id: "todo-2", list_id: "list-1", is_done: false }),
      ],
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
    );
    expect(result[0]).toMatchObject({ done: 1, total: 2, ratio: 0.5 });
  });

  it("combines deadlines and to-do items for the same course", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-1" })],
      [makeDeadline({ id: "d-1", course_id: "c-1", status: "Completed" })],
      [makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: true })],
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
    );
    expect(result[0]).toMatchObject({ done: 2, total: 2, ratio: 1 });
  });

  it("excludes cancelled deadlines from both done and total", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-1" })],
      [
        makeDeadline({ id: "d-1", course_id: "c-1", status: "Completed" }),
        makeDeadline({ id: "d-2", course_id: "c-1", status: "Cancelled" }),
      ],
      [],
      [],
    );
    expect(result[0]).toMatchObject({ done: 1, total: 1 });
  });

  it("excludes freestanding to-do lists (course_id null) from every course", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-1" })],
      [],
      [makeTodoItem({ id: "todo-1", list_id: "list-1", is_done: false })],
      [makeTodoList({ id: "list-1", course_id: null })],
    );
    expect(result).toEqual([]);
  });

  it("excludes courses with no linked items", () => {
    const result = buildCourseProgress([makeCourse({ id: "c-1" }), makeCourse({ id: "c-2" })], [makeDeadline({ course_id: "c-1" })], [], []);
    expect(result.map((r) => r.courseId)).toEqual(["c-1"]);
  });

  it("sorts by ratio ascending (furthest behind first)", () => {
    const result = buildCourseProgress(
      [makeCourse({ id: "c-behind" }), makeCourse({ id: "c-ahead" })],
      [
        makeDeadline({ id: "d-1", course_id: "c-behind", status: "Not Started" }),
        makeDeadline({ id: "d-2", course_id: "c-ahead", status: "Completed" }),
      ],
      [],
      [],
    );
    expect(result.map((r) => r.courseId)).toEqual(["c-behind", "c-ahead"]);
  });
});
