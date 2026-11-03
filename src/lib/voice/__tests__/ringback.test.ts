import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRingbackWav, startRingback } from "../ringback";

const HEADER_BYTES = 44;

function samplesOf(wav: Uint8Array): Int16Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const out = new Int16Array((wav.byteLength - HEADER_BYTES) / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(HEADER_BYTES + i * 2, true);
  return out;
}

/** Signal strength at one frequency (Goertzel), normalised by length. */
function energyAt(samples: Int16Array, from: number, to: number, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  let re = 0;
  let im = 0;
  for (let i = from; i < to; i++) {
    re += samples[i] * Math.cos(w * i);
    im -= samples[i] * Math.sin(w * i);
  }
  return Math.hypot(re, im) / (to - from);
}

describe("buildRingbackWav", () => {
  const wav = buildRingbackWav();
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...wav.slice(offset, offset + length));
  const sampleRate = view.getUint32(24, true);

  it("is a mono 16-bit PCM WAV whose declared sizes match its bytes", () => {
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(wav.byteLength - HEADER_BYTES);
  });

  it("is one 4-second cycle: 2 seconds of ring, then 2 seconds of silence, so looping repeats the classic cadence", () => {
    const samples = samplesOf(wav);
    expect(samples.length / sampleRate).toBeCloseTo(4, 2);
    const ring = samples.slice(0, 2 * sampleRate);
    const gap = samples.slice(2 * sampleRate);
    expect(Math.max(...ring.map(Math.abs))).toBeGreaterThan(0.2 * 32767);
    expect(Math.max(...gap.map(Math.abs))).toBe(0);
  });

  it("is the 440 Hz plus 480 Hz ringback, at a polite volume (peak about 0.28)", () => {
    const samples = samplesOf(wav);
    const peak = Math.max(...samples.map(Math.abs)) / 32767;
    expect(peak).toBeGreaterThan(0.25);
    expect(peak).toBeLessThanOrEqual(0.29);
    const from = Math.floor(0.5 * sampleRate);
    const to = Math.floor(1.5 * sampleRate);
    const at440 = energyAt(samples, from, to, 440, sampleRate);
    const at480 = energyAt(samples, from, to, 480, sampleRate);
    const at1000 = energyAt(samples, from, to, 1000, sampleRate);
    expect(at440).toBeGreaterThan(10 * at1000);
    expect(at480).toBeGreaterThan(10 * at1000);
  });

  it("fades in and out, so neither edge of the ring clicks", () => {
    const samples = samplesOf(wav);
    expect(samples[0]).toBe(0);
    const edge = 2 * sampleRate;
    expect(Math.abs(samples[edge - 1])).toBeLessThan(0.02 * 32767);
  });
});

describe("startRingback", () => {
  const play = vi.fn();
  const pause = vi.fn();
  let created: Array<{ src: string; loop: boolean }>;

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    play.mockReset().mockResolvedValue(undefined);
    pause.mockReset();
    class FakeAudio {
      src: string;
      loop = false;
      constructor(src: string) {
        this.src = src;
        created.push(this);
      }
      setAttribute = vi.fn();
      removeAttribute = vi.fn();
      load = vi.fn();
      play = play;
      pause = pause;
    }
    vi.stubGlobal("Audio", FakeAudio);
    URL.createObjectURL = vi.fn(() => "blob:ringback");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("plays the tone on a loop, straight away", () => {
    startRingback();
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("blob:ringback");
    expect(created[0].loop).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("stops, and releases the sound, when asked; asking again does nothing", () => {
    const stop = startRingback();
    stop();
    stop();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("never rings forever: it stops itself if nothing ever stops it", () => {
    startRingback();
    vi.advanceTimersByTime(30_000);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the browser refuses to play (the call goes on without the tone)", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    expect(() => startRingback()).not.toThrow();
    await Promise.resolve();
  });
});
