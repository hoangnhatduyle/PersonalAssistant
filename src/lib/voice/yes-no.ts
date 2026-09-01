export type YesNoAnswer = "yes" | "no" | null;

// Checked in order, no-patterns first: "don't" containing "do" must not
// match the yes-pattern for "do it", and "never mind" must win over any
// accidental partial overlap. Word-boundary regexes avoid matching inside
// unrelated words (e.g. "nostalgic" must never match \bno\b).
const NO_PATTERNS = [
  /\bno\b/i,
  /\bnope\b/i,
  /\bnah\b/i,
  /\bcancel\b/i,
  /\bdon'?t\b/i,
  /\bdo not\b/i,
  /\bstop\b/i,
  /\bnever ?mind\b/i,
  /\bskip\b/i,
  /\bdismiss\b/i,
];
const YES_PATTERNS = [/\byes\b/i, /\byeah\b/i, /\byep\b/i, /\bconfirm\b/i, /\bdo it\b/i, /\bsure\b/i, /\bgo ?ahead\b/i, /\bcorrect\b/i, /\bapply\b/i, /\bok(ay)?\b/i];

/**
 * Lightweight keyword classification for a short spoken confirmation
 * answer — deliberately NOT an LLM call (this feeds ConfirmationBar's
 * auto-listen and the suggestion review-aloud loop, both of which need a
 * cheap, fast yes/no read, not full intent resolution). Returns null when
 * the transcript doesn't clearly match either side, so callers can fall
 * back to manual buttons instead of guessing.
 */
export function classifyYesNo(transcript: string): YesNoAnswer {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return null;
  if (NO_PATTERNS.some((pattern) => pattern.test(normalized))) return "no";
  if (YES_PATTERNS.some((pattern) => pattern.test(normalized))) return "yes";
  return null;
}
