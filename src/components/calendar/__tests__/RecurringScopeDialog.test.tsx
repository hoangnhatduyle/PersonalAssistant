import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecurringScopeDialog } from "@/components/calendar/RecurringScopeDialog";

const setup = (title: string | null = "First Solar") => {
  const handlers = { onThis: vi.fn(), onAll: vi.fn(), onCancel: vi.fn() };
  render(<RecurringScopeDialog title={title} {...handlers} />);
  return handlers;
};

describe("RecurringScopeDialog", () => {
  it("renders nothing without a title", () => {
    setup(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the event and offers This occurrence, All occurrences and Cancel", () => {
    setup();
    expect(screen.getByText("First Solar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This occurrence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All occurrences" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("routes each button to its own handler", () => {
    const { onThis, onAll, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "This occurrence" }));
    expect([onThis.mock.calls.length, onAll.mock.calls.length, onCancel.mock.calls.length]).toEqual([1, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: "All occurrences" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect([onThis.mock.calls.length, onAll.mock.calls.length, onCancel.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it("Escape cancels", () => {
    const { onCancel, onThis, onAll } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onThis).not.toHaveBeenCalled();
    expect(onAll).not.toHaveBeenCalled();
  });
});
