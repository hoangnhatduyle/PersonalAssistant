import { describe, expect, it } from "vitest";
import { detectPlatform, displayHost, normalizeJobUrl, normalizePostUrl, parsePostUrl, safeExternalHref } from "@/lib/library/url";

describe("detectPlatform", () => {
  it.each([
    ["https://www.facebook.com/somepage/posts/123", "facebook"],
    ["https://m.facebook.com/story.php?story_fbid=1&id=2", "facebook"],
    ["https://web.facebook.com/photo?fbid=9", "facebook"],
    ["https://mbasic.facebook.com/x", "facebook"],
    ["https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com", "facebook"],
    ["https://fb.watch/abc/", "facebook"],
    ["https://fb.me/abc", "facebook"],
    ["https://www.instagram.com/p/ABC/", "instagram"],
    ["https://instagr.am/p/ABC", "instagram"],
    ["https://example.com/post", "other"],
    ["https://notfacebook.com/post", "other"],
    ["not a url", "other"],
    ["", "other"],
  ])("%s -> %s", (input, expected) => {
    expect(detectPlatform(input)).toBe(expected);
  });
});

describe("normalizePostUrl", () => {
  it("lowercases the host, strips www., drops the hash and query for Instagram", () => {
    expect(normalizePostUrl("HTTP://WWW.Instagram.com/p/ABC/?igsh=x#y")).toBe("https://instagram.com/p/ABC");
  });

  it("keeps only the content code for reels/tv and user-prefixed paths", () => {
    expect(normalizePostUrl("https://www.instagram.com/reel/XyZ_1-a/?utm_source=ig")).toBe("https://instagram.com/reel/XyZ_1-a");
    expect(normalizePostUrl("https://www.instagram.com/someone/p/ABC/")).toBe("https://instagram.com/p/ABC");
  });

  it("keeps only allow-listed Facebook params, sorted", () => {
    expect(normalizePostUrl("https://m.facebook.com/story.php?id=2&story_fbid=1&fbclid=zzz&ref=x")).toBe(
      "https://facebook.com/story.php?id=2&story_fbid=1",
    );
  });

  it("makes m./www./web. Facebook variants collide", () => {
    const a = normalizePostUrl("https://www.facebook.com/page/posts/1/");
    const b = normalizePostUrl("https://m.facebook.com/page/posts/1");
    expect(a).toBe(b);
  });

  it("unwraps l.facebook.com redirects", () => {
    expect(normalizePostUrl("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa%3Futm_source%3Dfb&h=1")).toBe(
      "https://example.com/a",
    );
  });

  it("drops tracking params on other hosts but keeps real ones", () => {
    expect(normalizePostUrl("https://example.com/a/?utm_source=x&gclid=1&mc_eid=2&page=3#frag")).toBe(
      "https://example.com/a?page=3",
    );
  });

  it("returns null for non-http(s) or unparsable input", () => {
    expect(normalizePostUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePostUrl("ftp://example.com/x")).toBeNull();
    expect(normalizePostUrl("nope")).toBeNull();
  });
});

describe("safeExternalHref", () => {
  it("allows http(s)", () => {
    expect(safeExternalHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalHref("http://example.com")).toBe("http://example.com/");
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "https://user:pw@example.com/", "", null, undefined])(
    "rejects %s",
    (input) => {
      expect(safeExternalHref(input as string | null | undefined)).toBeNull();
    },
  );
});

describe("parsePostUrl / displayHost", () => {
  it("trims and parses", () => {
    expect(parsePostUrl("  https://example.com  ")?.hostname).toBe("example.com");
    expect(parsePostUrl("   ")).toBeNull();
  });

  it("returns the bare host", () => {
    expect(displayHost("https://www.instagram.com/p/ABC")).toBe("instagram.com");
    expect(displayHost(null)).toBeNull();
    expect(displayHost("javascript:1")).toBeNull();
  });
});

describe("normalizeJobUrl", () => {
  it("lowercases the host, strips www., drops hash, trailing slash and tracking params", () => {
    expect(normalizeJobUrl("HTTPS://WWW.Example.com/careers/123/?utm_source=x&gh_src=y#apply")).toBe("https://example.com/careers/123");
  });

  it("keeps identifying params, sorted", () => {
    expect(normalizeJobUrl("https://boards.example.com/jobs?jobId=42&team=eng&fbclid=z")).toBe(
      "https://boards.example.com/jobs?jobId=42&team=eng",
    );
  });

  it("does not apply the Facebook/Instagram allow-lists", () => {
    expect(normalizeJobUrl("https://www.linkedin.com/jobs/view/123/?trackingId=a&refId=b&currentJobId=123")).toBe(
      "https://linkedin.com/jobs/view/123?currentJobId=123",
    );
  });

  it("returns null for non-http(s) or unparsable input", () => {
    expect(normalizeJobUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeJobUrl("nope")).toBeNull();
    expect(normalizeJobUrl("")).toBeNull();
  });
});
