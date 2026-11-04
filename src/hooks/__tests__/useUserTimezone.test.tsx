import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const settings = vi.hoisted(() => ({ value: undefined as { timezone: string } | undefined }));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value }),
}));

import { useUserTimezone } from "../useUserTimezone";

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
