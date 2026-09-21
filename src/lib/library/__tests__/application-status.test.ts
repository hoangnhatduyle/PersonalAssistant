import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  daysInStage,
  employerSummary,
  funnelCounts,
  isActiveStatus,
  isApplicationStatus,
} from "@/lib/library/application-status";

describe("isApplicationStatus", () => {
  it("accepts exactly the six statuses", () => {
    for (const status of APPLICATION_STATUSES) expect(isApplicationStatus(status)).toBe(true);
    expect(APPLICATION_STATUSES).toHaveLength(6);
  });

  it("rejects everything else", () => {
    expect(isApplicationStatus("hired")).toBe(false);
    expect(isApplicationStatus("Applied")).toBe(false);
    expect(isApplicationStatus(null)).toBe(false);
    expect(isApplicationStatus(undefined)).toBe(false);
    expect(isApplicationStatus(3)).toBe(false);
  });
});

describe("isActiveStatus", () => {
  it("treats rejected and withdrawn as closed", () => {
    expect(isActiveStatus("interested")).toBe(true);
    expect(isActiveStatus("applied")).toBe(true);
    expect(isActiveStatus("interviewing")).toBe(true);
    expect(isActiveStatus("offer")).toBe(true);
    expect(isActiveStatus("rejected")).toBe(false);
    expect(isActiveStatus("withdrawn")).toBe(false);
  });
});

describe("daysInStage", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  it("counts whole elapsed days", () => {
    expect(daysInStage("2026-09-20T08:00:00.000Z", now)).toBe(0);
    expect(daysInStage("2026-09-19T12:00:00.000Z", now)).toBe(1);
    expect(daysInStage("2026-09-10T11:00:00.000Z", now)).toBe(10);
  });

  it("never goes negative (clock skew / future timestamps)", () => {
    expect(daysInStage("2026-09-25T00:00:00.000Z", now)).toBe(0);
  });

  it("returns 0 for an unparsable timestamp", () => {
    expect(daysInStage("nope", now)).toBe(0);
  });

  it("accepts a Date", () => {
    expect(daysInStage(new Date("2026-09-18T12:00:00.000Z"), now)).toBe(2);
  });
});

describe("funnelCounts", () => {
  it("returns a zero for every status on empty input", () => {
    expect(funnelCounts([])).toEqual({ interested: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0, withdrawn: 0 });
  });

  it("tallies by status", () => {
    const counts = funnelCounts([{ status: "applied" }, { status: "applied" }, { status: "offer" }, { status: "rejected" }]);
    expect(counts.applied).toBe(2);
    expect(counts.offer).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.interested).toBe(0);
  });
});

describe("employerSummary", () => {
  it("is null with no applications", () => {
    expect(employerSummary([])).toBeNull();
  });

  it("picks the most advanced active status", () => {
    expect(employerSummary([{ status: "interested" }, { status: "interviewing" }, { status: "applied" }])).toBe("interviewing");
    expect(employerSummary([{ status: "applied" }, { status: "offer" }])).toBe("offer");
  });

  it("ignores closed applications while an active one exists", () => {
    expect(employerSummary([{ status: "rejected" }, { status: "interested" }])).toBe("interested");
  });

  it("falls back to rejected, then withdrawn, when nothing is active", () => {
    expect(employerSummary([{ status: "withdrawn" }, { status: "rejected" }])).toBe("rejected");
    expect(employerSummary([{ status: "withdrawn" }])).toBe("withdrawn");
  });
});
