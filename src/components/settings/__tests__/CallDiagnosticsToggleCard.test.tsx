import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { CALL_DIAGNOSTICS_STORAGE_KEY } from "@/hooks/useCallDiagnostics";
import { CallDiagnosticsToggleCard } from "../CallDiagnosticsToggleCard";

describe("CallDiagnosticsToggleCard", () => {
  afterEach(() => window.localStorage.clear());

  it("starts unchecked and turns the call diagnostics on for this device", () => {
    renderWithProviders(<CallDiagnosticsToggleCard />);
    const checkbox = screen.getByRole("checkbox", { name: /call diagnostics/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    expect(checkbox.checked).toBe(true);
    expect(window.localStorage.getItem(CALL_DIAGNOSTICS_STORAGE_KEY)).toBe("1");
  });

  it("shows as checked when the device already has it on, and turns it off again", () => {
    window.localStorage.setItem(CALL_DIAGNOSTICS_STORAGE_KEY, "1");
    renderWithProviders(<CallDiagnosticsToggleCard />);
    const checkbox = screen.getByRole("checkbox", { name: /call diagnostics/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect(checkbox.checked).toBe(false);
    expect(window.localStorage.getItem(CALL_DIAGNOSTICS_STORAGE_KEY)).toBeNull();
  });
});
