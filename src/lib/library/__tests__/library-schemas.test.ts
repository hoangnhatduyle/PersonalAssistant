import { describe, expect, it } from "vitest";
import {
  libraryApplicationPatchSchema,
  libraryApplicationPayloadSchema,
  libraryApplicationTransitionSchema,
  libraryContactPatchSchema,
  libraryContactPayloadSchema,
  libraryEmployerPatchSchema,
  libraryEmployerPayloadSchema,
  libraryInterviewPatchSchema,
  libraryInterviewPayloadSchema,
  libraryPostPatchSchema,
  libraryPostPayloadSchema,
} from "@/lib/api/library-schemas";

describe("libraryPostPayloadSchema", () => {
  it("accepts a minimal payload", () => {
    expect(libraryPostPayloadSchema.parse({ title: "  Hello " })).toEqual({ title: "Hello" });
  });

  it("normalises blank url/author to null and tags via normalizeTags", () => {
    const parsed = libraryPostPayloadSchema.parse({ title: "t", url: "  ", author_name: "", tags: [" A ", "a", "B"] });
    expect(parsed).toMatchObject({ url: null, author_name: null, tags: ["a", "b"] });
  });

  it("rejects javascript: and non-http URLs", () => {
    expect(libraryPostPayloadSchema.safeParse({ title: "t", url: "javascript:alert(1)" }).success).toBe(false);
    expect(libraryPostPayloadSchema.safeParse({ title: "t", url: "ftp://x.com" }).success).toBe(false);
  });

  it("rejects an empty title and non-uuid link ids", () => {
    expect(libraryPostPayloadSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(libraryPostPayloadSchema.safeParse({ title: "t", person_ids: ["nope"] }).success).toBe(false);
  });
});

describe("libraryPostPatchSchema", () => {
  it("makes every field optional and allows archived", () => {
    expect(libraryPostPatchSchema.parse({})).toEqual({});
    expect(libraryPostPatchSchema.parse({ archived: true, url: null })).toEqual({ archived: true, url: null });
  });

  it("still validates provided fields", () => {
    expect(libraryPostPatchSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("libraryPostPayloadSchema — employer links", () => {
  it("accepts employer_ids as uuids and rejects junk", () => {
    const id = crypto.randomUUID();
    expect(libraryPostPayloadSchema.parse({ title: "t", employer_ids: [id] })).toMatchObject({ employer_ids: [id] });
    expect(libraryPostPayloadSchema.safeParse({ title: "t", employer_ids: ["x"] }).success).toBe(false);
  });
});

describe("libraryEmployerPayloadSchema", () => {
  it("accepts a name alone and trims it", () => {
    expect(libraryEmployerPayloadSchema.parse({ name: "  Acme " })).toEqual({ name: "Acme" });
  });

  it("nulls blank urls and rejects non-http ones", () => {
    expect(libraryEmployerPayloadSchema.parse({ name: "A", website: "", careers_url: " " })).toMatchObject({ website: null, careers_url: null });
    expect(libraryEmployerPayloadSchema.safeParse({ name: "A", website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(libraryEmployerPayloadSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("libraryEmployerPatchSchema", () => {
  it("is fully optional and allows archived", () => {
    expect(libraryEmployerPatchSchema.parse({})).toEqual({});
    expect(libraryEmployerPatchSchema.parse({ archived: true })).toEqual({ archived: true });
  });
});

describe("libraryApplicationPayloadSchema", () => {
  const employer_id = crypto.randomUUID();

  it("needs an employer and a title", () => {
    expect(libraryApplicationPayloadSchema.parse({ employer_id, title: " Engineer " })).toEqual({ employer_id, title: "Engineer" });
    expect(libraryApplicationPayloadSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "" }).success).toBe(false);
  });

  it("coerces form-style salary strings and blanks", () => {
    const parsed = libraryApplicationPayloadSchema.parse({
      employer_id,
      title: "t",
      salary_min: "90000",
      salary_max: "",
      salary_currency: " usd ",
      salary_period: "year",
    });
    expect(parsed).toMatchObject({ salary_min: 90000, salary_max: null, salary_currency: "USD", salary_period: "year" });
  });

  it("rejects max < min, negatives and bad currency codes", () => {
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", salary_min: 100, salary_max: 50 }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", salary_min: -1 }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", salary_currency: "DOLLARS" }).success).toBe(false);
  });

  it("validates work mode, status and date_found", () => {
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", work_mode: "moon" }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", status: "hired" }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", date_found: "20/09/2026" }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.parse({ employer_id, title: "t", status: "applied", work_mode: "remote", date_found: "2026-09-20" })).toMatchObject({
      status: "applied",
      work_mode: "remote",
      date_found: "2026-09-20",
    });
  });

  it("normalises tech_stack and rejects non-http job URLs", () => {
    expect(libraryApplicationPayloadSchema.parse({ employer_id, title: "t", tech_stack: ["React", "react", " Go "] }).tech_stack).toEqual(["React", "Go"]);
    expect(libraryApplicationPayloadSchema.safeParse({ employer_id, title: "t", job_url: "javascript:1" }).success).toBe(false);
    expect(libraryApplicationPayloadSchema.parse({ employer_id, title: "t", job_url: "" }).job_url).toBeNull();
  });
});

describe("libraryApplicationPatchSchema", () => {
  it("omits status and employer_id (status moves only through /transition)", () => {
    // zod strips unknown keys, so a smuggled status never reaches the service.
    expect(libraryApplicationPatchSchema.parse({ title: "New", status: "offer", employer_id: crypto.randomUUID() })).toEqual({ title: "New" });
  });

  it("keeps the salary range check when both sides are present", () => {
    expect(libraryApplicationPatchSchema.safeParse({ salary_min: 10, salary_max: 5 }).success).toBe(false);
    expect(libraryApplicationPatchSchema.safeParse({ salary_min: 10 }).success).toBe(true);
  });
});

describe("libraryApplicationTransitionSchema", () => {
  it("requires a known target status", () => {
    expect(libraryApplicationTransitionSchema.parse({ to: "offer" })).toEqual({ to: "offer" });
    expect(libraryApplicationTransitionSchema.safeParse({ to: "hired" }).success).toBe(false);
    expect(libraryApplicationTransitionSchema.safeParse({}).success).toBe(false);
  });
});

describe("libraryInterviewPayloadSchema / patch", () => {
  it("needs a round label; defaults are left to the DB", () => {
    expect(libraryInterviewPayloadSchema.parse({ round_label: " Phone screen " })).toEqual({ round_label: "Phone screen" });
    expect(libraryInterviewPayloadSchema.safeParse({ round_label: "" }).success).toBe(false);
  });

  it("validates kind, outcome, scheduled_at and interviewer", () => {
    const person = crypto.randomUUID();
    expect(
      libraryInterviewPayloadSchema.parse({ round_label: "r", kind: "technical", outcome: "passed", scheduled_at: "2026-09-21T10:00:00.000Z", interviewer_person_id: person }),
    ).toMatchObject({ kind: "technical", outcome: "passed", interviewer_person_id: person });
    expect(libraryInterviewPayloadSchema.safeParse({ round_label: "r", kind: "coffee" }).success).toBe(false);
    expect(libraryInterviewPayloadSchema.safeParse({ round_label: "r", scheduled_at: "tomorrow" }).success).toBe(false);
    expect(libraryInterviewPatchSchema.parse({ scheduled_at: null, interviewer_person_id: null })).toEqual({ scheduled_at: null, interviewer_person_id: null });
  });
});

describe("contact schemas", () => {
  it("payload needs a person; kind/note optional", () => {
    const person_id = crypto.randomUUID();
    expect(libraryContactPayloadSchema.parse({ person_id })).toEqual({ person_id });
    expect(libraryContactPayloadSchema.parse({ person_id, kind: "recruiter", note: " hi " })).toEqual({ person_id, kind: "recruiter", note: "hi" });
    expect(libraryContactPayloadSchema.safeParse({ person_id: "x" }).success).toBe(false);
    expect(libraryContactPayloadSchema.safeParse({ person_id, kind: "boss" }).success).toBe(false);
  });

  it("patch only takes kind and note", () => {
    expect(libraryContactPatchSchema.parse({ kind: "referral", person_id: crypto.randomUUID() })).toEqual({ kind: "referral" });
  });
});

describe("blank form selects", () => {
  const employer_id = crypto.randomUUID();

  it("treats an unset work mode / salary period as null (a <select> sends '')", () => {
    const parsed = libraryApplicationPayloadSchema.parse({ employer_id, title: "t", work_mode: "", salary_period: "" });
    expect(parsed).toMatchObject({ work_mode: null, salary_period: null });
    expect(libraryApplicationPatchSchema.parse({ work_mode: "" })).toEqual({ work_mode: null });
  });

  it("treats a blank interviewer as null and still rejects junk", () => {
    expect(libraryInterviewPayloadSchema.parse({ round_label: "r", interviewer_person_id: "" }).interviewer_person_id).toBeNull();
    expect(libraryInterviewPayloadSchema.safeParse({ round_label: "r", interviewer_person_id: "nope" }).success).toBe(false);
  });

  it("gives a friendly message for a missing employer", () => {
    const result = libraryApplicationPayloadSchema.safeParse({ employer_id: "", title: "t" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Choose an employer");
  });
});
