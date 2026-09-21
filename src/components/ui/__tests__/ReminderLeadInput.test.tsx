import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReminderLeadInput } from "@/components/ui/ReminderLeadInput";

const amountField = () => screen.getByRole("spinbutton") as HTMLInputElement;
const unitField = () => screen.getByLabelText("Reminder lead time unit") as HTMLSelectElement;

describe("ReminderLeadInput", () => {
  it("opens a stored minute count in the largest whole unit", () => {
    render(<ReminderLeadInput id="lead" value={120} onChange={vi.fn()} />);
    expect(amountField().value).toBe("2");
    expect(unitField().value).toBe("hours");
  });

  it("defaults an uneven value to minutes", () => {
    render(<ReminderLeadInput id="lead" value={90} onChange={vi.fn()} />);
    expect(amountField().value).toBe("90");
    expect(unitField().value).toBe("minutes");
  });

  it("emits minutes when the amount changes", () => {
    const onChange = vi.fn();
    render(<ReminderLeadInput id="lead" value={30} onChange={onChange} />);
    fireEvent.change(amountField(), { target: { value: "45" } });
    expect(onChange).toHaveBeenLastCalledWith(45);
  });

  it("converts to minutes when the unit changes", () => {
    const onChange = vi.fn();
    render(<ReminderLeadInput id="lead" value={30} onChange={onChange} />);
    fireEvent.change(unitField(), { target: { value: "hours" } });
    expect(onChange).toHaveBeenLastCalledWith(1800);
    fireEvent.change(amountField(), { target: { value: "2" } });
    fireEvent.change(unitField(), { target: { value: "days" } });
    expect(onChange).toHaveBeenLastCalledWith(2880);
  });

  it("emits NaN for an emptied amount so the form validator can reject it", () => {
    const onChange = vi.fn();
    render(<ReminderLeadInput id="lead" value={30} onChange={onChange} />);
    fireEvent.change(amountField(), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(Number.NaN);
  });
});
