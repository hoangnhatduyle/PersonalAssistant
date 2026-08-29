import { describe, expect, it } from "vitest";
import { validateUrlPreflight } from "../ssrf-fetch";

// Traces: SPEC-CORE-008 NC-017, SPEC-API-008 NC-API-011/AC-002. No real
// network calls — validateUrlPreflight only resolves DNS/checks the literal
// IP, it never connects.
describe("validateUrlPreflight", () => {
  it("rejects a non-http(s) scheme", async () => {
    const result = await validateUrlPreflight("file:///etc/passwd");
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed URL", async () => {
    const result = await validateUrlPreflight("not a url");
    expect(result.valid).toBe(false);
  });

  it("rejects a literal loopback address", async () => {
    expect((await validateUrlPreflight("http://127.0.0.1/")).valid).toBe(false);
    expect((await validateUrlPreflight("http://[::1]/")).valid).toBe(false);
  });

  it("rejects the cloud metadata endpoint", async () => {
    const result = await validateUrlPreflight("http://169.254.169.254/latest/meta-data/");
    expect(result.valid).toBe(false);
  });

  it("rejects an RFC 1918 private address", async () => {
    expect((await validateUrlPreflight("http://10.0.0.5/")).valid).toBe(false);
    expect((await validateUrlPreflight("http://172.16.0.5/")).valid).toBe(false);
    expect((await validateUrlPreflight("http://192.168.1.5/")).valid).toBe(false);
  });

  it("rejects an IPv4-mapped IPv6 literal wrapping a private address", async () => {
    const result = await validateUrlPreflight("http://[::ffff:127.0.0.1]/");
    expect(result.valid).toBe(false);
  });

  it("accepts a public IP literal with http(s) scheme", async () => {
    const result = await validateUrlPreflight("https://8.8.8.8/");
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toEqual(["8.8.8.8"]);
  });
});
