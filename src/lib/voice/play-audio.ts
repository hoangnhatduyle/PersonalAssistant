/**
 * SPEC-API-010: client-only playback for a POST /api/voice/speak response.
 * A module-level singleton Audio instance so a new playback always
 * interrupts/replaces any currently-playing one rather than overlapping —
 * handles two rapid voice turns racing. The object URL is revoked on
 * end/error so it doesn't leak.
 */
let currentAudio: HTMLAudioElement | null = null;
let currentFinish: ((played: boolean) => void) | null = null;

function releaseCurrent(): void {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
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

  const objectUrl = URL.createObjectURL(base64ToBlob(base64, mimetype));
  const audio = new Audio(objectUrl);
  currentAudio = audio;

  return new Promise((resolve) => {
    const finish = (played: boolean) => {
      // Only this playback's own completion/interruption ever clears the
      // shared slot for it — by the time a later playBase64Audio() call's
      // releaseCurrent() runs, it already resolved this promise via
      // currentFinish?.(false) above, so this check simply no-ops then.
      if (currentAudio === audio) {
        URL.revokeObjectURL(objectUrl);
        currentAudio = null;
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
