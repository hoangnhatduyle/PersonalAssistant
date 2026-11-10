import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProgressField } from "../ProgressField";

function setup(overrides: Partial<Parameters<typeof ProgressField>[0]> = {}) {
  const onPercentChange = vi.fn();
  const onNoteChange = vi.fn();
  render(
    <ProgressField
      idPrefix="p"
      percent={null}
      note={null}
      onPercentChange={onPercentChange}
      onNoteChange={onNoteChange}
      {...overrides}
    />,
  );
  return { onPercentChange, onNoteChange };
}

describe("ProgressField", () => {
  it("says so when nothing is set and no automatic value exists", () => {
    setup();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use automatic/i })).not.toBeInTheDocument();
  });

  it("shows the automatic value and its explanation while no value is set by hand", () => {
    setup({ autoPercent: 60, autoHint: "3 of 5 checklist items done" });
    expect(screen.getByText("Auto 60%")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 checklist items done")).toBeInTheDocument();
  });

  it("shows the hand-set value and offers to go back to automatic", () => {
    const { onPercentChange } = setup({ percent: 40, autoPercent: 60 });
    expect(screen.getByText("40%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /use automatic/i }));
    expect(onPercentChange).toHaveBeenCalledWith(null);
  });

  it("quick-set buttons commit exactly that value, including 0", () => {
    const { onPercentChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "0%" }));
    expect(onPercentChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "75%" }));
    expect(onPercentChange).toHaveBeenLastCalledWith(75);
  });

  it("marks the quick-set button matching the current value as pressed", () => {
    setup({ percent: 50 });
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "25%" })).toHaveAttribute("aria-pressed", "false");
  });

  it("dragging the slider commits a hand-set value", () => {
    const { onPercentChange } = setup({ percent: null, autoPercent: 20 });
    fireEvent.change(screen.getByRole("slider", { name: /progress/i }), { target: { value: "35" } });
    expect(onPercentChange).toHaveBeenCalledWith(35);
  });

  it("reports the note, turning a blank note into null", () => {
    const { onNoteChange } = setup({ note: "outline done" });
    const box = screen.getByLabelText(/progress note/i);
    expect(box).toHaveValue("outline done");
    fireEvent.change(box, { target: { value: "draft in review" } });
    expect(onNoteChange).toHaveBeenLastCalledWith("draft in review");
    fireEvent.change(box, { target: { value: "" } });
    expect(onNoteChange).toHaveBeenLastCalledWith(null);
  });

  it("disables every control when disabled", () => {
    setup({ percent: 10, disabled: true });
    expect(screen.getByRole("slider", { name: /progress/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "25%" })).toBeDisabled();
    expect(screen.getByLabelText(/progress note/i)).toBeDisabled();
  });
});
