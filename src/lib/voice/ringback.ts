/**
 * The classic phone ringback tone played from the tap on "Start call" until
 * the call connects: 440 Hz and 480 Hz together, 2 seconds of ring then 2
 * seconds of quiet, repeating.
 *
 * Generated in code (a tiny 8 kHz WAV) rather than shipped as a file, so
 * there is no asset to source, license or cache. It plays through a normal
 * <audio> element, not the Web Audio API: on iOS the silent switch mutes Web
 * Audio but not an audio element, which is also how the spoken replies play.
 */
const SAMPLE_RATE = 8000;
const RING_SECONDS = 2;
const GAP_SECONDS = 2;
const TONE_HZ = [440, 480];
// Peak level of the mix, kept low: this plays right at the user's ear.
const AMPLITUDE = 0.28;
// Short fade at each end of the ring so it never clicks.
const FADE_SECONDS = 0.02;
// A call that never connects or fails still must not ring forever.
const MAX_RING_SECONDS = 20;

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

export function buildRingbackWav(): Uint8Array {
  const ringSamples = RING_SECONDS * SAMPLE_RATE;
  const totalSamples = (RING_SECONDS + GAP_SECONDS) * SAMPLE_RATE;
  const fadeSamples = Math.floor(FADE_SECONDS * SAMPLE_RATE);
  const dataBytes = totalSamples * BYTES_PER_SAMPLE;

  const wav = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(wav.buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  writeText(0, "RIFF");
  view.setUint32(4, wav.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < ringSamples; i++) {
    const envelope = Math.min(1, i / fadeSamples, (ringSamples - 1 - i) / fadeSamples);
    const mix = TONE_HZ.reduce((sum, hz) => sum + Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE), 0) / TONE_HZ.length;
    view.setInt16(WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE, Math.round(AMPLITUDE * envelope * mix * 32767), true);
  }
  return wav;
}

/**
 * Starts the ringback. Call it straight from the tap handler, so iOS counts it
 * as a user-initiated play. Returns a function that stops it; stopping twice is
 * harmless. If the browser refuses to play, the call simply goes ahead silently.
 */
export function startRingback(): () => void {
  const url = URL.createObjectURL(new Blob([buildRingbackWav() as BlobPart], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.loop = true;
  audio.setAttribute("playsinline", "true");
  void audio.play().catch(() => undefined);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(safetyTimer);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  };
  const safetyTimer = setTimeout(stop, MAX_RING_SECONDS * 1000);
  return stop;
}
