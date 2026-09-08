/**
 * Soft background music played while the assistant is transcribing/thinking,
 * so the wait before it starts speaking doesn't feel like dead air. Runs on
 * its own AudioContext/GainNode, entirely separate from the shared <audio>
 * element in play-audio.ts that carries actual TTS playback -- the two are
 * expected to coexist only briefly (this fades out the instant real speech
 * starts, via play-audio.ts's onPlaybackStart hook).
 */
// Trimmed to 16s via scripts/trim-thinking-sound.mjs -- the untrimmed
// source has a spoken watermark starting ~17s in.
const THINKING_SOUND_URL = "/sounds/TunePocket-Happy-And-Quiet-Place-Loop.mp3";
const FADE_IN_SECONDS = 0.35;
// Deliberately longer than the clip's own baked-in 0.35s tail fade (see
// trim-thinking-sound.mjs) -- this is the fade heard right as the assistant
// is about to speak, so it needs to read as a graceful hand-off rather than
// an abrupt cut.
const FADE_OUT_SECONDS = 0.8;
// This is a full mixed/mastered track, not a subtle synthesized tone -- kept
// well under unity gain so it reads as quiet background music behind the UI
// rather than competing for attention with it.
const TARGET_GAIN = 0.25;

let audioContext: AudioContext | null = null;
let bufferPromise: Promise<AudioBuffer> | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeGain: GainNode | null = null;
// Native AudioBufferSourceNode.loop restarts the clip unconditionally, with
// no way to veto the next cycle once it's armed -- that's what caused the
// clip's fade-in swell to audibly restart right as real speech was about to
// start (a stop request landing a moment too late to stop it). Replaying
// the buffer manually via onended instead means each next cycle only ever
// starts if this is still true at that moment, so stopThinkingSound() (which
// clears it synchronously, before anything else) always wins the race.
let shouldContinue = false;

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function loadBuffer(context: AudioContext): Promise<AudioBuffer> {
  bufferPromise ??= fetch(THINKING_SOUND_URL)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data));
  return bufferPromise;
}

function playSegment(context: AudioContext, gain: GainNode, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.onended = () => {
    // Covers both a natural end-of-clip and stopThinkingSound()'s explicit
    // stop() call below -- either way, only chain into another cycle if
    // nothing vetoed it (via shouldContinue) and a newer call to
    // startThinkingSound()/stopThinkingSound() hasn't already moved on
    // (via activeSource).
    if (shouldContinue && activeSource === source) playSegment(context, gain, buffer);
  };
  source.start();
  activeSource = source;
}

/**
 * Starts the looping thinking ambience, or no-ops if one is already
 * playing/loading. Safe to call from a user gesture handler (mic tap, send
 * click) -- resumes a suspended AudioContext the same way
 * unlockAudioPlayback() does for TTS playback in play-audio.ts.
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
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(TARGET_GAIN, context.currentTime + FADE_IN_SECONDS);
  gain.connect(context.destination);
  activeGain = gain;
  shouldContinue = true;

  loadBuffer(context)
    .then((buffer) => {
      // stopThinkingSound() may have already run while the fetch/decode was
      // in flight (nulling activeGain) -- treat that as "changed its mind
      // before this ever made a sound" rather than starting it anyway.
      if (activeGain !== gain) return;
      playSegment(context, gain, buffer);
    })
    .catch(() => {
      // Missing/undecodable asset -- the rest of the voice flow doesn't
      // depend on this, so just drop it silently.
      if (activeGain === gain) activeGain = null;
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
