import { describe, expect, it } from "vitest";
import { buildCourseWorkloadPreviews, sortCoursesByWorkloadUrgency } from "../course-workload";
import { makeCourse, makeDeadline, makeTask, makeTodoList } from "@/lib/dashboard/__tests__/fixtures";

describe("buildCourseWorkloadPreviews", () => {
  it("counts pending deadlines and marks urgent when one is Overdue", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [
        makeDeadline({ id: "d-1", course_id: "c-1", status: "Overdue" }),
        makeDeadline({ id: "d-2", course_id: "c-1", status: "Not Started" }),
      ],
      [],
      [],
    );
    expect(previews.get("c-1")).toMatchObject({
      pendingDeadlineCount: 2,
      overdueDeadlineCount: 1,
      openTaskCount: 0,
      urgencyTone: "urgent",
    });
  });

  it("is warn (not urgent) when items are pending but none are overdue", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [makeDeadline({ id: "d-1", course_id: "c-1", status: "Not Started" })],
      [],
      [],
    );
    expect(previews.get("c-1")).toMatchObject({ urgencyTone: "warn" });
  });

  it("is neutral when a course has no pending deadlines or open tasks", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [makeDeadline({ id: "d-1", course_id: "c-1", status: "Completed" })],
      [],
      [],
    );
    expect(previews.get("c-1")).toMatchObject({ pendingDeadlineCount: 0, urgencyTone: "neutral" });
  });

  it("excludes Completed and Cancelled deadlines from pendingDeadlineCount", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [
        makeDeadline({ id: "d-1", course_id: "c-1", status: "Completed" }),
        makeDeadline({ id: "d-2", course_id: "c-1", status: "Cancelled" }),
      ],
      [],
      [],
    );
    expect(previews.get("c-1")).toMatchObject({ pendingDeadlineCount: 0 });
  });

  it("counts a task as open workload via list_id -> todo_lists.course_id", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [],
      [makeTask({ id: "t-1", list_id: "list-1", status: "Open" })],
      [makeTodoList({ id: "list-1", course_id: "c-1" })],
    );
    expect(previews.get("c-1")).toMatchObject({ openTaskCount: 1, urgencyTone: "warn" });
  });

  it("excludes a Done task and a freestanding list's task from openTaskCount", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [],
      [
        makeTask({ id: "t-1", list_id: "list-1", status: "Done" }),
        makeTask({ id: "t-2", list_id: "list-personal", status: "Open" }),
      ],
      [makeTodoList({ id: "list-1", course_id: "c-1" }), makeTodoList({ id: "list-personal", course_id: null })],
    );
    expect(previews.get("c-1")).toMatchObject({ openTaskCount: 0 });
  });

  it("sorts nextDeadlines soonest-due-first and caps the preview list", () => {
    const previews = buildCourseWorkloadPreviews(
      [makeCourse({ id: "c-1" })],
      [
        makeDeadline({ id: "d-late", course_id: "c-1", due_at: "2026-03-01T00:00:00Z", status: "Not Started" }),
        makeDeadline({ id: "d-soon", course_id: "c-1", due_at: "2026-01-10T00:00:00Z", status: "Not Started" }),
      ],
      [],
      [],
    );
    expect(previews.get("c-1")?.nextDeadlines.map((d) => d.id)).toEqual(["d-soon", "d-late"]);
  });

  it("gives every requested course an entry, including one with no linked items", () => {
    const previews = buildCourseWorkloadPreviews([makeCourse({ id: "c-1" }), makeCourse({ id: "c-2" })], [], [], []);
    expect(previews.size).toBe(2);
    expect(previews.get("c-2")).toMatchObject({ pendingDeadlineCount: 0, openTaskCount: 0, urgencyTone: "neutral" });
  });
});

describe("sortCoursesByWorkloadUrgency", () => {
  it("orders urgent before warn before neutral, stable within a tier", () => {
    const courses = [makeCourse({ id: "c-neutral" }), makeCourse({ id: "c-urgent" }), makeCourse({ id: "c-warn" })];
    const previewByCourseId = new Map([
      ["c-neutral", { pendingDeadlineCount: 0, openTaskCount: 0, overdueDeadlineCount: 0, urgencyTone: "neutral" as const, nextDeadlines: [], openTasks: [] }],
      ["c-urgent", { pendingDeadlineCount: 1, openTaskCount: 0, overdueDeadlineCount: 1, urgencyTone: "urgent" as const, nextDeadlines: [], openTasks: [] }],
      ["c-warn", { pendingDeadlineCount: 1, openTaskCount: 0, overdueDeadlineCount: 0, urgencyTone: "warn" as const, nextDeadlines: [], openTasks: [] }],
    ]);
    const sorted = sortCoursesByWorkloadUrgency(courses, previewByCourseId);
    expect(sorted.map((c) => c.id)).toEqual(["c-urgent", "c-warn", "c-neutral"]);
  });

  it("treats a course missing from the preview map as neutral", () => {
    const courses = [makeCourse({ id: "c-1" }), makeCourse({ id: "c-2" })];
    const previewByCourseId = new Map([
      ["c-2", { pendingDeadlineCount: 1, openTaskCount: 0, overdueDeadlineCount: 1, urgencyTone: "urgent" as const, nextDeadlines: [], openTasks: [] }],
    ]);
    const sorted = sortCoursesByWorkloadUrgency(courses, previewByCourseId);
    expect(sorted.map((c) => c.id)).toEqual(["c-2", "c-1"]);
  });
});
