import { describe, expect, it } from "vitest";
import { isBareAcknowledgement, stripSpokenFillers } from "../spoken-input";

describe("stripSpokenFillers", () => {
  it.each([
    ["ummm, I want to add a deadline", "I want to add a deadline"],
    ["Um, uh, create a task", "create a task"],
    ["Add a deadline for, uh, physics 6540 tomorrow at, hmm, 8 PM", "Add a deadline for, physics 6540 tomorrow at, 8 PM"],
    ["I want to... erm... add a task", "I want to... add a task"],
    ["Uhhh. Create a new deadline. Mmm.", "Create a new deadline."],
    ["mm-hmm, remind me to call the bank", "remind me to call the bank"],
    ["UM remind me to call the bank", "remind me to call the bank"],
  ])("removes non-lexical hesitation sounds from %j", (input, expected) => {
    expect(stripSpokenFillers(input)).toBe(expected);
  });

  it.each([
    ["um"],
    ["Ummm..."],
    ["uh, hmm"],
    ["Hmm. Mmm. Uh."],
    ["   "],
    [""],
    ["..."],
  ])("returns an empty string for a transcript that is only hesitation sounds or punctuation: %j", (input) => {
    expect(stripSpokenFillers(input)).toBe("");
  });

  it("collapses a stuttered short word without touching real repeats or numbers", () => {
    expect(stripSpokenFillers("I I want to to add a task")).toBe("I want to add a task");
    expect(stripSpokenFillers("move it to 6 6 PM")).toBe("move it to 6 6 PM");
    expect(stripSpokenFillers("it was very very urgent")).toBe("it was very very urgent");
  });

  it("never alters words that merely contain a filler-like substring", () => {
    expect(stripSpokenFillers("Summer humming errand ahead umbrella")).toBe("Summer humming errand ahead umbrella");
  });

  it("leaves meaningful short acknowledgments alone (whether they are an answer is the model's call)", () => {
    expect(stripSpokenFillers("Okay")).toBe("Okay");
    expect(stripSpokenFillers("Yeah, no")).toBe("Yeah, no");
  });
});

describe("isBareAcknowledgement", () => {
  it.each(["Okay", "okay.", "OK!", "Yeah", "Yeah, okay", "Mm-hmm, yeah", "Got it", "Right", "Sure, thanks", "yep"])("is true for %j", (input) => {
    expect(isBareAcknowledgement(stripSpokenFillers(input))).toBe(true);
  });

  it.each([
    ["Okay, add a task to call the bank"],
    ["Yeah, mark it done"],
    ["What's due today?"],
    ["Okay so that's a yes to all of the things on the list"],
    [""],
  ])("is false once there is anything more than acknowledgement words: %j", (input) => {
    expect(isBareAcknowledgement(stripSpokenFillers(input))).toBe(false);
  });
});
