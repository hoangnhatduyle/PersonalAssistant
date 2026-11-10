import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CallSnapshot } from "@/lib/voice/realtime/call-controller";

// The real AssistantResponse pulls in citation chips; the screen only needs to hand it the line.
vi.mock("@/components/assistant/AssistantResponse", () => ({
  AssistantResponse: ({ message }: { message: string }) => <p data-testid="assistant-line">{message}</p>,
}));

import { CallScreen, formatClock, TODAY_PROMPT } from "../CallScreen";

const baseSnapshot: CallSnapshot = {
  phase: "live",
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

const handlers = {
  onEnd: vi.fn(),
  onMuteChange: vi.fn(),
  onAsk: vi.fn(),
  onDecision: vi.fn(),
};

function renderScreen(patch: Partial<CallSnapshot> = {}, props: { isDeciding?: boolean; diagnostics?: React.ReactNode; onMinimize?: () => void; showScreenLockHint?: boolean } = {}) {
  return render(<CallScreen snapshot={{ ...baseSnapshot, ...patch }} isDeciding={false} {...handlers} {...props} />);
}

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("CallScreen", () => {
  beforeEach(() => {
    Object.values(handlers).forEach((handler) => handler.mockClear());
  });

  it("is a full-screen dialog named for the call", () => {
    renderScreen();
    expect(screen.getByRole("dialog", { name: "Call with Cadence" })).toBeTruthy();
    expect(screen.getByText("Cadence")).toBeTruthy();
  });

  describe("while calling", () => {
    beforeEach(() => renderScreen({ phase: "connecting", debug: { ...baseSnapshot.debug, wakeLockActive: false } }));

    it("says it is calling and keeps the controls off until the call connects", () => {
      expect(screen.getByText("Calling…")).toBeTruthy();
      expect(button("Mute").disabled).toBe(true);
      expect(button("Captions").disabled).toBe(true);
      expect(button("Today").disabled).toBe(true);
    });

    it("lets the user hang up at once", () => {
      expect(button("End call").disabled).toBe(false);
      fireEvent.click(button("End call"));
      expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    });

    it("tells the user to keep the screen on, without a warning, even though the wake lock is not held yet", () => {
      expect(screen.getByText("Screen stays on during the call")).toBeTruthy();
      expect(screen.queryByText(/Screen may lock/)).toBeNull();
    });
  });

  describe("the clock", () => {
    it("counts up and does not mention a limit for most of the call", () => {
      renderScreen({ maxSeconds: 600, secondsLeft: 425 });
      expect(screen.getByText("2:55")).toBeTruthy();
      expect(screen.queryByText(/left/)).toBeNull();
    });

    it("shows what is left only in the last minute", () => {
      renderScreen({ maxSeconds: 600, secondsLeft: 58 });
      expect(screen.getByText("9:02 · 0:58 left")).toBeTruthy();
    });

    it("does not show a countdown on a call too short to need one", () => {
      renderScreen({ maxSeconds: 45, secondsLeft: 30 });
      expect(screen.queryByText(/left/)).toBeNull();
    });
  });

  describe("keeping the screen awake", () => {
    it("shows the plain hint while the wake lock is held", () => {
      renderScreen({ debug: { ...baseSnapshot.debug, wakeLockActive: true } });
      expect(screen.getByText("Screen stays on during the call")).toBeTruthy();
    });

    it("warns, once the call is live, when the browser did not grant the wake lock", () => {
      renderScreen({ debug: { ...baseSnapshot.debug, wakeLockActive: false } });
      expect(screen.getByText("Screen may lock. Keep it awake or the call ends.")).toBeTruthy();
      expect(screen.queryByText("Screen stays on during the call")).toBeNull();
    });
  });

  describe("on a desktop", () => {
    it("hides the screen-lock note, which only a phone needs", () => {
      renderScreen({}, { showScreenLockHint: false });
      expect(screen.queryByText("Screen stays on during the call")).toBeNull();
      renderScreen({ debug: { ...baseSnapshot.debug, wakeLockActive: false } }, { showScreenLockHint: false });
      expect(screen.queryByText("Screen may lock. Keep it awake or the call ends.")).toBeNull();
    });
  });

  describe("minimizing", () => {
    it("has no minimize button unless the page can bring the call back", () => {
      renderScreen();
      expect(screen.queryByRole("button", { name: "Minimize call" })).toBeNull();
    });

    it("minimizes without ending the call", () => {
      const onMinimize = vi.fn();
      renderScreen({}, { onMinimize });
      fireEvent.click(button("Minimize call"));
      expect(onMinimize).toHaveBeenCalledTimes(1);
      expect(handlers.onEnd).not.toHaveBeenCalled();
    });
  });

  describe("formatClock", () => {
    it("formats seconds as m:ss", () => {
      expect(formatClock(0)).toBe("0:00");
      expect(formatClock(65)).toBe("1:05");
      expect(formatClock(600)).toBe("10:00");
    });
  });

  describe("who is talking", () => {
    it.each([
      ["listening", "Listening…"],
      ["thinking", "Thinking…"],
      ["speaking", "Speaking…"],
    ] as const)("says %s", (activity, label) => {
      renderScreen({ activity });
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  describe("mute", () => {
    it("mutes from the button", () => {
      renderScreen();
      fireEvent.click(button("Mute"));
      expect(handlers.onMuteChange).toHaveBeenCalledWith(true);
    });

    it("offers Unmute, shown as pressed, while muted", () => {
      renderScreen({ muted: true });
      expect(button("Unmute").getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(button("Unmute"));
      expect(handlers.onMuteChange).toHaveBeenCalledWith(false);
    });
  });

  describe("captions", () => {
    const lines = { userLine: "what's due today", assistantLine: "You have two things due." };

    it("are off until asked for, so the call is not a wall of text", () => {
      renderScreen(lines);
      expect(screen.queryByText("what's due today")).toBeNull();
      expect(screen.queryByTestId("assistant-line")).toBeNull();
      expect(button("Captions").getAttribute("aria-pressed")).toBe("false");
    });

    it("show the latest words from both sides once switched on, and hide again when switched off", () => {
      renderScreen(lines);
      fireEvent.click(button("Captions"));
      expect(screen.getByText("what's due today")).toBeTruthy();
      expect(screen.getByTestId("assistant-line").textContent).toBe("You have two things due.");
      expect(button("Captions").getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(button("Captions"));
      expect(screen.queryByTestId("assistant-line")).toBeNull();
    });
  });

  describe("Today", () => {
    it("asks the assistant what is on today", () => {
      renderScreen();
      fireEvent.click(button("Today"));
      expect(handlers.onAsk).toHaveBeenCalledWith(TODAY_PROMPT);
      expect(TODAY_PROMPT).toBe("What's on my plate today?");
    });

    it.each(["thinking", "speaking"] as const)("is unavailable while the assistant is %s", (activity) => {
      renderScreen({ activity });
      expect(button("Today").disabled).toBe(true);
    });
  });

  describe("a pending change", () => {
    const pending = { sessionId: "s-1", summary: "Delete the task Pay rent", requiresTap: false };

    it("shows the change with Confirm and Cancel, and says a spoken yes or no works too", () => {
      renderScreen({ pending });
      const sheet = screen.getByRole("group", { name: "Pending change" });
      expect(within(sheet).getByText("Delete the task Pay rent")).toBeTruthy();
      expect(within(sheet).getByText(/Say yes or no, or tap a button/)).toBeTruthy();
    });

    it("reports a tap on Confirm or Cancel", () => {
      renderScreen({ pending });
      fireEvent.click(button("Confirm"));
      expect(handlers.onDecision).toHaveBeenLastCalledWith("executed");
      fireEvent.click(button("Cancel"));
      expect(handlers.onDecision).toHaveBeenLastCalledWith("declined");
    });

    it("explains that a tap-only change needs the button", () => {
      renderScreen({ pending: { ...pending, requiresTap: true } });
      expect(screen.getByText("This one needs you to tap Confirm.")).toBeTruthy();
    });

    it("locks both buttons while a tap is being carried out", () => {
      renderScreen({ pending }, { isDeciding: true });
      expect(button("Confirm").disabled).toBe(true);
      expect(button("Cancel").disabled).toBe(true);
    });

    it("shows no sheet when nothing is pending", () => {
      renderScreen();
      expect(screen.queryByRole("group", { name: "Pending change" })).toBeNull();
    });
  });

  it("renders the diagnostics it is given", () => {
    renderScreen({}, { diagnostics: <p>reply latency 640 ms median</p> });
    expect(screen.getByText("reply latency 640 ms median")).toBeTruthy();
  });

  it("disables hang-up only once the call is already ending", () => {
    renderScreen({ phase: "ending" });
    expect(button("End call").disabled).toBe(true);
  });
});
