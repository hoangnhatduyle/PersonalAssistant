import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { FormField } from "@/components/ui/FormField";

const zone = vi.hoisted(() => ({ ready: true }));
vi.mock("@/hooks/useUserTimezone", () => ({
  useUserTimezone: () => "America/Detroit",
  useUserTimezoneReady: () => zone.ready,
}));

// 11:59 PM on Nov 10 in Detroit (EST, UTC-5).
const NOV_10_END_OF_DAY = "2026-11-11T04:59:00.000Z";

function Controlled({
  initial = null,
  onValue,
  defaultTime,
}: {
  initial?: string | null;
  onValue?: (v: string | null) => void;
  defaultTime?: string;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <FormField label="Due" htmlFor="due_at">
      <DateTimeField
        id="due_at"
        value={value}
        defaultTime={defaultTime}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </FormField>
  );
}

describe("DateTimeField", () => {
  it("keeps both inputs disabled until the profile time zone is known, so nothing is built in the device-zone fallback", () => {
    zone.ready = false;
    try {
      render(<Controlled initial={NOV_10_END_OF_DAY} />);
      expect(screen.getByLabelText("Due")).toBeDisabled();
      expect(screen.getByLabelText("Time")).toBeDisabled();
    } finally {
      zone.ready = true;
    }
  });

  it("shows the instant as the date and time it reads in the profile time zone", () => {
    render(<Controlled initial={NOV_10_END_OF_DAY} />);
    expect(screen.getByLabelText("Due")).toHaveValue("11/10/2026");
    expect(screen.getByLabelText("Time")).toHaveValue("23:59");
  });

  it("is empty for a null value, with the time input disabled until a date is chosen", () => {
    render(<Controlled />);
    expect(screen.getByLabelText("Due")).toHaveValue("");
    expect(screen.getByLabelText("Time")).toBeDisabled();
  });

  it("emits the UTC instant for a typed date, using the default time when none was set", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-11-10" } });
    // 09:00 default, EST (UTC-5) -> 14:00Z.
    expect(onValue).toHaveBeenLastCalledWith("2026-11-10T14:00:00.000Z");
  });

  it("honours a custom defaultTime", () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} defaultTime="23:59" />);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-11-10" } });
    expect(onValue).toHaveBeenLastCalledWith(NOV_10_END_OF_DAY);
  });

  it("keeps the time of day when only the date changes", () => {
    const onValue = vi.fn();
    render(<Controlled initial={NOV_10_END_OF_DAY} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-11-12" } });
    expect(onValue).toHaveBeenLastCalledWith("2026-11-13T04:59:00.000Z");
  });

  it("keeps the date when only the time changes", () => {
    const onValue = vi.fn();
    render(<Controlled initial={NOV_10_END_OF_DAY} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:30" } });
    expect(onValue).toHaveBeenLastCalledWith("2026-11-10T13:30:00.000Z");
  });

  it("remembers the time of day when the date text is cleared and retyped", () => {
    const onValue = vi.fn();
    render(<Controlled initial={NOV_10_END_OF_DAY} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
    expect(onValue).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-11-12" } });
    // Still 11:59 PM Detroit (04:59Z next day), not the 09:00 default.
    expect(onValue).toHaveBeenLastCalledWith("2026-11-13T04:59:00.000Z");
  });

  it("gives the date input an accessible name when one is passed", () => {
    render(<DateTimeField value={null} onChange={() => {}} ariaLabel="Snooze until" />);
    expect(screen.getByLabelText("Snooze until")).toBeInTheDocument();
  });

  it("emits null when the date is cleared", () => {
    const onValue = vi.fn();
    render(<Controlled initial={NOV_10_END_OF_DAY} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("does not emit when the time is momentarily emptied mid-edit", () => {
    const onValue = vi.fn();
    render(<Controlled initial={NOV_10_END_OF_DAY} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "" } });
    expect(onValue).not.toHaveBeenCalled();
  });
});
