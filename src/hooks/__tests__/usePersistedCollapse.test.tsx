import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { resetPersistedCollapseMemory, usePersistedCollapse } from "@/hooks/usePersistedCollapse";

beforeEach(() => {
  localStorage.clear();
  resetPersistedCollapseMemory();
});

describe("usePersistedCollapse", () => {
  it("starts expanded and toggles", () => {
    const { result } = renderHook(() => usePersistedCollapse("k"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it("restores a stored collapsed state", () => {
    localStorage.setItem("k", "1");
    const { result } = renderHook(() => usePersistedCollapse("k"));
    expect(result.current[0]).toBe(true);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => usePersistedCollapse("k"));
    act(() => result.current[1]());
    expect(localStorage.getItem("k")).toBe("1");
  });

  it("keeps two consumers of the same key in sync", () => {
    const a = renderHook(() => usePersistedCollapse("k"));
    const b = renderHook(() => usePersistedCollapse("k"));
    act(() => a.result.current[1]());
    expect(b.result.current[0]).toBe(true);
  });
});
