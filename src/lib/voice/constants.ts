/**
 * SPEC-API-010: request-shaping/rate-limit config for POST /api/voice/speak.
 * Kept separate from src/lib/voice/transitions.ts (state-machine constants)
 * and mirrors src/lib/knowledge/constants.ts's pinned-constant convention —
 * every tunable this route depends on is named here rather than left
 * implied. Numbers are reasonable defaults, easy to tune.
 */
export const MAX_SPEAK_TEXT_CHARS = 2000;
export const SPEAK_RATE_LIMIT_MAX = 20;
export const SPEAK_RATE_LIMIT_WINDOW_MINUTES = 10;
// Safety-net cap on a single speak-and-play round trip (useSpeakVoiceResponse,
// consumed by useReviewSuggestionsAloud's per-suggestion loop) -- generous
// headroom over real TTS latency for up to MAX_SPEAK_TEXT_CHARS, just a
// backstop against a hung network/audio call with no timeout of its own
// leaving the caller (CaptureChannel or DailyIntelligenceCard) stuck busy
// until a manual refresh.
export const SPEAK_TIMEOUT_MS = 20_000;

// Auto-stop-on-silence recording (src/hooks/useAutoStopRecorder.ts). Two
// profiles: a full command (longer grace, longer max) and a short yes/no
// confirmation answer (shorter grace, shorter max) — first-guess defaults,
// meant to be tuned against a real phone/microphone/car-Bluetooth setup.
// A full command's grace must outlast a thinking pause: at 1400ms, a person
// pausing mid-command ("add a deadline for... hmm, what's it called")
// was cut off and submitted as a fragment, which then had to be pieced
// together across several turns (production, 2026-09-21).
export const CAPTURE_SILENCE_MS = 2500;
export const CAPTURE_MAX_DURATION_MS = 30_000;
export const CAPTURE_MIN_SPEECH_MS = 300;
export const CONFIRM_SILENCE_MS = 900;
export const CONFIRM_MAX_DURATION_MS = 8_000;
// RMS volume (0-1 scale off AnalyserNode byte time-domain data) above which
// the stream is considered "speech", not ambient noise/silence.
export const SILENCE_RMS_THRESHOLD = 0.02;

// Grace period between "TTS playback reported ended" and actually arming
// the mic (CaptureChannel's own speak-then-listen effect, and hands-free
// resume after any spoken response). audio.onended (play-audio.ts) is a
// purely digital completion signal -- it fires the instant the <audio>
// element finishes feeding samples, which is not the same moment as the
// sound has actually finished being audible in the room. Real speaker/mic
// setups (and Bluetooth output in particular, which commonly buffers
// several hundred ms past when the source stops feeding it -- see this
// file's own CAPTURE_SILENCE_MS comment on tuning against a real
// phone/car-Bluetooth setup) can leave an audible tail after onended.
// Without this gap, that tail alone can satisfy CONFIRM_SILENCE_MS's
// speech-then-silence pattern before the user gets a word in, producing a
// "Didn't catch a yes or no" (or a burned few seconds of the capture
// window) that has nothing to do with anything the user actually said
// (production, 2026-09-22).
export const MIC_ARM_SETTLE_MS = 350;
