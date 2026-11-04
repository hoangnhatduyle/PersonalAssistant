import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

const settings = vi.hoisted(() => ({ value: { timezone: "America/Detroit" } as Record<string, unknown> | undefined }));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value, isLoading: settings.value === undefined, isError: false, refetch: vi.fn() }),
  useUpdateSettings: () => ({ mutateAsync, isPending: false }),
}));

import { TimeZoneCard } from "../TimeZoneCard";

const DEVICE_ZONE = "Asia/Tokyo";

describe("TimeZoneCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({});
    settings.value = { timezone: "America/Detroit" };
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ timeZone: DEVICE_ZONE } as Intl.ResolvedDateTimeFormatOptions);
  });

  it("shows the saved time zone as the selected option", () => {
    renderWithProviders(<TimeZoneCard />);
    expect((screen.getByLabelText(/time zone/i) as HTMLSelectElement).value).toBe("America/Detroit");
  });

  it("keeps a saved zone selectable even when this browser no longer lists it", () => {
    settings.value = { timezone: "Mars/Olympus_Mons" };
    renderWithProviders(<TimeZoneCard />);
    expect((screen.getByLabelText(/time zone/i) as HTMLSelectElement).value).toBe("Mars/Olympus_Mons");
  });

  it("saves the zone picked from the list", async () => {
    renderWithProviders(<TimeZoneCard />);
    fireEvent.change(screen.getByLabelText(/time zone/i), { target: { value: "Europe/London" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ timezone: "Europe/London" }));
  });

  it("offers the device's own zone in one tap and saves it", async () => {
    renderWithProviders(<TimeZoneCard />);
    fireEvent.click(screen.getByRole("button", { name: /use this device/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ timezone: DEVICE_ZONE }));
  });

  it("hides the device button when the device already matches the saved zone", () => {
    settings.value = { timezone: DEVICE_ZONE };
    renderWithProviders(<TimeZoneCard />);
    expect(screen.queryByRole("button", { name: /use this device/i })).toBeNull();
  });

  it("shows a placeholder, not a form, while settings load", () => {
    settings.value = undefined;
    renderWithProviders(<TimeZoneCard />);
    expect(screen.queryByLabelText(/time zone/i)).toBeNull();
  });
});
