/** OpenAI model for both triage stages (same model the other LLM features use). */
export const TRIAGE_MODEL = "gpt-5.6-luna";

/** Stage 1 cap: unread messages classified per run (one batched LLM call). */
export const TRIAGE_MAX_MESSAGES = 50;
/** Stage 2 cap: full bodies fetched + sent to the LLM per run. */
export const TRIAGE_MAX_STAGE2 = 10;
export const TRIAGE_STAGE2_CONCURRENCY = 3;
/** Body text sent to the LLM is truncated to this many characters. */
export const TRIAGE_BODY_MAX_CHARS = 6000;

/** Per-user cap on triage runs (each spends OpenAI + provider calls). */
export const TRIAGE_RUN_LIMIT_MAX = 6;
export const TRIAGE_RUN_LIMIT_WINDOW_MINUTES = 60;

/** Stored results expire this long after triage (mirrors 0053's default). */
export const TRIAGE_TTL_DAYS = 14;

export const TRIAGE_DEFAULT_DAYS = 7;
export const TRIAGE_MIN_DAYS = 1;
export const TRIAGE_MAX_DAYS = 30;

export const TRIAGE_REASON_MAX_CHARS = 140;
export const TRIAGE_ACTION_TITLE_MAX_CHARS = 120;

/** Stage-1 input is truncated per field before it reaches the model. */
export const TRIAGE_SUBJECT_MAX_CHARS = 200;
export const TRIAGE_SENDER_MAX_CHARS = 200;
export const TRIAGE_SNIPPET_MAX_CHARS = 300;

/** How many top items the voice tool reads out. */
export const TRIAGE_VOICE_TOP_N = 3;

/** TanStack Query staleTime for stored triage results (cheap DB read). */
export const TRIAGE_QUERY_STALE_TIME_MS = 60 * 1000;
