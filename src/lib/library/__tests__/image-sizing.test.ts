import { describe, expect, it } from "vitest";
import { computeTargetSize } from "@/lib/library/image-sizing";

describe("computeTargetSize", () => {
  it("does not enlarge images already inside the box", () => {
    expect(computeTargetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down to maxEdge", () => {
    expect(computeTargetSize(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(computeTargetSize(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it("never yields a zero edge for extreme aspect ratios", () => {
    expect(computeTargetSize(8000, 100, 480)).toEqual({ width: 480, height: 6 });
    expect(computeTargetSize(100000, 1, 480).height).toBe(1);
  });
});
