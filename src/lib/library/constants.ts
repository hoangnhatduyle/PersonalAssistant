/** Library (saved posts) — shared constants. Everything Library-owned is prefixed `library`. */

export const LIBRARY_POST_IMAGE_BUCKET = "library-post-images";
export const MAX_IMAGES_PER_POST = 10;

/**
 * Per-image upload cap. Vercel rejects request bodies over ~4.5MB, so the
 * client downscales first (client-image.ts) and the server holds the same
 * line with headroom for multipart overhead.
 */
export const MAX_UPLOAD_BYTES = 4_000_000;
export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 480;

export const MAX_TAGS_PER_POST = 20;
export const MAX_TAG_CHARS = 30;

export const POST_TITLE_MAX_CHARS = 200;
export const POST_URL_MAX_CHARS = 2048;
export const POST_LIST_MAX_LIMIT = 100;

export const LIBRARY_PLATFORMS = ["facebook", "instagram", "other"] as const;
export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number];

export const ARCHIVED_MODES = ["exclude", "only", "all"] as const;
export type ArchivedMode = (typeof ARCHIVED_MODES)[number];

// ---- Employers (Phase 2) ----

export const EMPLOYER_NAME_MAX_CHARS = 200;
export const EMPLOYER_LIST_MAX_LIMIT = 100;
export const APPLICATION_LIST_MAX_LIMIT = 100;
export const APPLICATION_TITLE_MAX_CHARS = 200;
export const MAX_TECH_STACK_ITEMS = 30;
export const MAX_TECH_STACK_CHARS = 40;

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const SALARY_PERIODS = ["year", "month", "hour"] as const;

export const INTERVIEW_KINDS = ["screen", "technical", "onsite", "behavioral", "take_home", "other"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_OUTCOMES = ["pending", "passed", "failed", "cancelled"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const CONTACT_KINDS = ["recruiter", "referral", "hiring_manager", "other"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const EMPLOYER_VIEWS = ["list", "board"] as const;
export type EmployerView = (typeof EMPLOYER_VIEWS)[number];
