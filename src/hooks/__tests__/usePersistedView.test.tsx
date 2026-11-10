import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { resetPersistedViewMemory, usePersistedView } from "@/hooks/usePersistedView";

const VIEWS = ["list", "gantt"] as const;

beforeEach(() => {
  localStorage.clear();
  resetPersistedViewMemory();
});

describe("usePersistedView", () => {
  it("starts on the first (default) view", () => {
    const { result } = renderHook(() => usePersistedView("k", VIEWS));
    expect(result.current[0]).toBe("list");
  });

  it("switches views and remembers the choice in localStorage", () => {
    const { result } = renderHook(() => usePersistedView("k", VIEWS));
    act(() => result.current[1]("gantt"));
    expect(result.current[0]).toBe("gantt");
    expect(localStorage.getItem("k")).toBe("gantt");
  });

  it("restores a stored view", () => {
    localStorage.setItem("k", "gantt");
    const { result } = renderHook(() => usePersistedView("k", VIEWS));
    expect(result.current[0]).toBe("gantt");
  });

  it("falls back to the default for a stored value that is not a known view", () => {
    localStorage.setItem("k", "calendar");
    const { result } = renderHook(() => usePersistedView("k", VIEWS));
    expect(result.current[0]).toBe("list");
  });

  it("keeps two consumers of the same key in sync", () => {
    const a = renderHook(() => usePersistedView("k", VIEWS));
    const b = renderHook(() => usePersistedView("k", VIEWS));
    act(() => a.result.current[1]("gantt"));
    expect(b.result.current[0]).toBe("gantt");
  });

  it("still switches when localStorage throws", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      const { result } = renderHook(() => usePersistedView("k", VIEWS));
      act(() => result.current[1]("gantt"));
      expect(result.current[0]).toBe("gantt");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
