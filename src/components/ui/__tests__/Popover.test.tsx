import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "@/components/ui/Dialog";
import { Popover } from "@/components/ui/Popover";

function Harness({ onPopoverClose = () => {} }: { onPopoverClose?: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)}>
        anchor
      </button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        label="Pick something"
        onClose={() => {
          onPopoverClose();
          setOpen(false);
        }}
      >
        <button type="button">inside</button>
      </Popover>
    </div>
  );
}

describe("Popover", () => {
  it("renders its content as a labelled dialog while open", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Pick something" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "inside" })).toBeInTheDocument();
  });

  it("renders nothing once closed", () => {
    render(<Harness />);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Pick something" })).not.toBeInTheDocument();
  });

  it("closes on a mousedown outside the panel and anchor", () => {
    const onClose = vi.fn();
    render(<Harness onPopoverClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a mousedown inside the panel or on the anchor (the anchor toggles it itself)", () => {
    const onClose = vi.fn();
    render(<Harness onPopoverClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "inside" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "anchor" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus to the anchor", () => {
    const onClose = vi.fn();
    render(<Harness onPopoverClose={onClose} />);
    const inside = screen.getByRole("button", { name: "inside" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "anchor" })).toHaveFocus();
  });

  it("Tab from the last control closes the popover and sends focus back to the anchor, not elsewhere in the page", () => {
    const onClose = vi.fn();
    render(<Harness onPopoverClose={onClose} />);
    const inside = screen.getByRole("button", { name: "inside" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Tab" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "anchor" })).toHaveFocus();
  });

  it("Shift+Tab from the first control does the same", () => {
    const onClose = vi.fn();
    render(<Harness onPopoverClose={onClose} />);
    const inside = screen.getByRole("button", { name: "inside" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Tab", shiftKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "anchor" })).toHaveFocus();
  });

  it("closes when focus moves to an element outside both the panel and the anchor", () => {
    const onClose = vi.fn();
    render(
      <>
        <Harness onPopoverClose={onClose} />
        <button type="button">elsewhere</button>
      </>,
    );
    screen.getByRole("button", { name: "inside" }).focus();
    screen.getByRole("button", { name: "elsewhere" }).focus();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape inside a Dialog closes only the popover, not the dialog", () => {
    const onDialogClose = vi.fn();
    const onPopoverClose = vi.fn();
    render(
      <Dialog open onClose={onDialogClose} title="Edit">
        <Harness onPopoverClose={onPopoverClose} />
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "inside" }), { key: "Escape" });
    expect(onPopoverClose).toHaveBeenCalledTimes(1);
    expect(onDialogClose).not.toHaveBeenCalled();

    // With the popover gone, Escape reaches the dialog as usual.
    fireEvent.keyDown(screen.getByRole("button", { name: "anchor" }), { key: "Escape" });
    expect(onDialogClose).toHaveBeenCalledTimes(1);
  });
});
