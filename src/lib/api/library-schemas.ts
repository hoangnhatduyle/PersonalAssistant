import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/library/application-status";
import {
  APPLICATION_TITLE_MAX_CHARS,
  CONTACT_KINDS,
  EMPLOYER_NAME_MAX_CHARS,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  MAX_TAG_CHARS,
  MAX_TAGS_PER_POST,
  MAX_TECH_STACK_CHARS,
  MAX_TECH_STACK_ITEMS,
  POST_TITLE_MAX_CHARS,
  POST_URL_MAX_CHARS,
  SALARY_PERIODS,
  WORK_MODES,
} from "@/lib/library/constants";
import { isValidSalaryRange } from "@/lib/library/salary";
import { normalizeTags, normalizeTechStack } from "@/lib/library/tags";
import { parsePostUrl } from "@/lib/library/url";

// Library payload shapes (zod v4). Same base -> payload/patch split as
// src/lib/api/schemas.ts. A blank optional text field means "clear it", so
// "" is normalised to null here — the forms send "" for an empty input.

const blankToNull = (value: string) => (value === "" ? null : value);

const postUrlSchema = z
  .string()
  .trim()
  .max(POST_URL_MAX_CHARS)
  .refine((value) => value === "" || parsePostUrl(value) !== null, "Enter a valid http(s) link")
  .transform(blankToNull)
  .nullable()
  .optional();

const libraryPostBaseSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(POST_TITLE_MAX_CHARS),
  url: postUrlSchema,
  author_name: z.string().trim().max(120).transform(blankToNull).nullable().optional(),
  notes: z.string().max(10_000).optional(),
  tags: z
    .array(z.string().max(MAX_TAG_CHARS * 2))
    .max(MAX_TAGS_PER_POST * 2)
    .transform(normalizeTags)
    .optional(),
  is_favorite: z.boolean().optional(),
  person_ids: z.array(z.uuid()).max(50).optional(),
  course_ids: z.array(z.uuid()).max(50).optional(),
  employer_ids: z.array(z.uuid()).max(50).optional(),
});

export const libraryPostPayloadSchema = libraryPostBaseSchema;
export type LibraryPostPayload = z.infer<typeof libraryPostPayloadSchema>;
export type LibraryPostFormInput = z.input<typeof libraryPostPayloadSchema>;

/** `archived` is PATCH-only: it maps to archived_at (now / null). */
export const libraryPostPatchSchema = libraryPostBaseSchema.partial().extend({ archived: z.boolean().optional() });
export type LibraryPostPatch = z.infer<typeof libraryPostPatchSchema>;

// ---- Employers (Phase 2) ----

/** A <select> with no choice sends "": read that as "unset" (null) before validating the enum. */
const blankToNullValue = (value: unknown) => (value === "" ? null : value);
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blankToNullValue, z.enum(values).nullable()).optional();

const optionalText = (max: number) => z.string().trim().max(max).transform(blankToNull).nullable().optional();

const libraryEmployerBaseSchema = z.object({
  name: z.string().trim().min(1, "Give the employer a name").max(EMPLOYER_NAME_MAX_CHARS),
  website: postUrlSchema,
  careers_url: postUrlSchema,
  notes: z.string().max(10_000).optional(),
});

export const libraryEmployerPayloadSchema = libraryEmployerBaseSchema;
export type LibraryEmployerPayload = z.infer<typeof libraryEmployerPayloadSchema>;
export type LibraryEmployerFormInput = z.input<typeof libraryEmployerPayloadSchema>;

/** `archived` is PATCH-only: it maps to archived_at (now / null). */
export const libraryEmployerPatchSchema = libraryEmployerBaseSchema.partial().extend({ archived: z.boolean().optional() });
export type LibraryEmployerPatch = z.infer<typeof libraryEmployerPatchSchema>;

