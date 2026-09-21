import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  mapApplicationWithEmployer,
  mapEmployerDetailRow,
  mapEmployerListRow,
  mapInterviewRow,
  type EmployerDetailRow,
  type EmployerListRow,
} from "@/lib/library/employer-mapper";
import type { LibraryApplication, LibraryApplicationEvent, LibraryEmployer, LibraryInterview } from "@/lib/api/entity-types";

const employer = (overrides: Partial<LibraryEmployer> = {}): LibraryEmployer => ({
  id: "emp-1",
  user_id: "user-1",
  name: "Acme",
  website: null,
  careers_url: null,
  notes: "",
  archived_at: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const application = (id: string, overrides: Partial<LibraryApplication> = {}): LibraryApplication => ({
  id,
  user_id: "user-1",
  employer_id: "emp-1",
  title: `Role ${id}`,
  job_url: null,
  normalized_job_url: null,
  location: null,
  work_mode: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  tech_stack: [],
  date_found: "2026-01-01",
  status: "interested",
  status_changed_at: "2026-01-01T00:00:00Z",
  notes: "",
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const interview = (id: string, overrides: Partial<LibraryInterview> = {}): LibraryInterview => ({
  id,
  user_id: "user-1",
  application_id: "app-1",
  round_label: `Round ${id}`,
  kind: "screen",
  scheduled_at: null,
  outcome: "pending",
  interviewer_person_id: null,
  notes: "",
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const event = (id: string, at: string, from: LibraryApplicationEvent["from_status"], to: LibraryApplicationEvent["to_status"]): LibraryApplicationEvent => ({
  id,
  user_id: "user-1",
  application_id: "app-1",
  from_status: from,
  to_status: to,
  created_at: at,
});

describe("mapEmployerListRow", () => {
  it("strips embed keys, keeps live applications newest-stage first, drops closed-out embeds", () => {
    const row: EmployerListRow = {
      ...employer(),
      library_applications: [
        application("old", { status: "applied", status_changed_at: "2026-01-02T00:00:00Z" }),
        application("dead", { deleted_at: "2026-02-01T00:00:00Z" }),
        application("new", { status: "interviewing", status_changed_at: "2026-01-09T00:00:00Z" }),
      ],
      library_employer_contacts: [
        { kind: "recruiter", note: "hi", person: { id: "p1", name: "Sam", deleted_at: null } },
        { kind: "referral", note: "", person: { id: "p2", name: "Gone", deleted_at: "2026-02-01T00:00:00Z" } },
        { kind: "other", note: "", person: null },
      ],
    };
    const mapped = mapEmployerListRow(row);
    expect(mapped.applications.map((a) => a.id)).toEqual(["new", "old"]);
    expect(mapped.applications[0]).toEqual({ id: "new", title: "Role new", status: "interviewing", status_changed_at: "2026-01-09T00:00:00Z" });
    expect(mapped.contacts).toEqual([{ person: { id: "p1", name: "Sam" }, kind: "recruiter", note: "hi" }]);
    expect(mapped).not.toHaveProperty("library_applications");
    expect(mapped).not.toHaveProperty("library_employer_contacts");
    expect(mapped).not.toHaveProperty("match");
  });

  it("defaults missing embeds to empty lists", () => {
    const mapped = mapEmployerListRow({ ...employer() });
    expect(mapped.applications).toEqual([]);
    expect(mapped.contacts).toEqual([]);
  });
});

describe("mapEmployerDetailRow", () => {
  it("keeps full application rows and flattens live linked posts only", () => {
    const row: EmployerDetailRow = {
      ...employer(),
      library_applications: [application("a")],
      library_employer_contacts: [],
      library_post_employers: [
        { post: { id: "post-1", title: "Good post", platform: "instagram", deleted_at: null } },
        { post: { id: "post-2", title: "Deleted", platform: "other", deleted_at: "2026-02-01T00:00:00Z" } },
        { post: null },
      ],
    };
    const mapped = mapEmployerDetailRow(row);
    expect(mapped.applications).toHaveLength(1);
    expect(mapped.applications[0].salary_min).toBeNull();
    expect(mapped.posts).toEqual([{ id: "post-1", title: "Good post", platform: "instagram" }]);
    expect(mapped).not.toHaveProperty("library_post_employers");
  });
});

describe("mapApplicationWithEmployer", () => {
  it("flattens the employer embed", () => {
    const mapped = mapApplicationWithEmployer({ ...application("a"), employer: { id: "emp-1", name: "Acme", deleted_at: null } });
    expect(mapped?.employer).toEqual({ id: "emp-1", name: "Acme" });
  });

  it("returns null when the employer is gone (soft-deleted or hidden)", () => {
    expect(mapApplicationWithEmployer({ ...application("a"), employer: { id: "emp-1", name: "Acme", deleted_at: "2026-02-01T00:00:00Z" } })).toBeNull();
    expect(mapApplicationWithEmployer({ ...application("a"), employer: null })).toBeNull();
  });
});

describe("mapInterviewRow", () => {
  it("attaches a live interviewer", () => {
    const mapped = mapInterviewRow({ ...interview("i1", { interviewer_person_id: "p1" }), interviewer: { id: "p1", name: "Sam", deleted_at: null } });
    expect(mapped.interviewer).toEqual({ id: "p1", name: "Sam" });
    expect(mapped).not.toHaveProperty("deleted_at_person");
  });

  it("nulls an interviewer that was soft-deleted or is missing", () => {
    expect(mapInterviewRow({ ...interview("i1"), interviewer: { id: "p1", name: "Sam", deleted_at: "2026-02-01T00:00:00Z" } }).interviewer).toBeNull();
    expect(mapInterviewRow({ ...interview("i1"), interviewer: null }).interviewer).toBeNull();
    expect(mapInterviewRow(interview("i1")).interviewer).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("merges status events and interviews in chronological order", () => {
    const timeline = buildTimeline(
      [event("e1", "2026-03-01T09:00:00Z", null, "interested"), event("e2", "2026-03-05T09:00:00Z", "interested", "applied")],
      [mapInterviewRow(interview("i1", { scheduled_at: "2026-03-03T10:00:00Z" })), mapInterviewRow(interview("i2", { scheduled_at: "2026-03-10T10:00:00Z" }))],
    );
    expect(timeline.map((entry) => entry.id)).toEqual(["e1", "i1", "e2", "i2"]);
    expect(timeline[0]).toMatchObject({ type: "status", from_status: null, to_status: "interested" });
    expect(timeline[1]).toMatchObject({ type: "interview", at: "2026-03-03T10:00:00Z" });
  });

  it("places an unscheduled interview by its created_at", () => {
    const timeline = buildTimeline(
      [event("e1", "2026-03-01T09:00:00Z", null, "applied")],
      [mapInterviewRow(interview("i1", { scheduled_at: null, created_at: "2026-03-02T09:00:00Z" }))],
    );
    expect(timeline.map((entry) => entry.id)).toEqual(["e1", "i1"]);
    expect(timeline[1].at).toBe("2026-03-02T09:00:00Z");
  });

  it("breaks ties with status events before interviews and is stable", () => {
    const timeline = buildTimeline(
      [event("e1", "2026-03-01T09:00:00Z", null, "applied")],
      [mapInterviewRow(interview("i1", { scheduled_at: "2026-03-01T09:00:00Z" }))],
    );
    expect(timeline.map((entry) => entry.id)).toEqual(["e1", "i1"]);
  });

  it("is empty with no input", () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});
