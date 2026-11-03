import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { UsePushSubscription } from "@/hooks/usePushSubscription";

const hookState: UsePushSubscription = {
  status: "off",
  busy: false,
  enable: vi.fn(),
  disable: vi.fn(),
  sendTest: vi.fn(),
};
vi.mock("@/hooks/usePushSubscription", () => ({ usePushSubscription: () => hookState }));

const { PushNotificationsCard } = await import("../PushNotificationsCard");

const setState = (overrides: Partial<UsePushSubscription>) => Object.assign(hookState, { status: "off", busy: false }, overrides);

describe("PushNotificationsCard", () => {
  beforeEach(() => {
    vi.mocked(hookState.enable).mockReset().mockResolvedValue(undefined);
    vi.mocked(hookState.disable).mockReset().mockResolvedValue(undefined);
    vi.mocked(hookState.sendTest).mockReset();
  });

  it("shows a loading placeholder, not a checkbox, while the state is unknown", () => {
    setState({ status: "loading" });
    renderWithProviders(<PushNotificationsCard />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("enables notifications from the checkbox, which is the click that carries the permission prompt", async () => {
    setState({ status: "off" });
    renderWithProviders(<PushNotificationsCard />);
    const checkbox = screen.getByRole("checkbox", { name: /enabled on this device/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByRole("button", { name: /test notification/i })).toBeNull();
    fireEvent.click(checkbox);
    await waitFor(() => expect(hookState.enable).toHaveBeenCalledTimes(1));
    expect(hookState.disable).not.toHaveBeenCalled();
  });

  it("disables from the checked box and offers a test button only while on", async () => {
    setState({ status: "on" });
    renderWithProviders(<PushNotificationsCard />);
    const checkbox = screen.getByRole("checkbox", { name: /enabled on this device/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByRole("button", { name: /send test notification/i })).toBeTruthy();
    fireEvent.click(checkbox);
    await waitFor(() => expect(hookState.disable).toHaveBeenCalledTimes(1));
  });

  it("sends a test and reports success", async () => {
    setState({ status: "on" });
    vi.mocked(hookState.sendTest).mockResolvedValue({ delivered: 1, removed: 0, failureReason: null });
    renderWithProviders(<PushNotificationsCard />);
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));
    expect(await screen.findByText("Test notification sent")).toBeTruthy();
  });

  it("surfaces the server's failure reason when the test could not be delivered", async () => {
    setState({ status: "on" });
    vi.mocked(hookState.sendTest).mockResolvedValue({ delivered: 0, removed: 0, failureReason: "Missing required environment variable: VAPID_PRIVATE_KEY" });
    renderWithProviders(<PushNotificationsCard />);
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));
    expect(await screen.findByText(/VAPID_PRIVATE_KEY/)).toBeTruthy();
  });

  it("shows an error toast instead of crashing when enabling throws", async () => {
    setState({ status: "off" });
    vi.mocked(hookState.enable).mockRejectedValue(new Error("409"));
    renderWithProviders(<PushNotificationsCard />);
    fireEvent.click(screen.getByRole("checkbox", { name: /enabled on this device/i }));
    expect(await screen.findByText("Could not change notifications for this device")).toBeTruthy();
  });

  it.each([
    ["not-installed", /Add to Home Screen/],
    ["denied", /blocked for Cadence/],
    ["unconfigured", /VAPID public key/],
    ["unsupported", /doesn't support push/],
  ] as const)("explains the %s state instead of offering a toggle", (status, copy) => {
    setState({ status });
    renderWithProviders(<PushNotificationsCard />);
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("locks the controls while a request is in flight", () => {
    setState({ status: "on", busy: true });
    renderWithProviders(<PushNotificationsCard />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /send test notification/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
