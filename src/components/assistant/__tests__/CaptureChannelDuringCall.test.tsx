import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/Toast";
import { VoiceCaptureProvider } from "@/components/assistant/VoiceCaptureProvider";
import { CaptureChannel } from "@/components/assistant/CaptureChannel";

// A voice call holds the microphone and the speaker, so quick capture's recorder has to give way the moment
// one starts. The recorder and the call are both stood in for here; what is under test is the hand-off.

const recorder = vi.hoisted(() => ({ cancel: vi.fn(), status: "idle" as "idle" | "listening" }));
vi.mock("@/hooks/useAutoStopRecorder", () => ({
  useAutoStopRecorder: () => ({ status: recorder.status, start: vi.fn(async () => {}), stop: vi.fn(), cancel: recorder.cancel }),
}));
const stopPlayback = vi.hoisted(() => vi.fn());
vi.mock("@/lib/voice/play-audio", () => ({ onPlaybackStart: () => () => undefined, unlockAudioPlayback: vi.fn(), stopPlayback }));

const inCall = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/assistant/RealtimeCallProvider", () => ({ useIsInCall: () => inCall.value }));

vi.mock("@/hooks/useSpeakVoiceResponse", () => ({ useSpeakVoiceResponse: () => ({ mutateAsync: vi.fn(), isPending: false, speak: vi.fn() }) }));
vi.mock("@/hooks/useVoiceTurn", () => ({
  useVoiceTurn: () => ({ mutateAsync: vi.fn() }),
  useArmVoiceTurn: () => ({ mutateAsync: vi.fn() }),
  useConfirmVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExpireVoiceTurn: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: { hands_free_voice_enabled: false } }) }));
vi.mock("@/hooks/usePersonalizationSuggestions", () => ({ usePersonalizationSuggestions: () => ({ refetch: vi.fn() }) }));
vi.mock("@/hooks/useReviewSuggestionsAloud", () => ({ useReviewSuggestionsAloud: () => ({ start: vi.fn(), isActive: false }) }));
vi.mock("@/hooks/useResetVoiceConversation", () => ({ useResetVoiceConversation: () => ({ mutate: vi.fn(), isPending: false }) }));

function renderChannel() {
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

describe("CaptureChannel during a call", () => {
  beforeEach(() => {
    recorder.cancel.mockClear();
    stopPlayback.mockClear();
    recorder.status = "idle";
    inCall.value = false;
  });

  it("leaves the recorder alone while there is no call", () => {
    renderChannel();
    expect(recorder.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tap to talk" })).toBeEnabled();
  });

  it("disables the mic while a call is on", () => {
    inCall.value = true;
    renderChannel();
    expect(screen.getByRole("button", { name: "Tap to talk" })).toBeDisabled();
  });

  it("drops an in-progress recording and any spoken reply the moment a call starts", () => {
    const view = renderChannel();
    expect(recorder.cancel).not.toHaveBeenCalled();

    inCall.value = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <VoiceCaptureProvider>
            <CaptureChannel />
          </VoiceCaptureProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(recorder.cancel).toHaveBeenCalled();
    expect(stopPlayback).toHaveBeenCalled();
  });

  it("enables the mic again once the call is over", () => {
    inCall.value = true;
    const view = renderChannel();
    expect(screen.getByRole("button", { name: "Tap to talk" })).toBeDisabled();

    inCall.value = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <VoiceCaptureProvider>
            <CaptureChannel />
          </VoiceCaptureProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Tap to talk" })).toBeEnabled();
  });
});
