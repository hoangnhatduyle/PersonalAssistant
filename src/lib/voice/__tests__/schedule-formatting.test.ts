import { describe, expect, it } from "vitest";
import { rankScheduleItems, formatScheduleAnswer, type ScheduleItem } from "../schedule-formatting";

const TZ = "America/Chicago";
// 8am CDT, Sep 3 -- same "now" reused across both describe blocks below so
// every existing fixture (all due Sep 3 or later) keeps landing in
// dayGroups, never overdueItems, unless a test explicitly backdates an item.
const NOW = new Date("2026-09-03T13:00:00Z");

function item(overrides: Partial<ScheduleItem> & Pick<ScheduleItem, "id" | "title" | "dueAt">): ScheduleItem {
  return { kind: "task", priority: null, context: null, ...overrides };
}

describe("rankScheduleItems", () => {
  it("buckets items into ascending local-calendar-day groups", () => {
    const items: ScheduleItem[] = [
      item({ id: "b", title: "Tomorrow item", dueAt: new Date("2026-09-04T15:00:00Z") }), // 10am CDT
      item({ id: "a", title: "Today item", dueAt: new Date("2026-09-03T15:00:00Z") }), // 10am CDT
    ];
    const { dayGroups } = rankScheduleItems(items, TZ, NOW);
    expect(dayGroups.map((g) => g.dateKey)).toEqual(["2026-09-03", "2026-09-04"]);
    expect(dayGroups[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(dayGroups[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("sorts same-day items by priority descending, treating a missing priority as Medium", () => {
    const sameDay = new Date("2026-09-03T15:00:00Z");
    const items: ScheduleItem[] = [
      item({ id: "low", title: "Low", dueAt: sameDay, priority: "Low" }),
      item({ id: "urgent", title: "Urgent", dueAt: sameDay, priority: "Urgent" }),
      item({ id: "unset", title: "Unset", dueAt: sameDay, priority: null }),
      item({ id: "high", title: "High", dueAt: sameDay, priority: "High" }),
    ];
    const [group] = rankScheduleItems(items, TZ, NOW).dayGroups;
    // unset (treated as Medium) ranks between High and Low.
    expect(group.items.map((i) => i.id)).toEqual(["urgent", "high", "unset", "low"]);
    // The stored value is never mutated to "Medium" -- it stays null.
    expect(group.items.find((i) => i.id === "unset")?.priority).toBeNull();
  });

  it("uses dueAt ascending as the final tiebreak when priority is equal", () => {
    const items: ScheduleItem[] = [
      item({ id: "later", title: "Later", dueAt: new Date("2026-09-03T20:00:00Z"), priority: "High" }),
      item({ id: "earlier", title: "Earlier", dueAt: new Date("2026-09-03T14:00:00Z"), priority: "High" }),
    ];
    const [group] = rankScheduleItems(items, TZ, NOW).dayGroups;
    expect(group.items.map((i) => i.id)).toEqual(["earlier", "later"]);
  });

  describe("overdue partition", () => {
    it("an item due on a day before now's day lands in overdueItems, not dayGroups", () => {
      const items: ScheduleItem[] = [item({ id: "a", title: "Stale task", dueAt: new Date("2026-09-01T15:00:00Z") })]; // two days before NOW
      const { overdueItems, dayGroups } = rankScheduleItems(items, TZ, NOW);
      expect(overdueItems.map((i) => i.id)).toEqual(["a"]);
      expect(dayGroups).toEqual([]);
    });

    it("an item due earlier today (same calendar day as now) stays in dayGroups, not overdueItems", () => {
      const earlierToday = new Date("2026-09-03T11:00:00Z"); // 6am CDT -- before NOW's 8am CDT, same calendar day
      const items: ScheduleItem[] = [item({ id: "a", title: "Morning task", dueAt: earlierToday })];
      const { overdueItems, dayGroups } = rankScheduleItems(items, TZ, NOW);
      expect(overdueItems).toEqual([]);
      expect(dayGroups).toHaveLength(1);
      expect(dayGroups[0].items.map((i) => i.id)).toEqual(["a"]);
    });

    it("sorts overdueItems by priority descending across items due on different days", () => {
      const items: ScheduleItem[] = [
        item({ id: "low", title: "Low, overdue 5 days", dueAt: new Date("2026-08-29T15:00:00Z"), priority: "Low" }),
        item({ id: "urgent", title: "Urgent, overdue 5 days", dueAt: new Date("2026-08-29T16:00:00Z"), priority: "Urgent" }),
        item({ id: "medium", title: "Medium, overdue 1 day", dueAt: new Date("2026-09-02T15:00:00Z"), priority: "Medium" }),
      ];
      const { overdueItems } = rankScheduleItems(items, TZ, NOW);
      expect(overdueItems.map((i) => i.id)).toEqual(["urgent", "medium", "low"]);
    });

    it("tiebreaks equal priority by dueAt ascending (longest overdue first)", () => {
      const items: ScheduleItem[] = [
        item({ id: "recent", title: "Overdue 1 day", dueAt: new Date("2026-09-02T15:00:00Z"), priority: "High" }),
        item({ id: "oldest", title: "Overdue 5 days", dueAt: new Date("2026-08-29T15:00:00Z"), priority: "High" }),
      ];
      const { overdueItems } = rankScheduleItems(items, TZ, NOW);
      expect(overdueItems.map((i) => i.id)).toEqual(["oldest", "recent"]);
    });

    it("treats a null priority as Medium for overdueItems ranking, same as dayGroups", () => {
      const items: ScheduleItem[] = [
        item({ id: "low", title: "Low", dueAt: new Date("2026-08-29T15:00:00Z"), priority: "Low" }),
        item({ id: "unset", title: "Unset", dueAt: new Date("2026-08-30T15:00:00Z"), priority: null }),
        item({ id: "high", title: "High", dueAt: new Date("2026-08-31T15:00:00Z"), priority: "High" }),
      ];
      const { overdueItems } = rankScheduleItems(items, TZ, NOW);
      // unset (treated as Medium) ranks between High and Low.
      expect(overdueItems.map((i) => i.id)).toEqual(["high", "unset", "low"]);
      expect(overdueItems.find((i) => i.id === "unset")?.priority).toBeNull();
    });

    it("partitions a mixed overdue/current fixture correctly, leaving dayGroups' own grouping/sort untouched", () => {
      const items: ScheduleItem[] = [
        item({ id: "overdue-low", title: "Overdue Low", dueAt: new Date("2026-08-29T15:00:00Z"), priority: "Low" }),
        item({ id: "overdue-urgent", title: "Overdue Urgent", dueAt: new Date("2026-09-01T15:00:00Z"), priority: "Urgent" }),
        item({ id: "today-high", title: "Today High", dueAt: new Date("2026-09-03T20:00:00Z"), priority: "High" }),
        item({ id: "tomorrow", title: "Tomorrow", dueAt: new Date("2026-09-04T15:00:00Z") }),
      ];
      const { overdueItems, dayGroups } = rankScheduleItems(items, TZ, NOW);
      expect(overdueItems.map((i) => i.id)).toEqual(["overdue-urgent", "overdue-low"]);
      expect(dayGroups.map((g) => g.dateKey)).toEqual(["2026-09-03", "2026-09-04"]);
      expect(dayGroups[0].items.map((i) => i.id)).toEqual(["today-high"]);
      expect(dayGroups[1].items.map((i) => i.id)).toEqual(["tomorrow"]);
    });
  });
});

describe("formatScheduleAnswer", () => {
  const now = NOW; // 8am CDT, Sep 3

  it("returns the empty message when there are no items", () => {
    const message = formatScheduleAnswer([], { timezone: TZ, now, style: "listing", emptyMessage: "You have nothing due today." });
    expect(message).toBe("You have nothing due today.");
  });

  it("listing: phrases a single item as the only item due", () => {
    const items: ScheduleItem[] = [item({ id: "a", title: "Homework 1", dueAt: new Date("2026-09-03T20:00:00Z") })]; // 3pm CDT
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "listing", emptyMessage: "nothing" });
    expect(message).toBe("The only item that is due is Homework 1, due today at 3:00 PM.");
  });

  it("listing: uses First/Secondly/Finally ordinal phrasing across multiple items", () => {
    const items: ScheduleItem[] = [
      item({ id: "a", title: "Homework 1", dueAt: new Date("2026-09-03T20:00:00Z"), priority: "High" }), // today 3pm
      item({ id: "b", title: "Check bill", dueAt: new Date("2026-09-03T22:00:00Z"), priority: "Medium" }), // today 5pm
      item({ id: "c", title: "Career fair", dueAt: new Date("2026-09-04T20:00:00Z") }), // tomorrow 3pm
    ];
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "listing", emptyMessage: "nothing" });
    expect(message).toBe(
      "The first item that is due is Homework 1, due today at 3:00 PM. " +
        "Secondly, Check bill is due today at 5:00 PM. " +
        "Finally, Career fair is due tomorrow at 3:00 PM.",
    );
  });

  it("listing: renders 'Title (context)' when a course/list name is set, bare title otherwise", () => {
    const items: ScheduleItem[] = [
      item({ id: "a", title: "Homework 1", dueAt: new Date("2026-09-03T20:00:00Z"), context: "CS 101" }),
      item({ id: "b", title: "Buy groceries", dueAt: new Date("2026-09-03T22:00:00Z"), context: null }),
    ];
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "listing", emptyMessage: "nothing" });
    expect(message).toBe(
      "The first item that is due is Homework 1 (CS 101), due today at 3:00 PM. Secondly, Buy groceries is due today at 5:00 PM.",
    );
  });

  it("recommendation: includes context in both the top-priority item and the lower-priority list", () => {
    const items: ScheduleItem[] = [
      item({ id: "a", title: "Review previous changes", dueAt: new Date("2026-09-03T20:00:00Z"), priority: "High", context: "Project Agrivoltaics" }),
      item({ id: "b", title: "Homework 1", dueAt: new Date("2026-09-03T21:00:00Z"), priority: "Low", context: "CS 101" }),
    ];
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "recommendation", emptyMessage: "nothing" });
    expect(message).toBe(
      "You have 2 items due today. Review previous changes (Project Agrivoltaics) is High priority, so start there. " +
        "Also due today, with lower priority: Homework 1 (CS 101) (Low).",
    );
  });

  it("recommendation: calls out the same-day multi-item priority convention", () => {
    const items: ScheduleItem[] = [
      item({ id: "a", title: "Homework 1", dueAt: new Date("2026-09-03T20:00:00Z"), priority: "High" }),
      item({ id: "b", title: "Check Bill & Insurance", dueAt: new Date("2026-09-03T21:00:00Z"), priority: "Medium" }),
      item({ id: "c", title: "Review Lecture 3", dueAt: new Date("2026-09-03T23:00:00Z"), priority: "Low" }),
    ];
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "recommendation", emptyMessage: "nothing" });
    expect(message).toBe(
      "You have 3 items due today. Homework 1 is High priority, so start there. " +
        "Also due today, with lower priority: Check Bill & Insurance (Medium), and Review Lecture 3 (Low).",
    );
  });

  it("recommendation: a single item due that day gets a plain statement, no priority callout", () => {
    const items: ScheduleItem[] = [item({ id: "a", title: "Homework 1", dueAt: new Date("2026-09-03T20:00:00Z") })];
    const { dayGroups } = rankScheduleItems(items, TZ, now);
    const message = formatScheduleAnswer(dayGroups, { timezone: TZ, now, style: "recommendation", emptyMessage: "nothing" });
    expect(message).toBe("You have one item due today: Homework 1, due today at 3:00 PM.");
  });
});
