import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CALL_DIAGNOSTICS_STORAGE_KEY, useCallDiagnostics } from "../useCallDiagnostics";

describe("useCallDiagnostics", () => {
  afterEach(() => window.localStorage.clear());

  it("is off until someone turns it on", () => {
    const { result } = renderHook(() => useCallDiagnostics());
    expect(result.current[0]).toBe(false);
  });

  it("reads a value stored on an earlier visit", () => {
    window.localStorage.setItem(CALL_DIAGNOSTICS_STORAGE_KEY, "1");
    const { result } = renderHook(() => useCallDiagnostics());
    expect(result.current[0]).toBe(true);
  });

  it("persists the choice and tells every other user of the hook straight away", () => {
    const first = renderHook(() => useCallDiagnostics());
    const second = renderHook(() => useCallDiagnostics());

    act(() => first.result.current[1](true));

    expect(window.localStorage.getItem(CALL_DIAGNOSTICS_STORAGE_KEY)).toBe("1");
    expect(first.result.current[0]).toBe(true);
    expect(second.result.current[0]).toBe(true);

    act(() => second.result.current[1](false));

    expect(window.localStorage.getItem(CALL_DIAGNOSTICS_STORAGE_KEY)).toBeNull();
    expect(first.result.current[0]).toBe(false);
  });

  it("falls back to off when storage cannot be read, and keeps the toggle working for the session", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage blocked");
    };
    try {
      const { result } = renderHook(() => useCallDiagnostics());
      expect(result.current[0]).toBe(false);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
