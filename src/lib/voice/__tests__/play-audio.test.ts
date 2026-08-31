import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playBase64Audio } from "../play-audio";

/**
 * jsdom implements neither HTMLMediaElement.play()/pause() nor
 * URL.createObjectURL — both throw "Not implemented". This fake Audio
 * stands in for the real element so play-audio.ts's interrupt/race logic
 * (the thing under test) can be exercised deterministically.
 */
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  playCalls = 0;
  play: () => Promise<void> = () => {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  };

  constructor(public src: string) {
    instances.push(this);
  }

  pause(): void {
    this.paused = true;
  }
}

let instances: FakeAudio[];

beforeEach(() => {
  instances = [];
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
    const promise = playBase64Audio("aGVsbG8=", "audio/mpeg");
    instances[0].onended?.();
    await expect(promise).resolves.toEqual({ played: true });
  });

  it("resolves { played: false } when playback errors", async () => {
    const promise = playBase64Audio("aGVsbG8=", "audio/mpeg");
    instances[0].onerror?.();
    await expect(promise).resolves.toEqual({ played: false });
  });

  it("resolves { played: false } for a blocked-autoplay rejection instead of throwing", async () => {
    class BlockedAudio extends FakeAudio {
      play = () => Promise.reject(new Error("NotAllowedError"));
    }
    vi.stubGlobal("Audio", BlockedAudio);
    await expect(playBase64Audio("aGVsbG8=", "audio/mpeg")).resolves.toEqual({ played: false });
  });

  // Regression test: code-review finding — an interrupted playback's own
  // promise must still resolve (as { played: false }) rather than hang
  // forever, since its onended/onerror get nulled out by the interrupting
  // call before they ever fire.
  it("resolves the interrupted playback's promise as { played: false } when a second call interrupts it", async () => {
    const firstPromise = playBase64Audio("aGVsbG8=", "audio/mpeg");
    const secondPromise = playBase64Audio("d29ybGQ=", "audio/mpeg");

    await expect(firstPromise).resolves.toEqual({ played: false });
    expect(instances[0].paused).toBe(true);

    instances[1].onended?.();
    await expect(secondPromise).resolves.toEqual({ played: true });
  });

  it("nulls out the superseded playback's onended so a stray late event can't affect the new one", async () => {
    const firstPromise = playBase64Audio("aGVsbG8=", "audio/mpeg");
    const secondPromise = playBase64Audio("d29ybGQ=", "audio/mpeg");
    await firstPromise;

    // The first Audio's onended was nulled by the interrupt — calling it
    // directly here (as if a stray browser event fired late) must not
    // throw or affect the second playback's still-open promise.
    expect(instances[0].onended).toBeNull();
    instances[0].onended?.();

    instances[1].onended?.();
    await expect(secondPromise).resolves.toEqual({ played: true });
  });
});
