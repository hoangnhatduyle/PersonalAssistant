import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { UsePushSubscription } from "@/hooks/usePushSubscription";

const settings = vi.hoisted(() => ({ value: { email_reminders_enabled: true } as Record<string, unknown> }));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSettings: () => ({ mutateAsync, isPending: false }),
}));
const push: UsePushSubscription = { status: "off", busy: false, enable: vi.fn(), disable: vi.fn(), sendTest: vi.fn() };
vi.mock("@/hooks/usePushSubscription", () => ({ usePushSubscription: () => push }));

import { ReminderNotificationsCard } from "../ReminderNotificationsCard";

describe("ReminderNotificationsCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({});
    vi.mocked(push.enable).mockReset().mockResolvedValue(undefined);
    settings.value = { email_reminders_enabled: true };
    Object.assign(push, { status: "off", busy: false });
  });

  it("is a single card holding both the email and the push choice", () => {
    renderWithProviders(<ReminderNotificationsCard />);
    expect(screen.getAllByText("Reminder notifications")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /email reminders enabled/i })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /push notifications enabled on this device/i })).toBeTruthy();
  });

  it("shows email on by default and saves the change", async () => {
    renderWithProviders(<ReminderNotificationsCard />);
    const email = screen.getByRole("checkbox", { name: /email reminders enabled/i }) as HTMLInputElement;
    expect(email.checked).toBe(true);
    fireEvent.click(email);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ email_reminders_enabled: false }));
  });

  it("enables push for this device from its own checkbox", async () => {
    renderWithProviders(<ReminderNotificationsCard />);
    fireEvent.click(screen.getByRole("checkbox", { name: /push notifications enabled on this device/i }));
    await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("still lets email be changed when push is unavailable on this device", () => {
    Object.assign(push, { status: "not-installed" });
    renderWithProviders(<ReminderNotificationsCard />);
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /email reminders enabled/i })).toBeTruthy();
  });
});
