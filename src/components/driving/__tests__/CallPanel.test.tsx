import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { CallSnapshot } from "@/lib/voice/realtime/call-controller";
import type { UseRealtimeCall } from "@/hooks/useRealtimeCall";
import { CALL_DIAGNOSTICS_STORAGE_KEY } from "@/hooks/useCallDiagnostics";

const baseSnapshot: CallSnapshot = {
  phase: "idle",
  activity: "listening",
  muted: false,
  maxSeconds: 300,
  secondsLeft: 300,
  userLine: "",
  assistantLine: "",
  pending: null,
  citations: [],
  extractionLabel: null,
  endReason: null,
  error: null,
  debug: {
    connectionState: "connected",
    iceConnectionState: "connected",
    micSettings: { sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    wakeLockActive: true,
    responseLatenciesMs: [610, 700, 640],
    usage: { inputTokens: 2000, outputTokens: 100, cachedInputTokens: 1500 },
  },
};

const call: UseRealtimeCall = {
  snapshot: baseSnapshot,
  start: vi.fn(),
  end: vi.fn(),
  setMuted: vi.fn(),
  reportScreenDecision: vi.fn(),
};
const setSnapshot = (patch: Partial<CallSnapshot>) => {
  call.snapshot = { ...baseSnapshot, ...patch };
};

const ringback = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("@/lib/voice/ringback", () => ({ startRingback: ringback.start }));

const confirmMutate = vi.fn();
const declineMutate = vi.fn();
vi.mock("@/hooks/useRealtimeCall", () => ({ useRealtimeCall: () => call }));
vi.mock("@/hooks/useVoiceTurn", () => ({
  useConfirmVoiceTurn: () => ({ mutateAsync: confirmMutate, isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: declineMutate, isPending: false }),
}));
// The real AssistantResponse pulls in citation chips; the panel only needs to hand it the line.
vi.mock("@/components/assistant/AssistantResponse", () => ({
  AssistantResponse: ({ message }: { message: string }) => <p data-testid="assistant-line">{message}</p>,
}));

const { CallPanel } = await import("../CallPanel");

describe("CallPanel", () => {
  beforeEach(() => {
    ringback.stop.mockClear();
    ringback.start.mockReset().mockReturnValue(ringback.stop);
    vi.mocked(call.start).mockClear();
    vi.mocked(call.end).mockClear();
    vi.mocked(call.setMuted).mockClear();
    vi.mocked(call.reportScreenDecision).mockClear();
    confirmMutate.mockReset().mockResolvedValue({ result: { summary: "Deleted the task Pay rent." } });
    declineMutate.mockReset().mockResolvedValue({ message: "Okay, I won't delete it." });
    setSnapshot({});
    window.history.pushState({}, "", "/driving");
  });

  it("offers a Start call button, which starts the call from the click itself", () => {
    renderWithProviders(<CallPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    expect(call.start).toHaveBeenCalledTimes(1);
  });

  it("tells the page when a call becomes active, so push-to-talk can step aside", () => {
    const onActiveChange = vi.fn();
    const { rerender } = renderWithProviders(<CallPanel onActiveChange={onActiveChange} />);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);

    setSnapshot({ phase: "connecting" });
    rerender(<CallPanel onActiveChange={onActiveChange} />);
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    setSnapshot({ phase: "ended", endReason: "user" });
    rerender(<CallPanel onActiveChange={onActiveChange} />);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("shows connecting with controls that cannot be misused yet", () => {
    setSnapshot({ phase: "connecting" });
    renderWithProviders(<CallPanel />);
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Mute" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "End call" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows who is talking and the time left on a live call", () => {
    setSnapshot({ phase: "live", activity: "speaking", secondsLeft: 125 });
    renderWithProviders(<CallPanel />);
    expect(screen.getByText("Speaking…")).toBeTruthy();
    expect(screen.getByText("2:05 left")).toBeTruthy();
  });

  it("ends the call and toggles mute from the buttons", () => {
    setSnapshot({ phase: "live" });
    renderWithProviders(<CallPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(call.setMuted).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    expect(call.end).toHaveBeenCalledTimes(1);
  });

  it("offers Unmute while muted", () => {
    setSnapshot({ phase: "live", muted: true });
    renderWithProviders(<CallPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(call.setMuted).toHaveBeenCalledWith(false);
  });

  it("shows the latest words from both sides", () => {
    setSnapshot({ phase: "live", userLine: "what's due today", assistantLine: "You have two things due." });
    renderWithProviders(<CallPanel />);
    expect(screen.getByText("what's due today")).toBeTruthy();
    expect(screen.getByTestId("assistant-line").textContent).toBe("You have two things due.");
  });

  describe("a pending change", () => {
    beforeEach(() => setSnapshot({ phase: "live", pending: { sessionId: "s-1", summary: "Delete the task Pay rent", requiresTap: false } }));

    it("can be confirmed with a tap, which carries it out and tells the assistant what happened", async () => {
      renderWithProviders(<CallPanel />);
      expect(screen.getByText("Delete the task Pay rent")).toBeTruthy();
      expect(screen.getByText(/Say yes or no, or tap a button/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() => expect(call.reportScreenDecision).toHaveBeenCalledWith({ outcome: "executed", summary: "Deleted the task Pay rent." }));
      expect(confirmMutate).toHaveBeenCalledWith("s-1");
    });

    it("can be cancelled with a tap", async () => {
      renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(call.reportScreenDecision).toHaveBeenCalledWith({ outcome: "declined", summary: "Okay, I won't delete it." }));
      expect(declineMutate).toHaveBeenCalledWith("s-1");
    });

    it("says nothing to the assistant when the tap fails (expired, or already handled by voice)", async () => {
      confirmMutate.mockRejectedValue(new Error("expired"));
      renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() => expect(confirmMutate).toHaveBeenCalled());
      expect(call.reportScreenDecision).not.toHaveBeenCalled();
    });

    it("explains that a tap-only change needs the button", () => {
      setSnapshot({ phase: "live", pending: { sessionId: "s-2", summary: "Delete the course Algorithms", requiresTap: true } });
      renderWithProviders(<CallPanel />);
      expect(screen.getByText("This one needs you to tap Confirm.")).toBeTruthy();
    });
  });

  describe("after a call", () => {
    it("offers to call again, and explains a time-limit end", () => {
      setSnapshot({ phase: "ended", endReason: "cap" });
      renderWithProviders(<CallPanel />);
      expect(screen.getByRole("button", { name: "Call again" })).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("The call reached its time limit.");
    });

    it("shows a start failure (for example the daily limit) instead of a generic ending", () => {
      setSnapshot({ phase: "ended", endReason: "error", error: "You've used today's voice call time. It resets at midnight." });
      renderWithProviders(<CallPanel />);
      expect(screen.getByRole("status").textContent).toBe("You've used today's voice call time. It resets at midnight.");
    });

    it("says nothing extra when the user hung up themselves", () => {
      setSnapshot({ phase: "ended", endReason: "user" });
      renderWithProviders(<CallPanel />);
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("ring tone", () => {
    it("rings from the tap on Start call and stops the moment the call is live", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      expect(ringback.start).toHaveBeenCalledTimes(1);
      expect(call.start).toHaveBeenCalledTimes(1);

      setSnapshot({ phase: "connecting" });
      view.rerender(<CallPanel />);
      expect(ringback.stop).not.toHaveBeenCalled();

      setSnapshot({ phase: "live" });
      view.rerender(<CallPanel />);
      expect(ringback.stop).toHaveBeenCalledTimes(1);
    });

    it("stops if the call fails before it ever connects", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      setSnapshot({ phase: "connecting" });
      view.rerender(<CallPanel />);
      setSnapshot({ phase: "ended", error: "Microphone blocked" });
      view.rerender(<CallPanel />);
      expect(ringback.stop).toHaveBeenCalledTimes(1);
    });

    it("stops if the panel goes away mid-ring", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      view.unmount();
      expect(ringback.stop).toHaveBeenCalled();
    });

    it("rings again for 'Call again'", () => {
      setSnapshot({ phase: "ended", endReason: "user" });
      renderWithProviders(<CallPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Call again" }));
      expect(ringback.start).toHaveBeenCalledTimes(1);
      expect(call.start).toHaveBeenCalledTimes(1);
    });

    it("does not ring just because the panel is showing", () => {
      setSnapshot({ phase: "idle" });
      renderWithProviders(<CallPanel />);
      expect(ringback.start).not.toHaveBeenCalled();
    });
  });

  describe("diagnostics", () => {
    it("are hidden unless ?debug=1 is in the address", () => {
      setSnapshot({ phase: "live" });
      renderWithProviders(<CallPanel />);
      expect(screen.queryByText(/reply latency/)).toBeNull();
    });

    it("also show when the Settings toggle is on for this device, with no ?debug=1 in the address", async () => {
      window.history.pushState({}, "", "/driving");
      window.localStorage.setItem(CALL_DIAGNOSTICS_STORAGE_KEY, "1");
      setSnapshot({ phase: "live" });
      try {
        renderWithProviders(<CallPanel />);
        expect(await screen.findByText(/reply latency 640 ms median/)).toBeTruthy();
      } finally {
        window.localStorage.clear();
      }
    });

    it("show the mic settings, reply latency and cache share with ?debug=1", async () => {
      window.history.pushState({}, "", "/driving?debug=1");
      setSnapshot({ phase: "live" });
      renderWithProviders(<CallPanel />);
      expect(await screen.findByText(/reply latency 640 ms median \(3 samples, last 640 ms\)/)).toBeTruthy();
      expect(screen.getByText(/mic 48000 Hz · echo true · noise true · agc true/)).toBeTruthy();
      expect(screen.getByText(/tokens in 2000 \(cached 75%\) · out 100/)).toBeTruthy();
    });
  });
});
