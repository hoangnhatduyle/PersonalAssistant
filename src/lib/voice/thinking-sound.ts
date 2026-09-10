/**
 * Soft background music played while the assistant is transcribing/thinking,
 * preceded by a short spoken filler line ("One moment...") so the wait
 * before it starts speaking doesn't feel like dead air and the user gets an
 * instant acknowledgment. Runs on its own AudioContext/GainNode, entirely
 * separate from the shared <audio> element in play-audio.ts that carries
 * actual TTS playback -- the two are expected to coexist only briefly (this
 * fades out the instant real speech starts, via play-audio.ts's
 * onPlaybackStart hook).
 */
// Trimmed to 16s via scripts/trim-thinking-sound.mjs -- the untrimmed
// source has a spoken watermark starting ~17s in.
const THINKING_SOUND_URL = "/sounds/TunePocket-Happy-And-Quiet-Place-Loop.mp3";
const FADE_IN_SECONDS = 0.35;
// Deliberately longer than the clip's own baked-in 0.35s tail fade (see
// trim-thinking-sound.mjs) -- this is the fade heard right as the assistant
// is about to speak, so it needs to read as a graceful hand-off rather than
// an abrupt cut. Also reused, unmodified, for cutting off a filler line
// mid-sentence on a very fast response -- see stopThinkingSound().
const FADE_OUT_SECONDS = 0.8;
// This is a full mixed/mastered track, not a subtle synthesized tone -- kept
// well under unity gain so it reads as quiet background music behind the UI
// rather than competing for attention with it.
const TARGET_GAIN = 0.25;

// Generated via scripts/generate-thinking-fillers.mjs -- keep these slugs in
// sync with that script's LINES array. Always drawn from randomly rather
// than picked by request content: startThinkingSound() fires before any
// transcript exists (STT and the LLM call both happen together server-side),
// so there's no cheap signal available yet to classify which line fits best.
const FILLER_SLUGS = [
  "got-it-one-sec",
  "sure-let-me-check",
  "one-moment-please",
  "let-me-take-a-look",
  "working-on-it",
  "just-a-second",
  "on-it",
  "give-me-a-moment",
  "let-me-see",
  "sure-thing-one-sec",
];
const FILLER_URLS = FILLER_SLUGS.map((slug) => `/sounds/thinking-fillers/${slug}.mp3`);
// Foreground speech, not background music -- much louder than the loop's
// TARGET_GAIN.
const FILLER_TARGET_GAIN = 0.9;
const FILLER_FADE_IN_SECONDS = 0.05;
// Ends exactly at the clip's natural end, so gain is already back near 0
// right as the loop's own FADE_IN_SECONDS ramp starts -- a click-free
// handoff between the two phases.
const FILLER_FADE_OUT_SECONDS = 0.25;

let audioContext: AudioContext | null = null;
let loopBufferPromise: Promise<AudioBuffer> | null = null;
const fillerBufferCache = new Map<string, Promise<AudioBuffer>>();
// Shared across both the filler and loop phases of a single
// startThinkingSound() call -- one GainNode per session, not two, is what
// lets stopThinkingSound() below work unmodified regardless of which phase
// is currently playing.
let activeSource: AudioBufferSourceNode | null = null;
let activeGain: GainNode | null = null;
// Native AudioBufferSourceNode.loop restarts the clip unconditionally, with
// no way to veto the next cycle once it's armed -- that's what caused the
// clip's fade-in swell to audibly restart right as real speech was about to
// start (a stop request landing a moment too late to stop it). Replaying
// the buffer manually via onended instead means each next cycle only ever
// starts if this is still true at that moment, so stopThinkingSound() (which
// clears it synchronously, before anything else) always wins the race. Only
// governs the loop phase -- the filler line never repeats.
let shouldContinue = false;

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function loadLoopBuffer(context: AudioContext): Promise<AudioBuffer> {
  loopBufferPromise ??= fetch(THINKING_SOUND_URL)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data));
  return loopBufferPromise;
}

function loadFillerBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  let promise = fillerBufferCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data));
    fillerBufferCache.set(url, promise);
  }
  return promise;
}

function pickRandomFillerUrl(): string {
  return FILLER_URLS[Math.floor(Math.random() * FILLER_URLS.length)];
}

