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
