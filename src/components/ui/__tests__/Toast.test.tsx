import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function Trigger({ onUndo }: { onUndo: () => void }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast("Skipped Class", "info", { label: "Undo", onClick: onUndo })}>go</button>;
}

describe("Toast action", () => {
  it("runs the action once and dismisses the toast", () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    act(() => fireEvent.click(screen.getByText("go")));
    expect(screen.getByText("Skipped Class")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Skipped Class")).not.toBeInTheDocument();
  });
});
