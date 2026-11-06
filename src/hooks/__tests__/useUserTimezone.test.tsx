import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const settings = vi.hoisted(() => ({ value: undefined as { timezone: string } | undefined, isPending: false, fetchStatus: "idle" as "idle" | "fetching" | "paused" }));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value, isPending: settings.isPending, fetchStatus: settings.fetchStatus }),
}));

import { useUserTimezone, useUserTimezoneReady } from "../useUserTimezone";

describe("useUserTimezone", () => {
  beforeEach(() => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ timeZone: "Asia/Tokyo" } as Intl.ResolvedDateTimeFormatOptions);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the time zone saved on the profile", () => {
    settings.value = { timezone: "America/Detroit" };
    const { result } = renderHook(() => useUserTimezone());
    expect(result.current).toBe("America/Detroit");
  });

  it("falls back to the device zone until settings have loaded", () => {
    settings.value = undefined;
    const { result } = renderHook(() => useUserTimezone());
    expect(result.current).toBe("Asia/Tokyo");
  });
});

describe("useUserTimezoneReady", () => {
  it("is false while the settings request is still pending, so callers can hold off using the device-zone fallback", () => {
    settings.value = undefined;
    settings.isPending = true;
    const { result } = renderHook(() => useUserTimezoneReady());
    expect(result.current).toBe(false);
  });

  it("is true while the request is paused offline, so the fields don't stay locked without a network", () => {
    settings.value = undefined;
    settings.isPending = true;
    settings.fetchStatus = "paused";
    const { result } = renderHook(() => useUserTimezoneReady());
    expect(result.current).toBe(true);
    settings.fetchStatus = "idle";
  });

  it("is true once settings have loaded", () => {
    settings.value = { timezone: "America/Detroit" };
    settings.isPending = false;
    const { result } = renderHook(() => useUserTimezoneReady());
    expect(result.current).toBe(true);
  });

  it("is true when the settings request failed, falling back to the device zone instead of blocking forever", () => {
    settings.value = undefined;
    settings.isPending = false;
    const { result } = renderHook(() => useUserTimezoneReady());
    expect(result.current).toBe(true);
  });
});
