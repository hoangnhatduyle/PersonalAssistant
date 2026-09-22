import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { admin, createUserAndSignIn, openAssistant } from "./fixtures";

// Every other e2e spec in this repo drives the assistant through the text
// box and button clicks -- none of them ever speaks through the mic or
// listens for a spoken reply. That gap is exactly what let the 2026-09-22
// production incident (voice-originated confirmation prompt stuck on
// "Reading that back…" forever, mic never arming, spoken "yes" never heard)
// ship undetected: the bug lived entirely in the "was origin actually
// voice, and did the mic really arm after real TTS finished" path, which no
// test exercised.
//
// This spec closes that gap for real: it replaces getUserMedia with a
// synthetic MediaStream decoded from a real OpenAI-TTS-generated WAV file,
// so the app's own MediaRecorder + AnalyserNode-based silence detection
// (useAutoStopRecorder) runs against genuine audio, feeding a real spoken
// request into the real /api/voice/transcribe (Whisper) -> real LLM ->
// real /api/voice/speak (TTS) -> real playback -> real spoken "yes" ->
// real /api/voice/transcribe again -> real confirm pipeline. No button is
// ever clicked for the confirmation step -- only Confirm/Decline
// disappearing (and the DB row landing) proves the spoken "yes" worked.

const AUDIO_DIR = path.join(__dirname, "fixtures-audio");

/**
 * Loads the two pre-generated WAV fixtures (regenerate via
 * scripts/generate-e2e-voice-fixtures.mjs) as base64 and installs a
 * getUserMedia override -- before any app script runs -- that decodes
 * whichever clip the test most recently selected via
 * window.__setFakeMicAudio(name) into an AudioBufferSourceNode routed
 * through a MediaStreamAudioDestinationNode. The destination keeps emitting
 * silence once the buffer finishes playing (a real Web Audio behavior),
 * which is exactly the "speech, then silence" shape useAutoStopRecorder's
 * own RMS analysis needs to auto-stop -- this is genuine audio through the
 * app's real silence-detection code, not a mocked recorder.
 *
 * The audio is embedded directly (not fetched over the network) because
 * this app registers a real service worker (public/sw.js) that re-issues
 * every fetch via `event.respondWith(fetch(event.request))` from its own
 * execution context -- a page.route() registered on `page` doesn't cover
 * that re-dispatched request, so a network-based fake-mic source fails with
 * a generic "Failed to fetch" the moment the app (not a bare page) is
 * involved. Embedding sidesteps the service worker entirely.
 */
async function installFakeMicrophone(page: Page): Promise<void> {
  const [eventRequest, yes] = await Promise.all([
    readFile(path.join(AUDIO_DIR, "event-request.wav")),
    readFile(path.join(AUDIO_DIR, "yes.wav")),
  ]);
  const clips = { eventRequest: eventRequest.toString("base64"), yes: yes.toString("base64") };

  await page.addInitScript((clipsArg: Record<string, string>) => {
    function base64ToArrayBuffer(base64: string): ArrayBuffer {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    let currentClip: string | null = null;
    (window as unknown as { __setFakeMicAudio: (name: string) => void }).__setFakeMicAudio = (name: string) => {
      currentClip = name;
    };
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (!constraints?.audio || !currentClip) return originalGetUserMedia(constraints);
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      await audioContext.resume().catch(() => {});
      const arrayBuffer = base64ToArrayBuffer(clipsArg[currentClip]);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      return destination.stream;
    };
  }, clips);
}

async function setFakeMicAudio(page: Page, clip: "eventRequest" | "yes"): Promise<void> {
  await page.evaluate((c) => (window as unknown as { __setFakeMicAudio: (name: string) => void }).__setFakeMicAudio(c), clip);
}

test.describe("assistant: real spoken voice loop (regression, 2026-09-22 mic-arm incident)", () => {
  test("a spoken multi-day event request gets a spoken confirmation, and a spoken 'yes' -- no button clicked -- drives the ENTIRE queued chain to completion", async ({
    page,
  }) => {
    // Generous: this drives a real multi-day queued chain (Workstream C)
    // end to end through real audio each step -- the first turn alone
    // (real LLM call over the rambling spoken request) took ~25s in
    // practice, and each subsequent queued day repeats a real
    // speak -> arm -> spoken-"yes" -> transcribe -> confirm cycle, since
    // ConfirmationBar remounts fresh (key={state.sessionId}) for every
    // queued step and calls getUserMedia again -- the fake mic is left set
    // to "yes" for the whole test, so it really does answer every one of
    // them, not just the first.
    test.setTimeout(180_000);
    await installFakeMicrophone(page);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await setFakeMicAudio(page, "eventRequest");
    await page.getByRole("button", { name: "Tap to talk" }).click();
    // Switching the fake source now is safe -- getUserMedia reads
    // currentClip at call time, and the mic click above already triggered
    // its own (separate, CaptureChannel-owned) getUserMedia call with the
    // event-request clip. This just arms every *subsequent* call
    // (ConfirmationBar's own recorder, once armed, for every queued step)
    // to hear "yes" instead.
    await setFakeMicAudio(page, "yes");

    // Real round trip: MediaRecorder captures the synthetic stream until
    // useAutoStopRecorder's own silence detection stops it, then real
    // Whisper transcription, real LLM proposal, real TTS of the
    // confirmation prompt actually starts playing.
    await expect(page.getByText("Reading that back…")).toBeVisible({ timeout: 60_000 });

    // This is the exact thing that was broken in production: the prompt
    // must finish being spoken and hand off to "ready to listen" on its
    // own. If the CaptureChannel effect regresses back to depending on the
    // unstable speakResponse object, this hangs here and the test times out.
    await expect(page.getByText("Reading that back…")).not.toBeVisible({ timeout: 30_000 });

    // No Confirm/Decline button is ever clicked below -- only the spoken
    // "yes" (already queued via setFakeMicAudio above) drives this, through
    // however many queued days the chain has.
    const confirmButton = page.getByRole("button", { name: "Confirm", exact: true });
    await expect(confirmButton).toBeHidden({ timeout: 120_000 });

    const { data, error } = await admin
      .from("appointments")
      .select("title, date, duration_minutes")
      .eq("user_id", user.userId)
      .is("deleted_at", null)
      .order("date", { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    for (const row of data!) {
      expect(row.title.toLowerCase()).toContain("cincinnati");
      expect(row.duration_minutes).toBeLessThanOrEqual(1440);
    }
  });
});
