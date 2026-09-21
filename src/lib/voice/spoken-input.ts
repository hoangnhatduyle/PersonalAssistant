/**
 * Spoken commands arrive with the noise of natural speech: hesitation
 * sounds ("um", "uh", "hmm") and stuttered short words ("I I want to").
 * Deepgram usually drops the former (filler_words defaults off) but not
 * always -- a production capture once came back as "Yeah. You want? Does
 * that have to? Okay. Interpret." -- so this is a deterministic backstop
 * that runs before the paid model call, mirroring the blank-transcript guard
 * in session.ts: a transcript that is nothing BUT hesitation must read as
 * "I didn't catch that", never reach the model as if it were a command.
 *
 * Deliberately conservative: only whole-token, non-lexical sounds are
 * removed, and only stuttered words of two letters or fewer are collapsed
 * ("very very", "had had", and digit repeats like "6 6" are meaningful and
 * stay). Whether "okay"/"yeah" is an answer or noise depends on what the
 * assistant just asked, so those are left for the model to judge.
 */
const FILLER_TOKEN = /^(?:u+h+m*|u+m+|e+r+m*|e+h+m*|a+h+m*|h+m+|m+h?m+|uh-?huh|mm-?hm+|mhm+)$/i;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

function bareWord(token: string): string {
  return token.replace(EDGE_PUNCTUATION, "").toLowerCase();
}

export function stripSpokenFillers(transcript: string): string {
  const kept: string[] = [];
  for (const token of transcript.split(/\s+/)) {
    if (!token) continue;
    const word = bareWord(token);
    if (word && FILLER_TOKEN.test(word)) continue;

    const previous = kept.at(-1);
    const isShortStutter = word.length > 0 && word.length <= 2 && /^\p{L}+$/u.test(word);
    if (isShortStutter && previous !== undefined && bareWord(previous) === word) continue;

    kept.push(token);
  }
  const cleaned = kept.join(" ").trim();
  return HAS_CONTENT.test(cleaned) ? cleaned : "";
}

const ACKNOWLEDGEMENT_WORDS = new Set([
  "okay", "ok", "yeah", "yep", "yup", "yes", "right", "sure", "alright", "fine", "cool", "thanks", "thank", "you", "got", "it", "i", "see",
]);
const MAX_ACKNOWLEDGEMENT_WORDS = 3;

/**
 * True when a (filler-stripped) transcript is nothing but a short
 * acknowledgement -- "okay", "yeah, okay", "got it". Alone it is never a
 * request, so nothing data-fetching should fire on it; whether it answers a
 * question the assistant just asked stays the model's call.
 */
export function isBareAcknowledgement(spoken: string): boolean {
  const words = spoken.split(/\s+/).map(bareWord).filter(Boolean);
  return words.length > 0 && words.length <= MAX_ACKNOWLEDGEMENT_WORDS && words.every((word) => ACKNOWLEDGEMENT_WORDS.has(word));
}
