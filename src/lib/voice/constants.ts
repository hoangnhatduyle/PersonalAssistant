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

// Auto-stop-on-silence recording (src/hooks/useAutoStopRecorder.ts). Two
// profiles: a full command (longer grace, longer max) and a short yes/no
// confirmation answer (shorter grace, shorter max) — first-guess defaults,
// meant to be tuned against a real phone/microphone/car-Bluetooth setup.
export const CAPTURE_SILENCE_MS = 1400;
export const CAPTURE_MAX_DURATION_MS = 30_000;
export const CAPTURE_MIN_SPEECH_MS = 300;
export const CONFIRM_SILENCE_MS = 900;
export const CONFIRM_MAX_DURATION_MS = 8_000;
// RMS volume (0-1 scale off AnalyserNode byte time-domain data) above which
// the stream is considered "speech", not ambient noise/silence.
export const SILENCE_RMS_THRESHOLD = 0.02;
