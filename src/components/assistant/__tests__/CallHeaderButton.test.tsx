import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CallSnapshot } from "@/lib/voice/realtime/call-controller";
import type { CallContextValue } from "@/components/assistant/RealtimeCallProvider";

const baseSnapshot: CallSnapshot = {
  phase: "idle",
  activity: "listening",
  muted: false,
  maxSeconds: 600,
  secondsLeft: 600,
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
    micSettings: null,
    wakeLockActive: true,
    responseLatenciesMs: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  },
};

const call: CallContextValue = {
  snapshot: baseSnapshot,
  start: vi.fn(),
  end: vi.fn(),
  setMuted: vi.fn(),
  sendText: vi.fn(),
  reportScreenDecision: vi.fn(),
  inCall: false,
  minimized: false,
  setMinimized: vi.fn(),
};
const setCall = (patch: Omit<Partial<CallContextValue>, "snapshot"> & { snapshot?: Partial<CallSnapshot> }) => {
  Object.assign(call, { inCall: false, minimized: false, ...patch, snapshot: { ...baseSnapshot, ...patch.snapshot } });
};

vi.mock("@/components/assistant/RealtimeCallProvider", () => ({ useCall: () => call }));

const { CallHeaderButton } = await import("../CallHeaderButton");

describe("CallHeaderButton", () => {
  beforeEach(() => {
    vi.mocked(call.start).mockClear();
    vi.mocked(call.setMinimized).mockClear();
    setCall({});
  });

  describe("with no call", () => {
    it("is a phone button that starts a call from the click itself", () => {
      render(<CallHeaderButton />);
      fireEvent.click(screen.getByRole("button", { name: "Call the assistant" }));
      expect(call.start).toHaveBeenCalledTimes(1);
    });

    it("offers a new call after one has ended", () => {
      setCall({ snapshot: { phase: "ended", endReason: "user" } });
      render(<CallHeaderButton />);
      expect(screen.getByRole("button", { name: "Call the assistant" })).toBeTruthy();
    });
  });

  describe("during a call", () => {
    it("shows the running clock instead of the phone icon", () => {
      setCall({ inCall: true, snapshot: { phase: "live", maxSeconds: 600, secondsLeft: 535 } });
      render(<CallHeaderButton />);
      expect(screen.queryByRole("button", { name: "Call the assistant" })).toBeNull();
      expect(screen.getByText("1:05")).toBeTruthy();
    });

    it("says it is calling while connecting, and ending while hanging up", () => {
      setCall({ inCall: true, snapshot: { phase: "connecting" } });
      const view = render(<CallHeaderButton />);
      expect(screen.getByText("Calling…")).toBeTruthy();
      setCall({ inCall: true, snapshot: { phase: "ending" } });
      view.rerender(<CallHeaderButton />);
      expect(screen.getByText("Ending…")).toBeTruthy();
    });

    it("minimizes the full-screen call when it is showing", () => {
      setCall({ inCall: true, minimized: false, snapshot: { phase: "live" } });
      render(<CallHeaderButton />);
      fireEvent.click(screen.getByRole("button", { name: "Call in progress, minimize" }));
      expect(call.setMinimized).toHaveBeenCalledWith(true);
    });

    it("brings the call back when it is minimized", () => {
      setCall({ inCall: true, minimized: true, snapshot: { phase: "live" } });
      render(<CallHeaderButton />);
      fireEvent.click(screen.getByRole("button", { name: "Show the call" }));
      expect(call.setMinimized).toHaveBeenCalledWith(false);
    });

    it("flags a change waiting for the user's confirmation", () => {
      setCall({ inCall: true, minimized: true, snapshot: { phase: "live", pending: { sessionId: "s-1", summary: "Delete the task?", requiresTap: false } } });
      render(<CallHeaderButton />);
      expect(screen.getByText("Confirm")).toBeTruthy();
    });

    it("shows no confirm badge when nothing is pending", () => {
      setCall({ inCall: true, minimized: true, snapshot: { phase: "live" } });
      render(<CallHeaderButton />);
      expect(screen.queryByText("Confirm")).toBeNull();
    });
  });
});