function playLoopSegment(context: AudioContext, gain: GainNode, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.onended = () => {
    // Covers both a natural end-of-clip and stopThinkingSound()'s explicit
    // stop() call below -- either way, only chain into another cycle if
    // nothing vetoed it (via shouldContinue) and a newer call to
    // startThinkingSound()/stopThinkingSound() hasn't already moved on
    // (via activeSource).
    if (shouldContinue && activeSource === source) playLoopSegment(context, gain, buffer);
  };
  source.start();
  activeSource = source;
}

/**
 * Starts (or resumes into) the looping ambience once the filler line has
 * finished, or immediately as a fallback if the filler failed to load.
 */
function beginLoop(context: AudioContext, gain: GainNode): void {
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(TARGET_GAIN, context.currentTime + FADE_IN_SECONDS);
  shouldContinue = true;

  loadLoopBuffer(context)
    .then((buffer) => {
      // stopThinkingSound() may have already run while the fetch/decode was
      // in flight (nulling activeGain) -- treat that as "changed its mind
      // before this ever made a sound" rather than starting it anyway.
      if (activeGain !== gain) return;
      playLoopSegment(context, gain, buffer);
    })
    .catch(() => {
      // Missing/undecodable asset -- the rest of the voice flow doesn't
      // depend on this, so just drop it silently.
      if (activeGain === gain) activeGain = null;
    });
}

function playFiller(context: AudioContext, gain: GainNode, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);

  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(FILLER_TARGET_GAIN, now + FILLER_FADE_IN_SECONDS);
  const fadeOutStart = Math.max(now + FILLER_FADE_IN_SECONDS, now + buffer.duration - FILLER_FADE_OUT_SECONDS);
  gain.gain.setValueAtTime(FILLER_TARGET_GAIN, fadeOutStart);
  gain.gain.linearRampToValueAtTime(0, now + buffer.duration);

  source.onended = () => {
    // Same identity-check idiom as playLoopSegment's onended -- defense in
    // depth alongside stopThinkingSound()'s own onended reassignment (see
    // its doc comment) against a stop-during-filler race still chaining
    // into the loop.
    if (activeSource === source) beginLoop(context, gain);
  };
  source.start();
  activeSource = source;
}

/**
 * Starts a short spoken filler line followed by the looping thinking
 * ambience, or no-ops if one is already playing/loading. Safe to call from
 * a user gesture handler (mic tap, send click) -- resumes a suspended
 * AudioContext the same way unlockAudioPlayback() does for TTS playback in
 * play-audio.ts.
 */
export function startThinkingSound(): void {
  if (activeGain) return;
  let context: AudioContext;
  try {
    context = getAudioContext();
  } catch {
    return; // AudioContext unavailable in this environment.
  }
  if (context.state === "suspended") void context.resume();

  const gain = context.createGain();
  gain.connect(context.destination);
  activeGain = gain;

  const fillerUrl = pickRandomFillerUrl();
  loadFillerBuffer(context, fillerUrl)
    .then((buffer) => {
      // stopThinkingSound() may have already run while the fetch/decode was
      // in flight -- see beginLoop's identical check.
      if (activeGain !== gain) return;
      playFiller(context, gain, buffer);
    })
    .catch(() => {
      // Missing/undecodable filler line must never break the ambient loop
      // that already works on its own -- fall straight into it.
      if (activeGain !== gain) return;
      beginLoop(context, gain);
    });
}

/**
 * Fades out and stops the thinking ambience. Safe to call even when nothing
 * is playing (e.g. a text-originated turn that never started one, or a
 * second cleanup call after onPlaybackStart already stopped it). Clears
 * shouldContinue synchronously, before anything else, so a replay that's
 * about to be chained from the current segment's onended can never win a
 * race against this.
 */
export function stopThinkingSound(): void {
  shouldContinue = false;
  const context = audioContext;
  const gain = activeGain;
  const source = activeSource;
  activeGain = null;
  activeSource = null;
  if (!context || !gain) return;

  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
  gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_OUT_SECONDS);

  if (source) {
    source.onended = () => gain.disconnect();
    source.stop(context.currentTime + FADE_OUT_SECONDS);
  } else {
    gain.disconnect();
  }
}
