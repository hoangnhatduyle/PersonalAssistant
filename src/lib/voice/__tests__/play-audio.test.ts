import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jsdom implements neither HTMLMediaElement.play()/pause() nor
 * URL.createObjectURL — both throw "Not implemented". This fake Audio
 * stands in for the real element so play-audio.ts's interrupt/race logic
 * (the thing under test) can be exercised deterministically.
 *
 * NC-PWA-AUDIO-UNLOCK: playback now reuses a single module-level <audio>
 * element (constructed via `new Audio()` with no src, then `.src` is
 * assigned separately) instead of a fresh `new Audio(src)` per call — that
 * reuse is exactly what lets unlockAudioPlayback()'s gesture-time unlock
 * carry into the later async playBase64Audio() call on iOS standalone PWAs.
 * `vi.resetModules()` + dynamic import in beforeEach gives each test a
 * fresh module instance, so the shared singleton doesn't leak across tests.
 */
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  paused = false;
  playCalls = 0;
  play: () => Promise<void> = () => {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  };

  constructor() {
    instances.push(this);
  }

  pause(): void {
    this.paused = true;
  }
}

let instances: FakeAudio[];
let playAudio: typeof import("../play-audio");

beforeEach(async () => {
  instances = [];
  vi.resetModules();
  // Import before stubbing URL — Vite's own dynamic-import resolution uses
  // the real URL constructor internally, so stubbing it first breaks the
  // import itself.
  playAudio = await import("../play-audio");
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:${instances.length}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playBase64Audio", () => {
  it("resolves { played: true } when playback ends naturally", async () => {
    const promise = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    instances[0].onended?.();
    await expect(promise).resolves.toEqual({ played: true });
  });

  it("resolves { played: false } when playback errors", async () => {
    const promise = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    instances[0].onerror?.();
    await expect(promise).resolves.toEqual({ played: false });
  });

  it("resolves { played: false } for a blocked-autoplay rejection instead of throwing", async () => {
    class BlockedAudio extends FakeAudio {
      play = () => Promise.reject(new Error("NotAllowedError"));
    }
    vi.stubGlobal("Audio", BlockedAudio);
    await expect(playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg")).resolves.toEqual({ played: false });
  });

  it("reuses a single <audio> element across calls instead of constructing a new one each time", async () => {
    const first = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    instances[0].onended?.();
    await first;

    const second = playAudio.playBase64Audio("d29ybGQ=", "audio/mpeg");
    instances[0].onended?.();
    await second;

    expect(instances).toHaveLength(1);
    expect(instances[0].playCalls).toBe(2);
  });

  // Regression test: code-review finding — an interrupted playback's own
  // promise must still resolve (as { played: false }) rather than hang
  // forever, since its onended/onerror get overwritten by the interrupting
  // call before they ever fire.
  it("resolves the interrupted playback's promise as { played: false } when a second call interrupts it", async () => {
    const firstPromise = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    const secondPromise = playAudio.playBase64Audio("d29ybGQ=", "audio/mpeg");

    await expect(firstPromise).resolves.toEqual({ played: false });

    instances[0].onended?.();
    await expect(secondPromise).resolves.toEqual({ played: true });
  });

  it("does not let a stray call to the superseded playback's original onended resolve the new promise", async () => {
    const firstPromise = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    const originalOnended = instances[0].onended;
    const secondPromise = playAudio.playBase64Audio("d29ybGQ=", "audio/mpeg");
    await firstPromise;

    // The interrupting call reassigned onended to its own handler — the
    // closure captured above is orphaned. Invoking it must not resolve or
    // otherwise affect the still-open second promise.
    originalOnended?.();

    instances[0].onended?.();
    await expect(secondPromise).resolves.toEqual({ played: true });
  });
});

describe("unlockAudioPlayback", () => {
  it("primes the shared <audio> element with a play/pause cycle during the gesture", () => {
    playAudio.unlockAudioPlayback();

    expect(instances).toHaveLength(1);
    expect(instances[0].src).toContain("data:audio/wav;base64,");
    expect(instances[0].playCalls).toBe(1);
  });

  it("does not throw when called repeatedly", () => {
    expect(() => {
      playAudio.unlockAudioPlayback();
      playAudio.unlockAudioPlayback();
    }).not.toThrow();
  });
});
