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
  paused = false;
  playCalls = 0;
  play: () => Promise<void> = () => {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  };

  private _src = "";
  get src(): string {
    return this._src;
  }
  // A real <audio>.src assignment is what triggers a MediaSource's
  // "sourceopen" event once the browser attaches it — regression coverage
  // for exactly the bug this fake used to hide (an earlier version fired
  // sourceopen unconditionally on registration, so code that awaited it
  // BEFORE ever assigning audio.src deadlocked in real browsers without
  // this test suite ever noticing).
  set src(value: string) {
    this._src = value;
    mediaSourceByUrl.get(value)?._notifyAttached();
  }

  constructor() {
    instances.push(this);
  }

  pause(): void {
    this.paused = true;
  }
}

/**
 * jsdom has neither MediaSource nor SourceBuffer. FakeMediaSource only
 * fires "sourceopen" once FakeAudio's src setter (above) actually assigns
 * its object URL — mirroring the real attachment requirement — via the
 * `mediaSourceByUrl` registry populated by the stubbed URL.createObjectURL
 * below. FakeSourceBuffer consumes one entry off the shared
 * `appendResultQueue` per appendBuffer() call (defaulting to "success"),
 * firing the corresponding event on a microtask to mirror the real API's
 * asynchrony.
 */
let appendResultQueue: Array<"success" | "error">;
let mediaSourceByUrl: Map<string, FakeMediaSource>;
let objectUrlCounter: number;

class FakeSourceBuffer {
  // appendChunk() always registers "updateend" then "error" for the same
  // call, immediately followed by one appendBuffer() call — pairing
  // consecutive registrations keeps each call's two listeners isolated from
  // every other call's, so a later call's error path can never fire an
  // earlier (already-settled) call's stale listener.
  private pendingPairs: Array<{ updateend: () => void; error: () => void }> = [];
  private partialPair: Partial<{ updateend: () => void; error: () => void }> = {};
  appendCalls = 0;

  addEventListener(type: "updateend" | "error", cb: () => void): void {
    this.partialPair[type] = cb;
    if (this.partialPair.updateend && this.partialPair.error) {
      this.pendingPairs.push(this.partialPair as { updateend: () => void; error: () => void });
      this.partialPair = {};
    }
  }

  appendBuffer(_chunk: BufferSource): void {
    this.appendCalls += 1;
    const result = appendResultQueue.shift() ?? "success";
    queueMicrotask(() => {
      const pair = this.pendingPairs.shift();
      if (result === "error") pair?.error();
      else pair?.updateend();
    });
  }
}

class FakeMediaSource {
  static isTypeSupported = vi.fn(() => true);
  readyState: "closed" | "open" | "ended" = "closed";
  sourceBuffers: FakeSourceBuffer[] = [];
  private sourceopenListeners: Array<() => void> = [];
  private attached = false;

  addEventListener(type: "sourceopen" | "error", cb: () => void): void {
    if (type !== "sourceopen") return;
    if (this.attached) cb();
    else this.sourceopenListeners.push(cb);
  }

  /** Called by FakeAudio's src setter once assigned this instance's object URL. */
  _notifyAttached(): void {
    this.attached = true;
    this.readyState = "open";
    this.sourceopenListeners.splice(0).forEach((cb) => cb());
  }

  addSourceBuffer(_mime: string): FakeSourceBuffer {
    const sourceBuffer = new FakeSourceBuffer();
    this.sourceBuffers.push(sourceBuffer);
    return sourceBuffer;
  }

  endOfStream(): void {
    this.readyState = "ended";
  }
}

/** Yields to the macrotask queue so pending queueMicrotask/promise chains resolve before asserting. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeStreamResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  return { body: stream } as unknown as Response;
}

let instances: FakeAudio[];
let playAudio: typeof import("../play-audio");

beforeEach(async () => {
  instances = [];
  appendResultQueue = [];
  mediaSourceByUrl = new Map();
  objectUrlCounter = 0;
  vi.resetModules();
  // Import before stubbing URL — Vite's own dynamic-import resolution uses
  // the real URL constructor internally, so stubbing it first breaks the
  // import itself.
  playAudio = await import("../play-audio");
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("MediaSource", FakeMediaSource);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((obj: unknown) => {
      const url = `blob:${objectUrlCounter++}`;
      if (obj instanceof FakeMediaSource) mediaSourceByUrl.set(url, obj);
      return url;
    }),
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

describe("isMediaSourceStreamingSupported", () => {
  it("returns true when MediaSource reports support for audio/mpeg", () => {
    expect(playAudio.isMediaSourceStreamingSupported()).toBe(true);
  });

  it("returns false when MediaSource is not present", () => {
    vi.stubGlobal("MediaSource", undefined);
    expect(playAudio.isMediaSourceStreamingSupported()).toBe(false);
  });

  it("returns false when isTypeSupported reports no support", () => {
    class UnsupportedMediaSource extends FakeMediaSource {
      static isTypeSupported = vi.fn(() => false);
    }
    vi.stubGlobal("MediaSource", UnsupportedMediaSource);
    expect(playAudio.isMediaSourceStreamingSupported()).toBe(false);
  });
});

describe("playAudioStream", () => {
  it("plays a streamed response through the shared <audio> element", async () => {
    const promise = playAudio.playAudioStream(makeStreamResponse([new Uint8Array([1, 2, 3])]));
    await flush();
    instances[0].onended?.();
    await expect(promise).resolves.toEqual({ played: true });
    expect(instances).toHaveLength(1);
  });

  it("throws and never reaches play() when the first chunk fails to append", async () => {
    appendResultQueue = ["error"];
    await expect(playAudio.playAudioStream(makeStreamResponse([new Uint8Array([1])]))).rejects.toThrow();
    // The shared <audio> element IS attached before the first chunk (that
    // attachment is what lets "sourceopen" fire at all — see the fake's
    // regression coverage above) — but play() itself must never be called
    // when the first chunk never successfully buffers.
    expect(instances[0]?.playCalls ?? 0).toBe(0);
  });

  it("logs, rather than rejects, when a later (already-playing) chunk fails to append", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    appendResultQueue = ["success", "error"];
    const promise = playAudio.playAudioStream(makeStreamResponse([new Uint8Array([1]), new Uint8Array([2])]));
    await flush();
    instances[0].onended?.();
    await expect(promise).resolves.toEqual({ played: true });
    await flush();
    expect(consoleErrorSpy).toHaveBeenCalledWith("playAudioStream: background chunk pipe failed", expect.any(String));
    consoleErrorSpy.mockRestore();
  });

  it("rejects when MediaSource streaming is not supported", async () => {
    vi.stubGlobal("MediaSource", undefined);
    await expect(playAudio.playAudioStream(makeStreamResponse([new Uint8Array([1])]))).rejects.toThrow(/not supported/);
    expect(instances).toHaveLength(0);
  });

  it("rejects when the response has no body", async () => {
    await expect(playAudio.playAudioStream({ body: null } as unknown as Response)).rejects.toThrow(/no body/);
  });

  it("interrupts a buffered playback exactly like a second buffered call would", async () => {
    const firstPromise = playAudio.playBase64Audio("aGVsbG8=", "audio/mpeg");
    const secondPromise = playAudio.playAudioStream(makeStreamResponse([new Uint8Array([1])]));

    await expect(firstPromise).resolves.toEqual({ played: false });

    await flush();
    instances[0].onended?.();
    await expect(secondPromise).resolves.toEqual({ played: true });
  });
});
