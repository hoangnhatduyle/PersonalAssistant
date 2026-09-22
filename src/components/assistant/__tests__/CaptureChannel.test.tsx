import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/Toast";
import { VoiceCaptureProvider } from "@/components/assistant/VoiceCaptureProvider";
import { CaptureChannel } from "@/components/assistant/CaptureChannel";

// Production incident (2026-09-22): a voice-originated AwaitingConfirmation
// prompt got permanently stuck on "Reading that back…" with the mic never
// arming for a spoken yes/no, even though the TTS audio itself played fine
// and the user repeated "yes" several times. Root cause: CaptureChannel's
// own awaiting-confirmation effect (the one that speaks the prompt, then
// flips confirmationReadySessionId once done) listed `speakResponse` (from
// useSpeakVoiceResponse()) in its dependency array -- but that hook returns
// a brand-new object every render (see useSpeakVoiceResponse.ts's
// `{ ...mutation, ... }` spread), including the instant its own mutateAsync
// call flips isPending true, which this exact effect's own call triggers.
// React's rerun-effect-on-changed-deps then ran this effect's OWN cleanup
// before the in-flight speak promise ever settled, permanently voiding
// confirmationReadySessionId via the stale `cancelled` flag -- the ref
// guard then silently no-ops the effect's second invocation, so nothing
// ever retries. This test's fake useSpeakVoiceResponse mirrors that exact
// object-recreation-on-every-render behavior (via real useState, not a
// static mock) so it reproduces the same race the production hook does.

const { speakMutateAsync, resolveSpeak } = vi.hoisted(() => {
  const resolvers: Array<() => void> = [];
  const mutateAsync = vi.fn(async (text: string) => {
    void text;
    await new Promise<void>((resolve) => resolvers.push(resolve));
    return { played: true };
  });
  return {
    speakMutateAsync: mutateAsync,
    resolveSpeak: () => resolvers.shift()?.(),
  };
});

vi.mock("@/hooks/useSpeakVoiceResponse", () => ({
  useSpeakVoiceResponse: () => {
    const [isPending, setIsPending] = useState(false);
    const mutateAsync = async (text: string) => {
      setIsPending(true);
      try {
        return await speakMutateAsync(text);
      } finally {
        setIsPending(false);
      }
    };
    // Fresh object every call -- exactly what the real hook's
    // `{ ...mutation, ... }` spread does.
    return { mutateAsync, isPending, speak: vi.fn() };
  },
}));

const voiceTurnMutateAsync = vi.fn();
vi.mock("@/hooks/useVoiceTurn", () => ({
  useVoiceTurn: () => ({ mutateAsync: voiceTurnMutateAsync }),
  useArmVoiceTurn: () => ({ mutateAsync: vi.fn().mockResolvedValue({ session_id: "session-1", armed: true }) }),
  useConfirmVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExpireVoiceTurn: () => ({ mutateAsync: vi.fn() }),
}));

// Persistent across renders (unlike a fresh vi.fn() per call) -- both
// CaptureChannel and ConfirmationBar re-render several times over the
// course of this test, and useAutoStopRecorder is called unconditionally on
// every one of them, so a spy created fresh inside the mock factory would
// only ever capture whichever render happened to be active when start()
// was called, not the calls that mattered.
const micStart = vi.fn(async () => {});
const confirmStart = vi.fn(async () => {});
let micOnComplete: ((blob: Blob) => void) | null = null;
vi.mock("@/hooks/useAutoStopRecorder", () => ({
  useAutoStopRecorder: (onComplete: (blob: Blob) => void, options?: unknown) => {
    // CaptureChannel's own mic recorder is called with no options object;
    // ConfirmationBar's spoken yes/no listener always passes one
    // (silenceMs/maxDurationMs) -- see both call sites.
    if (options) return { status: "idle" as const, start: confirmStart, stop: vi.fn(), cancel: vi.fn() };
    micOnComplete = onComplete;
    return { status: "idle" as const, start: micStart, stop: vi.fn(), cancel: vi.fn() };
  },
}));

vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: { hands_free_voice_enabled: false } }) }));
vi.mock("@/hooks/usePersonalizationSuggestions", () => ({ usePersonalizationSuggestions: () => ({ refetch: vi.fn() }) }));
vi.mock("@/hooks/useReviewSuggestionsAloud", () => ({ useReviewSuggestionsAloud: () => ({ start: vi.fn(), isActive: false }) }));
vi.mock("@/hooks/useResetVoiceConversation", () => ({ useResetVoiceConversation: () => ({ mutate: vi.fn(), isPending: false }) }));

function renderCaptureChannel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <VoiceCaptureProvider>
          <CaptureChannel />
        </VoiceCaptureProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CaptureChannel — voice confirmation mic-arm race (regression, 2026-09-22 incident)", () => {
  beforeEach(() => {
    micOnComplete = null;
    micStart.mockClear();
    confirmStart.mockClear();
    voiceTurnMutateAsync.mockReset();
    speakMutateAsync.mockClear();
  });

  it("arms the mic for a spoken yes/no once the confirmation prompt finishes speaking, even though that same speak call's own isPending flip forces a mid-flight re-render", async () => {
    voiceTurnMutateAsync.mockResolvedValue({
      state: "AwaitingConfirmation",
      sessionId: "session-1",
      message: "Add blink Cincinnati for Thursday, October 8th, 7 to 11 PM?",
    });

    renderCaptureChannel();
    expect(micOnComplete).not.toBeNull();

    await act(async () => {
      micOnComplete!(new Blob(["fake audio"], { type: "audio/webm" }));
    });

    // The prompt is being read back -- confirmed not yet ready to listen.
    await waitFor(() => expect(screen.getByText("Reading that back…")).toBeInTheDocument());
    await waitFor(() => expect(speakMutateAsync).toHaveBeenCalledTimes(1));

    // Give the isPending(true) state update -- triggered by the speak call
    // itself, from inside CaptureChannel's own effect -- a chance to
    // actually commit and re-render CaptureChannel BEFORE the speak promise
    // resolves. This is the exact mid-flight re-render that used to cancel
    // the effect via its own stale-closure cleanup.
    await act(async () => {
      await Promise.resolve();
    });

    // Now let the TTS call finish.
    await act(async () => {
      resolveSpeak();
      await Promise.resolve();
    });

    // Fixed behavior: the prompt finishes, confirmationReadySessionId gets
    // set, and ConfirmationBar starts listening for a spoken yes/no.
    await waitFor(() => expect(screen.queryByText("Reading that back…")).not.toBeInTheDocument());
    await waitFor(() => expect(confirmStart).toHaveBeenCalledTimes(1));
  });
});
