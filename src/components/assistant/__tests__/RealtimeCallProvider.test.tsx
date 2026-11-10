import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { CallSnapshot } from "@/lib/voice/realtime/call-controller";
import type { UseRealtimeCall } from "@/hooks/useRealtimeCall";

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

const call: UseRealtimeCall = { snapshot: baseSnapshot, start: vi.fn(), end: vi.fn(), setMuted: vi.fn(), sendText: vi.fn(), reportScreenDecision: vi.fn() };
const setSnapshot = (patch: Partial<CallSnapshot>) => {
  call.snapshot = { ...baseSnapshot, ...patch };
};
const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/hooks/useRealtimeCall", () => ({ useRealtimeCall: () => ({ ...call }) }));
vi.mock("@/lib/voice/ringback", () => ({ startRingback: () => () => undefined }));
vi.mock("@/hooks/useVoiceTurn", () => ({
  useConfirmVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/assistant/AssistantResponse", () => ({ AssistantResponse: () => null }));

const { RealtimeCallProvider, useCall, useIsInCall } = await import("../RealtimeCallProvider");

function Probe() {
  const { inCall, minimized, setMinimized, start } = useCall();
  return (
    <div>
      <p data-testid="state">{`inCall:${inCall} minimized:${minimized}`}</p>
      <button onClick={() => setMinimized(true)}>minimize</button>
      <button onClick={() => setMinimized(false)}>restore</button>
      <button onClick={start}>start</button>
    </div>
  );
}
const Page = () => (
  <RealtimeCallProvider>
    <Probe />
  </RealtimeCallProvider>
);

const screenDialog = () => screen.queryByRole("dialog", { name: "Call with Cadence" });

describe("RealtimeCallProvider", () => {
  beforeEach(() => {
    vi.mocked(call.start).mockClear();
    setSnapshot({});
    pathname.value = "/";
  });

  it("shows no call screen until a call begins", () => {
    renderWithProviders(<Page />);
    expect(screenDialog()).toBeNull();
    expect(screen.getByTestId("state")).toHaveTextContent("inCall:false minimized:false");
  });

  it("shows the full-screen call on any page once a call is on, and removes it when it ends", () => {
    setSnapshot({ phase: "live" });
    const view = renderWithProviders(<Page />);
    expect(screenDialog()).toBeTruthy();

    setSnapshot({ phase: "ended", endReason: "user" });
    view.rerender(<Page />);
    expect(screenDialog()).toBeNull();
  });

  it("minimizes the call screen without ending the call, and restores it", () => {
    setSnapshot({ phase: "live" });
    renderWithProviders(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize call" }));
    expect(screenDialog()).toBeNull();
    expect(screen.getByTestId("state")).toHaveTextContent("inCall:true minimized:true");
    expect(call.end).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "restore" }));
    expect(screenDialog()).toBeTruthy();
  });

  it("offers no minimize in Driving Mode, which has no header to bring the call back from", () => {
    pathname.value = "/driving";
    setSnapshot({ phase: "live" });
    renderWithProviders(<Page />);
    expect(screenDialog()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Minimize call" })).toBeNull();
  });

  it("starting a call shows the call screen even if it was minimized earlier", () => {
    setSnapshot({ phase: "live" });
    const view = renderWithProviders(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize call" }));
    setSnapshot({ phase: "ended", endReason: "user" });
    view.rerender(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "start" }));
    expect(call.start).toHaveBeenCalledTimes(1);
    setSnapshot({ phase: "connecting" });
    view.rerender(<Page />);
    expect(screenDialog()).toBeTruthy();
  });

  describe("when a call ends", () => {
    it("explains a time-limit end with a toast, since no panel is showing", () => {
      setSnapshot({ phase: "live" });
      const view = renderWithProviders(<Page />);
      setSnapshot({ phase: "ended", endReason: "cap" });
      view.rerender(<Page />);
      expect(screen.getByText("The call reached its time limit.")).toBeTruthy();
    });

    it("shows a failure such as the daily limit, instead of a generic ending", () => {
      setSnapshot({ phase: "connecting" });
      const view = renderWithProviders(<Page />);
      setSnapshot({ phase: "ended", endReason: "error", error: "You've used today's voice call time. It resets at midnight." });
      view.rerender(<Page />);
      expect(screen.getByText("You've used today's voice call time. It resets at midnight.")).toBeTruthy();
    });

    it("says nothing when the user hung up themselves", () => {
      setSnapshot({ phase: "live" });
      const view = renderWithProviders(<Page />);
      setSnapshot({ phase: "ended", endReason: "user" });
      view.rerender(<Page />);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("does not toast in Driving Mode, whose panel shows the reason inline", () => {
      pathname.value = "/driving";
      setSnapshot({ phase: "live" });
      const view = renderWithProviders(<Page />);
      setSnapshot({ phase: "ended", endReason: "cap" });
      view.rerender(<Page />);
      expect(screen.queryByText("The call reached its time limit.")).toBeNull();
    });
  });
});

describe("useIsInCall", () => {
  it("is false outside the provider, so components with their own tests need none", () => {
    function Lone() {
      return <p data-testid="lone">{String(useIsInCall())}</p>;
    }
    renderWithProviders(<Lone />);
    expect(screen.getByTestId("lone")).toHaveTextContent("false");
  });

  it("is true while a call is connecting, live or ending, and false otherwise", () => {
    function Lone() {
      return <p data-testid="lone">{String(useIsInCall())}</p>;
    }
    const wrapper = () => (
      <RealtimeCallProvider>
        <Lone />
      </RealtimeCallProvider>
    );
    const results: string[] = [];
    for (const phase of ["idle", "connecting", "live", "ending", "ended"] as const) {
      setSnapshot({ phase });
      const view = renderWithProviders(wrapper());
      results.push(screen.getByTestId("lone").textContent ?? "");
      act(() => view.unmount());
    }
    expect(results).toEqual(["false", "true", "true", "true", "false"]);
  });
});
