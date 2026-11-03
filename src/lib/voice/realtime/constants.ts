/**
 * Realtime voice call limits and defaults. The caps are cost controls on a
 * metered model (agreed with the user: 5 minutes a call, 15 a day), enforced
 * from server-side records (see budget.ts and 0058_voice_realtime_calls.sql),
 * with the client timers in useRealtimeCall as the first line of defence.
 */

/** Hard cap on one call. Also hard-coded in 0058's end_voice_realtime_call; a unit test keeps them equal. */
export const REALTIME_MAX_CALL_SECONDS = 300;
/** Total call time per user per local day. */
export const REALTIME_DAILY_SECONDS = 900;
/** The assistant tells the user the call is about to end this far in. */
export const REALTIME_WARNING_AT_SECONDS = 270;
/** Hang up after this long with nobody speaking, so a forgotten open call stops costing. */
export const REALTIME_IDLE_TIMEOUT_SECONDS = 60;
/** Hang up if the app has been in the background this long (the call cannot be heard anyway). */
export const REALTIME_HIDDEN_GRACE_SECONDS = 30;
/** Do not start a call with less than this much of the day's budget left. */
export const REALTIME_MIN_START_SECONDS = 10;

/** Overridable with REALTIME_MODEL / REALTIME_VOICE; see session config in the session route. */
export const REALTIME_DEFAULT_MODEL = "gpt-realtime-2.1";
export const REALTIME_DEFAULT_VOICE = "marin";

/**
 * How long the ephemeral key stays valid for STARTING a session (the session
 * itself outlives it). Just long enough for the browser to negotiate; the SDK
 * accepts 10 to 7200.
 */
export const REALTIME_CLIENT_SECRET_TTL_SECONDS = 60;
