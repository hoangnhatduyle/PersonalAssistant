import { describe, expect, it } from "vitest";
import {
  getValidDeadlineEvents,
  getValidReminderEvents,
  getValidTaskEvents,
  isDeadlineTransitionEvent,
  isReminderTransitionEvent,
  isTaskTransitionEvent,
  resolveDeadlineTransition,
  resolveReminderTransition,
  resolveTaskTransition,
} from "../transitions";

// Traces: SPEC-API-004 AC-2/NC-API-002 — state fields only change through an
// explicit, validated transition event.
describe("resolveDeadlineTransition", () => {
  it("applies a legal transition", () => {
    expect(resolveDeadlineTransition("user_marks_in_progress", "Not Started")).toBe("In Progress");
    expect(resolveDeadlineTransition("user_marks_submitted", "Overdue")).toBe("Submitted");
    expect(resolveDeadlineTransition("user_confirms_done", "Submitted")).toBe("Completed");
  });

  it("rejects an event that does not apply from the current status", () => {
    expect(resolveDeadlineTransition("user_confirms_done", "Not Started")).toBeNull();
    expect(resolveDeadlineTransition("user_marks_in_progress", "Completed")).toBeNull();
  });

  it("never allows a forbidden transition (mirrors SPEC-CORE-005's forbidden list)", () => {
    // Completed -> Not Started and Cancelled -> In Progress have no event at all.
    expect(resolveDeadlineTransition("user_marks_in_progress", "Cancelled")).toBeNull();
  });
});

describe("resolveTaskTransition", () => {
  it("applies a legal transition", () => {
    expect(resolveTaskTransition("user_marks_done", "Open")).toBe("Done");
    expect(resolveTaskTransition("user_cancels", "Open")).toBe("Cancelled");
  });

  it("rejects an event that does not apply from the current status", () => {
    expect(resolveTaskTransition("user_marks_done", "Done")).toBeNull();
    expect(resolveTaskTransition("user_cancels", "Cancelled")).toBeNull();
  });
});

describe("event-name guards", () => {
  it("recognize only their own machine's events", () => {
    expect(isDeadlineTransitionEvent("user_marks_in_progress")).toBe(true);
    expect(isDeadlineTransitionEvent("user_marks_done")).toBe(false);
    expect(isTaskTransitionEvent("user_marks_done")).toBe(true);
    expect(isTaskTransitionEvent("user_marks_in_progress")).toBe(false);
    expect(isDeadlineTransitionEvent("not_a_real_event")).toBe(false);
  });

  it("never exposes the system-only due_date_passed_incomplete event", () => {
    expect(isDeadlineTransitionEvent("due_date_passed_incomplete")).toBe(false);
  });
});

// Traces: SPEC-API-004 AC-5 — all three user-initiated reminder events only
// apply from Delivered.
describe("resolveReminderTransition", () => {
  it("applies a legal transition from Delivered", () => {
    expect(resolveReminderTransition("user_acknowledges", "Delivered")).toBe("Acknowledged");
    expect(resolveReminderTransition("user_dismisses", "Delivered")).toBe("Dismissed");
    expect(resolveReminderTransition("user_snoozes", "Delivered")).toBe("Snoozed");
  });

  it("rejects every event from a non-Delivered state (AC-5)", () => {
    for (const event of ["user_acknowledges", "user_dismisses", "user_snoozes"] as const) {
      expect(resolveReminderTransition(event, "Scheduled")).toBeNull();
      expect(resolveReminderTransition(event, "Acknowledged")).toBeNull();
      expect(resolveReminderTransition(event, "Dismissed")).toBeNull();
      expect(resolveReminderTransition(event, "Snoozed")).toBeNull();
      expect(resolveReminderTransition(event, "Expired")).toBeNull();
    }
  });
});

describe("isReminderTransitionEvent", () => {
  it("recognizes only the three user-initiated reminder events", () => {
    expect(isReminderTransitionEvent("user_acknowledges")).toBe(true);
    expect(isReminderTransitionEvent("user_dismisses")).toBe(true);
    expect(isReminderTransitionEvent("user_snoozes")).toBe(true);
    expect(isReminderTransitionEvent("not_a_real_event")).toBe(false);
  });

  it("never exposes the system-only trigger_time_reached/snooze_time_reached/no_response_timeout/target_soft_deleted events", () => {
    expect(isReminderTransitionEvent("trigger_time_reached")).toBe(false);
    expect(isReminderTransitionEvent("snooze_time_reached")).toBe(false);
    expect(isReminderTransitionEvent("no_response_timeout")).toBe(false);
    expect(isReminderTransitionEvent("target_soft_deleted")).toBe(false);
  });
});

// UI transition-gating helpers (Phase 4): a transition-menu component reads
// these to render only legal actions, so this is the same single source of
// truth the resolve*Transition functions above already cover.
describe("getValidDeadlineEvents", () => {
  it("returns exactly the legal events per status, matching the forbidden-transition rules", () => {
    expect(getValidDeadlineEvents("Not Started").sort()).toEqual(["user_cancels", "user_marks_in_progress"].sort());
    expect(getValidDeadlineEvents("In Progress").sort()).toEqual(["user_cancels", "user_marks_submitted"].sort());
    // Overdue can only be submitted, never cancelled.
    expect(getValidDeadlineEvents("Overdue")).toEqual(["user_marks_submitted"]);
    expect(getValidDeadlineEvents("Submitted")).toEqual(["user_confirms_done"]);
    expect(getValidDeadlineEvents("Completed")).toEqual([]);
    expect(getValidDeadlineEvents("Cancelled")).toEqual([]);
  });
});

describe("getValidTaskEvents", () => {
  it("returns both events from Open and none from either terminal state", () => {
    expect(getValidTaskEvents("Open").sort()).toEqual(["user_cancels", "user_marks_done"].sort());
    expect(getValidTaskEvents("Done")).toEqual([]);
    expect(getValidTaskEvents("Cancelled")).toEqual([]);
  });
});

describe("getValidReminderEvents", () => {
  it("returns all three events only from Delivered", () => {
    expect(getValidReminderEvents("Delivered").sort()).toEqual(
      ["user_acknowledges", "user_dismisses", "user_snoozes"].sort(),
    );
    for (const status of ["Scheduled", "Acknowledged", "Dismissed", "Snoozed", "Expired"] as const) {
      expect(getValidReminderEvents(status)).toEqual([]);
    }
  });
});
