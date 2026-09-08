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
const FADE_OUT_SECONDS = 0.25;
// This is a full mixed/mastered track, not a subtle synthesized tone -- kept
// well under unity gain so it reads as quiet background music behind the UI
// rather than competing for attention with it.
const TARGET_GAIN = 0.25;

let audioContext: AudioContext | null = null;
let bufferPromise: Promise<AudioBuffer> | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeGain: GainNode | null = null;

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

  loadBuffer(context)
    .then((buffer) => {
      // stopThinkingSound() may have already run while the fetch/decode was
      // in flight (nulling activeGain) -- treat that as "changed its mind
      // before this ever made a sound" rather than starting it anyway.
      if (activeGain !== gain) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      // The 16s clip has short fades baked in at both ends (see
      // trim-thinking-sound.mjs) specifically so this loop restart doesn't
      // click/pop on a longer wait.
      source.loop = true;
      source.connect(gain);
      source.start();
      activeSource = source;
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
 * second cleanup call after onPlaybackStart already stopped it).
 */
export function stopThinkingSound(): void {
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
