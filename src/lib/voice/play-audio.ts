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
 * Interrupts whatever is currently playing and points the shared <audio>
 * element at `objectUrl`, without starting playback yet. Split out from
 * startPlayback() below so playAudioStream can attach a MediaSource object
 * URL BEFORE waiting for its "sourceopen" event — that event only fires
 * once a media element's src is actually assigned to it; awaiting it prior
 * to this assignment deadlocks forever (real MediaSource, unlike a test
 * double, will never fire the event on an unattached instance).
 */
function attachObjectUrl(objectUrl: string): HTMLAudioElement {
  releaseCurrent();
  const audio = getSharedAudio();
  currentObjectUrl = objectUrl;
  audio.src = objectUrl;
  return audio;
}

/**
 * Wires up play/onended/onerror on an already-attached `audio` element and
 * resolves once playback ends. A blocked-autoplay rejection (or any other
 * playback failure) is caught and returned as a non-fatal, typed failure
 * rather than an uncaught rejection — callers must never let this break an
 * already-rendered text response.
 */
function startPlayback(audio: HTMLAudioElement, objectUrl: string): Promise<{ played: boolean }> {
  return new Promise((resolve) => {
    const finish = (played: boolean) => {
      // Only this playback's own completion/interruption ever clears the
      // shared slot for it — by the time a later attachObjectUrl() call's
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

export async function playBase64Audio(base64: string, mimetype: string): Promise<{ played: boolean }> {
  const objectUrl = URL.createObjectURL(base64ToBlob(base64, mimetype));
  const audio = attachObjectUrl(objectUrl);
  return startPlayback(audio, objectUrl);
}

// Matches the audio/mpeg contract POST /api/voice/speak's streaming branch
// promises (src/app/api/voice/speak/route.ts). Support for this exact MIME
// type in MediaSource is realistically Chromium-only (Firefox has never
// supported raw MP3 elementary streams in MSE; Safari desktop/iOS don't
// reliably either) — isMediaSourceStreamingSupported() below is what keeps
// every other browser silently on the existing playBase64Audio path.
const STREAM_MIME_TYPE = "audio/mpeg";

export function isMediaSourceStreamingSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(STREAM_MIME_TYPE);
}

function waitForSourceOpen(mediaSource: MediaSource): Promise<void> {
  return new Promise((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
    mediaSource.addEventListener("error", () => reject(new Error("MediaSource error")), { once: true });
  });
}

function appendChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    sourceBuffer.addEventListener("updateend", () => resolve(), { once: true });
    sourceBuffer.addEventListener("error", () => reject(new Error("SourceBuffer error")), { once: true });
    try {
      // Cast: a fetch body reader's Uint8Array is always ArrayBuffer-backed
      // at runtime, but its TS type is generic over ArrayBufferLike (which
      // also covers SharedArrayBuffer) while appendBuffer's BufferSource
      // requires ArrayBuffer specifically -- a type-only mismatch.
      sourceBuffer.appendBuffer(chunk as BufferSource);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Streaming counterpart to playBase64Audio for a raw audio/mpeg Response
 * (the streaming branch of POST /api/voice/speak) — same {played} contract,
 * same shared <audio> element, same interrupt semantics, via
 * attachObjectUrl/startPlayback. Only ever called after
 * isMediaSourceStreamingSupported() has confirmed support; callers must
 * still catch a rejection here and fall back to the existing
 * playBase64Audio + non-streaming request, since the first chunk (the only
 * failure point that rejects rather than degrades, see below) can still
 * fail for reasons unrelated to MSE support itself (a network error, an
 * empty body).
 *
 * Attachment happens BEFORE awaiting "sourceopen": that event only fires
 * once a media element's src is actually pointed at the MediaSource object
 * URL, so waiting for it first (as an earlier version of this function did)
 * deadlocks forever — nothing ever triggers the event.
 *
 * A failure appending a LATER chunk (after playback has already started) is
 * logged and left to degrade the current, already-committed playback rather
 * than rejecting this promise — rejecting here would make the caller retry
 * with a fresh non-streaming request and play a second, duplicate copy of a
 * clip that mostly already played successfully.
 */
export async function playAudioStream(response: Response): Promise<{ played: boolean }> {
  if (!isMediaSourceStreamingSupported()) throw new Error("MediaSource audio/mpeg streaming not supported");
  if (!response.body) throw new Error("Streaming response had no body");

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = attachObjectUrl(objectUrl);
  await waitForSourceOpen(mediaSource);
  const sourceBuffer = mediaSource.addSourceBuffer(STREAM_MIME_TYPE);
  const reader = response.body.getReader();

  const first = await reader.read();
  if (!first.done) await appendChunk(sourceBuffer, first.value);

  const playResult = startPlayback(audio, objectUrl);

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await appendChunk(sourceBuffer, value);
      }
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
    } catch (error) {
      console.error("playAudioStream: background chunk pipe failed", error instanceof Error ? error.message : error);
    }
  })();

  return playResult;
}