/** Number inputs hand the form strings ("" when blank): blank/NaN -> null, numeric strings -> number. */
const optionalMoney = z
  .preprocess((value) => {
    if (value === "" || value === null || (typeof value === "number" && Number.isNaN(value))) return null;
    return typeof value === "string" ? Number(value) : value;
  }, z.number("Enter a number").nonnegative().max(1_000_000_000).nullable())
  .optional();

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === "" || /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code, e.g. USD")
  .transform(blankToNull)
  .nullable()
  .optional();

const libraryApplicationBaseSchema = z.object({
  title: z.string().trim().min(1, "Give the role a title").max(APPLICATION_TITLE_MAX_CHARS),
  job_url: postUrlSchema,
  location: optionalText(200),
  work_mode: optionalEnum(WORK_MODES),
  salary_min: optionalMoney,
  salary_max: optionalMoney,
  salary_currency: currencySchema,
  salary_period: optionalEnum(SALARY_PERIODS),
  tech_stack: z
    .array(z.string().max(MAX_TECH_STACK_CHARS * 2))
    .max(MAX_TECH_STACK_ITEMS * 2)
    .transform(normalizeTechStack)
    .optional(),
  date_found: z.iso.date().optional(),
  notes: z.string().max(10_000).optional(),
});

type SalaryFields = { salary_min?: number | null; salary_max?: number | null };
const salaryRangeCheck = (value: SalaryFields) => isValidSalaryRange(value.salary_min ?? null, value.salary_max ?? null);
const SALARY_RANGE_MESSAGE = "The maximum salary can't be below the minimum";

/** The initial status is allowed on create; afterwards status moves only through POST .../transition (NC-API-002). */
export const libraryApplicationPayloadSchema = libraryApplicationBaseSchema
  .extend({ employer_id: z.uuid("Choose an employer"), status: z.enum(APPLICATION_STATUSES).optional() })
  .refine(salaryRangeCheck, { message: SALARY_RANGE_MESSAGE, path: ["salary_max"] });
export type LibraryApplicationPayload = z.infer<typeof libraryApplicationPayloadSchema>;
export type LibraryApplicationFormInput = z.input<typeof libraryApplicationPayloadSchema>;

/** Omits `status` and `employer_id`: zod strips them, so a PATCH can never move an application. */
export const libraryApplicationPatchSchema = libraryApplicationBaseSchema
  .partial()
  .refine(salaryRangeCheck, { message: SALARY_RANGE_MESSAGE, path: ["salary_max"] });
export type LibraryApplicationPatch = z.infer<typeof libraryApplicationPatchSchema>;

export const libraryApplicationTransitionSchema = z.object({ to: z.enum(APPLICATION_STATUSES) });
export type LibraryApplicationTransition = z.infer<typeof libraryApplicationTransitionSchema>;

const libraryInterviewBaseSchema = z.object({
  round_label: z.string().trim().min(1, "Name the round").max(120),
  kind: z.enum(INTERVIEW_KINDS).optional(),
  scheduled_at: z.iso.datetime({ offset: true }).nullable().optional(),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
  interviewer_person_id: z.preprocess(blankToNullValue, z.uuid().nullable()).optional(),
  notes: z.string().max(10_000).optional(),
});

export const libraryInterviewPayloadSchema = libraryInterviewBaseSchema;
export type LibraryInterviewPayload = z.infer<typeof libraryInterviewPayloadSchema>;
export type LibraryInterviewFormInput = z.input<typeof libraryInterviewPayloadSchema>;

export const libraryInterviewPatchSchema = libraryInterviewBaseSchema.partial();
export type LibraryInterviewPatch = z.infer<typeof libraryInterviewPatchSchema>;

const libraryContactFieldsSchema = z.object({
  kind: z.enum(CONTACT_KINDS).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const libraryContactPayloadSchema = libraryContactFieldsSchema.extend({ person_id: z.uuid() });
export type LibraryContactPayload = z.infer<typeof libraryContactPayloadSchema>;

export const libraryContactPatchSchema = libraryContactFieldsSchema;
export type LibraryContactPatch = z.infer<typeof libraryContactPatchSchema>;
