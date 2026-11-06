import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormField } from "@/components/ui/FormField";

vi.mock("@/hooks/useUserTimezone", () => ({
  useUserTimezone: () => "America/Detroit",
}));

// 03:30 UTC on Nov 6 is still the evening of Nov 5 in Detroit — proves "Today" uses the profile zone, not UTC.
const NOW = new Date("2026-11-06T03:30:00Z");

function Controlled({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <FormField label="Due date" htmlFor="due">
      <DatePicker
        id="due"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </FormField>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("DatePicker text entry", () => {
  it("is labelled by its form field and shows the value as M/D/YYYY", () => {
    render(<Controlled initial="2026-11-10" />);
    expect(screen.getByLabelText("Due date")).toHaveValue("11/10/2026");
  });

  it("emits a date key as soon as a complete ISO date is typed", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2030-06-01" } });
    expect(onValue).toHaveBeenLastCalledWith("2030-06-01");
  });

  it("accepts US-style M/D/YYYY", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "6/1/2030" } });
    expect(onValue).toHaveBeenLastCalledWith("2030-06-01");
  });

  it("does not emit while the text is still an incomplete date", () => {
    const onValue = vi.fn();
    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "6/1/20" } });
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Due date")).toHaveValue("6/1/20");
  });

  it("emits an empty string when the field is cleared", () => {
    const onValue = vi.fn();
    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "" } });
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("flags unparseable text as invalid and reverts to the last good value on blur", () => {
    render(<Controlled initial="2026-11-10" />);
    const input = screen.getByLabelText("Due date");
    fireEvent.change(input, { target: { value: "garbage" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(input);
    expect(input).toHaveValue("11/10/2026");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("DatePicker calendar popover", () => {
  it("opens a calendar on the button, picks a day, emits it and closes", () => {
    const onValue = vi.fn();
    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));

    const dialog = screen.getByRole("dialog", { name: "Choose date" });
    fireEvent.click(within(dialog).getByRole("button", { name: /November 20th, 2026/ }));

    expect(onValue).toHaveBeenLastCalledWith("2026-11-20");
    expect(screen.queryByRole("dialog", { name: "Choose date" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toHaveValue("11/20/2026");
  });

  it("clicking the already-selected day keeps it and closes the calendar", () => {
    const onValue = vi.fn();
    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Choose date" })).getByRole("button", { name: /November 10th, 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith("2026-11-10");
    expect(screen.queryByRole("dialog", { name: "Choose date" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toHaveValue("11/10/2026");
  });

  it("opens on the month of the current value", () => {
    render(<Controlled initial="2027-02-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(within(screen.getByRole("dialog", { name: "Choose date" })).getByText(/February 2027/)).toBeInTheDocument();
  });

  it("closes on Escape without changing the value", () => {
    const onValue = vi.fn();
    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Choose date" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Choose date" })).not.toBeInTheDocument();
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Due date")).toHaveFocus();
  });

  it("Today / Tomorrow / Next week chips use today in the profile time zone", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);

    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onValue).toHaveBeenLastCalledWith("2026-11-05");

    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(onValue).toHaveBeenLastCalledWith("2026-11-06");

    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onValue).toHaveBeenLastCalledWith("2026-11-12");
  });

  it("offers Clear only when there is a value, and it empties the field", () => {
    const onValue = vi.fn();
    const { unmount } = render(<Controlled onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    unmount();

    render(<Controlled initial="2026-11-10" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onValue).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("disables both the text field and the calendar button when disabled", () => {
    render(<DatePicker id="d" value="" onChange={() => {}} disabled aria-label="Date" />);
    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open calendar" })).toBeDisabled();
  });
});
