/**
 * SPEC-API-010: client-only playback for a POST /api/voice/speak response.
 * A single reusable <audio> element for all playback — NC-PWA-AUDIO-UNLOCK:
 * iOS standalone PWAs (unlike a Safari tab) don't grant autoplay leniency
 * that survives the async STT→LLM→TTS round trip, so playback must reuse
 * the exact element that was unlocked during the tap gesture in
 * unlockAudioPlayback() below — a freshly constructed `new Audio()` per
 * call is never activated and gets silently blocked. currentObjectUrl
 * tracks which playback is "current" so a new call always
 * interrupts/replaces any currently-playing one rather than overlapping —
 * handles two rapid voice turns racing. The object URL is revoked on
 * end/error so it doesn't leak.
 */
let sharedAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let currentFinish: ((played: boolean) => void) | null = null;

function getSharedAudio(): HTMLAudioElement {
  sharedAudio ??= new Audio();
  return sharedAudio;
}

// 44-byte silent WAV — just enough for a real play()/pause() cycle to run
// during the gesture without any audible blip.
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Call synchronously during a user gesture (e.g. mic tap) to unlock audio
 * playback on mobile browsers. Resumes a WebAudio AudioContext (helps some
 * Android/Chrome cases), and — the part that matters for iOS standalone
 * PWAs — plays a silent clip on the actual shared <audio> element so that
 * element itself carries user-activation into the later async
 * `playBase64Audio()` call, which reuses it rather than constructing a new,
 * never-activated element.
 */
let audioContext: AudioContext | null = null;
export function unlockAudioPlayback(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    // AudioContext unavailable — playback will rely on direct gesture chain
  }

  try {
    const audio = getSharedAudio();
    if (!audio.src) audio.src = SILENT_WAV;
    const playAttempt = audio.play();
    void playAttempt
      ?.then(() => audio.pause())
      .catch(() => {
        // Unlock attempt blocked — later play() calls will rely on
        // whatever gesture leniency the browser grants.
      });
  } catch {
    // Shared <audio> element unavailable in this environment.
  }
}

function releaseCurrent(): void {
  if (sharedAudio) {
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    sharedAudio.pause();
  }
  // Code-review finding: without this, an interrupted playback's own
  // promise (from a still-in-flight earlier playBase64Audio() call) would
  // never resolve — its onended/onerror handlers were just nulled above,
  // so nothing would ever call its finish(). Resolving it here as "not
  // played" keeps this function's "resolves once playback ends" contract
  // honest even under rapid back-to-back calls.
  currentFinish?.(false);
}

function base64ToBlob(base64: string, mimetype: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimetype });
}

/**
 * Resolves once playback ends. A blocked-autoplay rejection (or any other
 * playback failure) is caught and returned as a non-fatal, typed failure
 * rather than an uncaught rejection — callers must never let this break an
 * already-rendered text response.
 */
export async function playBase64Audio(base64: string, mimetype: string): Promise<{ played: boolean }> {
  releaseCurrent();

  const audio = getSharedAudio();
  const objectUrl = URL.createObjectURL(base64ToBlob(base64, mimetype));
  currentObjectUrl = objectUrl;
  audio.src = objectUrl;

  return new Promise((resolve) => {
    const finish = (played: boolean) => {
      // Only this playback's own completion/interruption ever clears the
      // shared slot for it — by the time a later playBase64Audio() call's
      // releaseCurrent() runs, it already resolved this promise via
      // currentFinish?.(false) above, so this check simply no-ops then.
      if (currentObjectUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentObjectUrl = null;
        currentFinish = null;
      }
      resolve({ played });
    };
    currentFinish = finish;
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.play().catch(() => finish(false));
  });
}
