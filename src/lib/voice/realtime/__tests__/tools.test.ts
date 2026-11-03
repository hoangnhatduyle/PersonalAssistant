import { describe, expect, it } from "vitest";
import { CONVERSATION_TOOLS } from "@/lib/voice/tools";
import { adaptDescriptionForCall, adaptSchemaForCall, buildRealtimeTools, CALL_ONLY_TOOLS, EXCLUDED_FROM_CALL, FINALIZING_CALL_TOOLS } from "../tools";

describe("buildRealtimeTools", () => {
  const tools = buildRealtimeTools();
  const names = tools.map((tool) => tool.name);

  it("offers every shipped tool except the three a call cannot use", () => {
    const expected = CONVERSATION_TOOLS.map((tool) => tool.name as string).filter((name) => !(EXCLUDED_FROM_CALL as readonly string[]).includes(name));
    expect(names.slice(0, expected.length)).toEqual(expected);
    for (const excluded of EXCLUDED_FROM_CALL) expect(names).not.toContain(excluded);
  });

  it("adds the call-only tools at the end", () => {
    expect(names.slice(-CALL_ONLY_TOOLS.length)).toEqual([...CALL_ONLY_TOOLS]);
  });

  it("has unique names and a non-empty description and object schema on every tool", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters).toMatchObject({ type: "object" });
    }
  });

  it("drops the structured-output `strict` flag, which Realtime function tools do not take", () => {
    for (const tool of tools) expect(tool).not.toHaveProperty("strict");
  });

  it("keeps each shipped parameter schema's structure, so both paths validate identically", () => {
    for (const shipped of CONVERSATION_TOOLS) {
      const onCall = tools.find((tool) => tool.name === shipped.name);
      if (!onCall) continue;
      expect(onCall.parameters).toEqual(adaptSchemaForCall(shipped.parameters));
      expect(Object.keys(onCall.parameters)).toEqual(Object.keys(shipped.parameters));
    }
    const strip = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(strip)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "description").map(([key, v]) => [key, strip(v)]))
          : value;
    const proposeShipped = CONVERSATION_TOOLS.find((tool) => tool.name === "propose_mutation")!;
    expect(strip(tools.find((tool) => tool.name === "propose_mutation")!.parameters)).toEqual(strip(proposeShipped.parameters));
  });

  it("no longer tells the model to call respond_to_user, a tool it does not have (descriptions or schema notes)", () => {
    // Paths only, so a failure names where the mention is instead of dumping a whole schema.
    const mentions = (value: unknown, path: string): string[] =>
      typeof value === "string"
        ? value.includes("respond_to_user")
          ? [path]
          : []
        : value && typeof value === "object"
          ? Object.entries(value).flatMap(([key, v]) => mentions(v, `${path}.${key}`))
          : [];
    for (const tool of tools) {
      expect(mentions(tool.description, `${tool.name}.description`), tool.name).toEqual([]);
      expect(mentions(tool.parameters, `${tool.name}.parameters`), tool.name).toEqual([]);
    }
  });

  it("requires a session_id for confirm and decline, and no arguments for end_call", () => {
    for (const name of ["confirm_pending_mutation", "decline_pending_mutation"]) {
      expect(tools.find((tool) => tool.name === name)!.parameters).toMatchObject({ required: ["session_id"], additionalProperties: false });
    }
    expect(tools.find((tool) => tool.name === "end_call")!.parameters).toMatchObject({ required: [], properties: {} });
  });

  it("lists the finalizing tools, all of which exist on a call", () => {
    for (const name of FINALIZING_CALL_TOOLS) expect(names).toContain(name);
  });
});

describe("adaptSchemaForCall", () => {
  it("rewrites nested descriptions, leaves everything else, and does not mutate its input", () => {
    const input = { type: "object", properties: { a: { type: "string", description: "explain via respond_to_user" }, b: { items: [{ description: "call respond_to_user" }] } }, required: ["a"] };
    const snapshot = structuredClone(input);
    expect(adaptSchemaForCall(input)).toEqual({
      type: "object",
      properties: { a: { type: "string", description: "explain aloud" }, b: { items: [{ description: "answer aloud" }] } },
      required: ["a"],
    });
    expect(input).toEqual(snapshot);
  });
});

describe("adaptDescriptionForCall", () => {
  it("rewrites each phrasing used by the shipped descriptions", () => {
    expect(adaptDescriptionForCall("do not guess -- call respond_to_user explaining you have no match")).toBe("do not guess -- answer aloud explaining you have no match");
    expect(adaptDescriptionForCall("explain that via respond_to_user")).toBe("explain that aloud");
    expect(adaptDescriptionForCall("then respond_to_user")).toBe("then your spoken answer");
  });

  it("leaves text without the tool name alone", () => {
    expect(adaptDescriptionForCall("Look up the user's schedule.")).toBe("Look up the user's schedule.");
  });
});
