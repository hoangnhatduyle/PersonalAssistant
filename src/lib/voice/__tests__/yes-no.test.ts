import { describe, expect, it } from "vitest";
import { classifyYesNo } from "@/lib/voice/yes-no";

describe("classifyYesNo", () => {
  it.each(["yes", "Yes", "yeah", "yep", "confirm", "do it", "sure", "go ahead", "that's correct", "apply it", "okay", "ok"])(
    "classifies %j as yes",
    (transcript) => {
      expect(classifyYesNo(transcript)).toBe("yes");
    },
  );

  it.each(["no", "No", "nope", "nah", "cancel", "don't", "do not", "stop", "never mind", "skip it", "dismiss"])(
    "classifies %j as no",
    (transcript) => {
      expect(classifyYesNo(transcript)).toBe("no");
    },
  );

  it.each(["", "   ", "banana", "what time is it", "hmm"])("classifies %j as null (unrecognized)", (transcript) => {
    expect(classifyYesNo(transcript)).toBeNull();
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(classifyYesNo("  YES please  ")).toBe("yes");
  });

  it("does not match 'no' as a substring of an unrelated word", () => {
    expect(classifyYesNo("nostalgic about it")).toBeNull();
  });
});
