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
  sendText: vi.fn(),
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

// The call itself now lives in the provider (so the header can start it too); Driving Mode's panel reads it.
vi.mock("next/navigation", () => ({ usePathname: () => "/driving" }));

const { CallPanel } = await import("../CallPanel");
const { RealtimeCallProvider, useIsInCall } = await import("@/components/assistant/RealtimeCallProvider");

/** The panel the way Driving Mode mounts it: inside the provider. */
const DrivingCall = () => (
  <RealtimeCallProvider>
    <CallPanel />
  </RealtimeCallProvider>
);

describe("CallPanel", () => {
  beforeEach(() => {
    ringback.stop.mockClear();
    ringback.start.mockReset().mockReturnValue(ringback.stop);
    vi.mocked(call.start).mockClear();
    vi.mocked(call.end).mockClear();
    vi.mocked(call.setMuted).mockClear();
    vi.mocked(call.sendText).mockClear();
    vi.mocked(call.reportScreenDecision).mockClear();
    confirmMutate.mockReset().mockResolvedValue({ result: { summary: "Deleted the task Pay rent." } });
    declineMutate.mockReset().mockResolvedValue({ message: "Okay, I won't delete it." });
    setSnapshot({});
    window.history.pushState({}, "", "/driving");
  });

  it("offers a Start call button, which starts the call from the click itself", () => {
    renderWithProviders(<DrivingCall />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    expect(call.start).toHaveBeenCalledTimes(1);
  });

  it("tells the rest of the page when a call is on, so push-to-talk can step aside", () => {
    const Probe = () => <p data-testid="in-call">{String(useIsInCall())}</p>;
    const Page = () => (
      <RealtimeCallProvider>
        <CallPanel />
        <Probe />
      </RealtimeCallProvider>
    );
    const { rerender } = renderWithProviders(<Page />);
    expect(screen.getByTestId("in-call")).toHaveTextContent("false");

    setSnapshot({ phase: "connecting" });
    rerender(<Page />);
    expect(screen.getByTestId("in-call")).toHaveTextContent("true");

    setSnapshot({ phase: "ended", endReason: "user" });
    rerender(<Page />);
    expect(screen.getByTestId("in-call")).toHaveTextContent("false");
  });

  it("tells the user to keep the screen on before they start, and again after a call", () => {
    const view = renderWithProviders(<DrivingCall />);
    expect(screen.getByText("Keep the screen on during the call. Locking it ends the call.")).toBeTruthy();
    setSnapshot({ phase: "ended", endReason: "user" });
    view.rerender(<DrivingCall />);
    expect(screen.getByText("Keep the screen on during the call. Locking it ends the call.")).toBeTruthy();
  });

  it("takes over the whole screen as a dialog while the call is connecting, with controls that cannot be misused yet", () => {
    setSnapshot({ phase: "connecting" });
    renderWithProviders(<DrivingCall />);
    expect(screen.getByRole("dialog", { name: "Call with Cadence" })).toBeTruthy();
    expect(screen.getByText("Calling…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Mute" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "End call" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Start call" })).toBeNull();
  });

  it("shows who is talking and how long the call has run, with no countdown until the last minute", () => {
    setSnapshot({ phase: "live", activity: "speaking", maxSeconds: 300, secondsLeft: 125 });
    renderWithProviders(<DrivingCall />);
    expect(screen.getByText("Speaking…")).toBeTruthy();
    expect(screen.getByText("2:55")).toBeTruthy();
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it("shows the time left once the last minute starts", () => {
    setSnapshot({ phase: "live", maxSeconds: 300, secondsLeft: 45 });
    renderWithProviders(<DrivingCall />);
    expect(screen.getByText("4:15 · 0:45 left")).toBeTruthy();
  });

  it("asks what is on today from the Today button", () => {
    setSnapshot({ phase: "live", activity: "listening" });
    renderWithProviders(<DrivingCall />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(call.sendText).toHaveBeenCalledWith("What's on my plate today?");
  });

  it("ends the call and toggles mute from the buttons", () => {
    setSnapshot({ phase: "live" });
    renderWithProviders(<DrivingCall />);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(call.setMuted).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    expect(call.end).toHaveBeenCalledTimes(1);
  });

  it("offers Unmute while muted", () => {
    setSnapshot({ phase: "live", muted: true });
    renderWithProviders(<DrivingCall />);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(call.setMuted).toHaveBeenCalledWith(false);
  });

  it("shows the latest words from both sides once captions are switched on", () => {
    setSnapshot({ phase: "live", userLine: "what's due today", assistantLine: "You have two things due." });
    renderWithProviders(<DrivingCall />);
    expect(screen.queryByText("what's due today")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(screen.getByText("what's due today")).toBeTruthy();
    expect(screen.getByTestId("assistant-line").textContent).toBe("You have two things due.");
  });

  describe("a pending change", () => {
    beforeEach(() => setSnapshot({ phase: "live", pending: { sessionId: "s-1", summary: "Delete the task Pay rent", requiresTap: false } }));

    it("can be confirmed with a tap, which carries it out and tells the assistant what happened", async () => {
      renderWithProviders(<DrivingCall />);
      expect(screen.getByText("Delete the task Pay rent")).toBeTruthy();
      expect(screen.getByText(/Say yes or no, or tap a button/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() => expect(call.reportScreenDecision).toHaveBeenCalledWith({ outcome: "executed", summary: "Deleted the task Pay rent." }));
      expect(confirmMutate).toHaveBeenCalledWith("s-1");
    });

    it("can be cancelled with a tap", async () => {
      renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(call.reportScreenDecision).toHaveBeenCalledWith({ outcome: "declined", summary: "Okay, I won't delete it." }));
      expect(declineMutate).toHaveBeenCalledWith("s-1");
    });

    it("says nothing to the assistant when the tap fails (expired, or already handled by voice)", async () => {
      confirmMutate.mockRejectedValue(new Error("expired"));
      renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() => expect(confirmMutate).toHaveBeenCalled());
      expect(call.reportScreenDecision).not.toHaveBeenCalled();
    });

    it("explains that a tap-only change needs the button", () => {
      setSnapshot({ phase: "live", pending: { sessionId: "s-2", summary: "Delete the course Algorithms", requiresTap: true } });
      renderWithProviders(<DrivingCall />);
      expect(screen.getByText("This one needs you to tap Confirm.")).toBeTruthy();
    });
  });

  describe("after a call", () => {
    it("offers to call again, and explains a time-limit end", () => {
      setSnapshot({ phase: "ended", endReason: "cap" });
      renderWithProviders(<DrivingCall />);
      expect(screen.getByRole("button", { name: "Call again" })).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("The call reached its time limit.");
    });

    it("shows a start failure (for example the daily limit) instead of a generic ending", () => {
      setSnapshot({ phase: "ended", endReason: "error", error: "You've used today's voice call time. It resets at midnight." });
      renderWithProviders(<DrivingCall />);
      expect(screen.getByRole("status").textContent).toBe("You've used today's voice call time. It resets at midnight.");
    });

    it("says nothing extra when the user hung up themselves", () => {
      setSnapshot({ phase: "ended", endReason: "user" });
      renderWithProviders(<DrivingCall />);
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("ring tone", () => {
    it("rings from the tap on Start call and stops the moment the call is live", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      expect(ringback.start).toHaveBeenCalledTimes(1);
      expect(call.start).toHaveBeenCalledTimes(1);

      setSnapshot({ phase: "connecting" });
      view.rerender(<DrivingCall />);
      expect(ringback.stop).not.toHaveBeenCalled();

      setSnapshot({ phase: "live" });
      view.rerender(<DrivingCall />);
      expect(ringback.stop).toHaveBeenCalledTimes(1);
    });

    it("stops if the call fails before it ever connects", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      setSnapshot({ phase: "connecting" });
      view.rerender(<DrivingCall />);
      setSnapshot({ phase: "ended", error: "Microphone blocked" });
      view.rerender(<DrivingCall />);
      expect(ringback.stop).toHaveBeenCalledTimes(1);
    });

    it("stops if the panel goes away mid-ring", () => {
      setSnapshot({ phase: "idle" });
      const view = renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Start call" }));
      view.unmount();
      expect(ringback.stop).toHaveBeenCalled();
    });

    it("rings again for 'Call again'", () => {
      setSnapshot({ phase: "ended", endReason: "user" });
      renderWithProviders(<DrivingCall />);
      fireEvent.click(screen.getByRole("button", { name: "Call again" }));
      expect(ringback.start).toHaveBeenCalledTimes(1);
      expect(call.start).toHaveBeenCalledTimes(1);
    });

    it("does not ring just because the panel is showing", () => {
      setSnapshot({ phase: "idle" });
      renderWithProviders(<DrivingCall />);
      expect(ringback.start).not.toHaveBeenCalled();
    });
  });

  describe("diagnostics", () => {
    it("are hidden unless ?debug=1 is in the address", () => {
      setSnapshot({ phase: "live" });
      renderWithProviders(<DrivingCall />);
      expect(screen.queryByText(/reply latency/)).toBeNull();
    });

    it("also show when the Settings toggle is on for this device, with no ?debug=1 in the address", async () => {
      window.history.pushState({}, "", "/driving");
      window.localStorage.setItem(CALL_DIAGNOSTICS_STORAGE_KEY, "1");
      setSnapshot({ phase: "live" });
      try {
        renderWithProviders(<DrivingCall />);
        expect(await screen.findByText(/reply latency 640 ms median/)).toBeTruthy();
      } finally {
        window.localStorage.clear();
      }
    });

    it("show the mic settings, reply latency and cache share with ?debug=1", async () => {
      window.history.pushState({}, "", "/driving?debug=1");
      setSnapshot({ phase: "live" });
      renderWithProviders(<DrivingCall />);
      expect(await screen.findByText(/reply latency 640 ms median \(3 samples, last 640 ms\)/)).toBeTruthy();
      expect(screen.getByText(/mic 48000 Hz · echo true · noise true · agc true/)).toBeTruthy();
      expect(screen.getByText(/tokens in 2000 \(cached 75%\) · out 100/)).toBeTruthy();
    });
  });
});
