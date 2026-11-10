import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const inCall = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/assistant/RealtimeCallProvider", () => ({ useIsInCall: () => inCall.value }));
// The capture UI has its own tests; here it is a marker that the dialog is open.
vi.mock("@/components/assistant/CaptureChannel", () => ({
  CaptureChannel: () => <p>capture channel</p>,
  MicIcon: () => <svg aria-hidden="true" />,
}));

const { CaptureQuickAction } = await import("../CaptureQuickAction");

describe("CaptureQuickAction", () => {
  beforeEach(() => {
    inCall.value = false;
  });

  it("opens quick capture from the mic button", () => {
    render(<CaptureQuickAction />);
    expect(screen.queryByText("capture channel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open quick capture" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("capture channel")).toBeTruthy();
  });

  it("is disabled, and says why, during a call", () => {
    inCall.value = true;
    render(<CaptureQuickAction />);
    const button = screen.getByRole("button", { name: "Open quick capture" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Unavailable during a call");
  });

  it("closes quick capture if a call starts while it is open", () => {
    const view = render(<CaptureQuickAction />);
    fireEvent.click(screen.getByRole("button", { name: "Open quick capture" }));
    expect(screen.getByText("capture channel")).toBeTruthy();

    inCall.value = true;
    view.rerender(<CaptureQuickAction />);
    expect(screen.queryByText("capture channel")).toBeNull();
  });
});
