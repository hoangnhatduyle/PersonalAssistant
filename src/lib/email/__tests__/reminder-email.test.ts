import { describe, expect, it } from "vitest";
import { renderReminderEmail } from "../reminder-email";

describe("renderReminderEmail", () => {
  it("includes the title and due date in subject/text/html", () => {
    const result = renderReminderEmail({ targetType: "task", title: "Submit assignment", dueAt: "2026-09-01T17:00:00.000Z" });
    expect(result.subject).toContain("Submit assignment");
    expect(result.text).toContain("Submit assignment");
    expect(result.text).toContain("Task reminder");
    expect(result.html).toContain("Submit assignment");
  });

  it("labels a deadline reminder distinctly from a task reminder", () => {
    const result = renderReminderEmail({ targetType: "deadline", title: "Essay draft", dueAt: "2026-09-01T17:00:00.000Z" });
    expect(result.text).toContain("Deadline reminder");
  });

  it("escapes HTML in a malicious title so it can't inject markup", () => {
    const result = renderReminderEmail({
      targetType: "task",
      title: "<script>alert('xss')</script>",
      dueAt: "2026-09-01T17:00:00.000Z",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
