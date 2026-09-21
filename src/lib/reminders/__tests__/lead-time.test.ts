import { describe, expect, it } from "vitest";
import { formatLeadMinutes, leadToMinutes, minutesToLead, MAX_REMINDER_LEAD_MINUTES } from "../lead-time";

describe("leadToMinutes", () => {
  it("converts each unit to minutes", () => {
    expect(leadToMinutes(45, "minutes")).toBe(45);
    expect(leadToMinutes(2, "hours")).toBe(120);
    expect(leadToMinutes(3, "days")).toBe(4320);
  });

  it("keeps NaN as NaN so validation can reject an empty field", () => {
    expect(leadToMinutes(Number.NaN, "hours")).toBeNaN();
  });

  it("puts 30 days exactly at the max", () => {
    expect(leadToMinutes(30, "days")).toBe(MAX_REMINDER_LEAD_MINUTES);
  });
});

describe("minutesToLead", () => {
  it("picks the largest unit that divides evenly", () => {
    expect(minutesToLead(1440)).toEqual({ amount: 1, unit: "days" });
    expect(minutesToLead(2880)).toEqual({ amount: 2, unit: "days" });
    expect(minutesToLead(120)).toEqual({ amount: 2, unit: "hours" });
    expect(minutesToLead(90)).toEqual({ amount: 90, unit: "minutes" });
    expect(minutesToLead(1500)).toEqual({ amount: 25, unit: "hours" });
  });

  it("defaults zero to minutes", () => {
    expect(minutesToLead(0)).toEqual({ amount: 0, unit: "minutes" });
  });

  it("round-trips through leadToMinutes", () => {
    for (const minutes of [1, 30, 60, 90, 1440, 1441, 4320, 43200]) {
      const { amount, unit } = minutesToLead(minutes);
      expect(leadToMinutes(amount, unit)).toBe(minutes);
    }
  });
});

describe("formatLeadMinutes", () => {
  it("uses singular and plural forms", () => {
    expect(formatLeadMinutes(1)).toBe("1 minute");
    expect(formatLeadMinutes(60)).toBe("1 hour");
    expect(formatLeadMinutes(120)).toBe("2 hours");
    expect(formatLeadMinutes(1440)).toBe("1 day");
    expect(formatLeadMinutes(90)).toBe("90 minutes");
    expect(formatLeadMinutes(0)).toBe("0 minutes");
  });
});
