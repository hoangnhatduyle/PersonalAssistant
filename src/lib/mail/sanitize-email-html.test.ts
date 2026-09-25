import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml, sanitizePlainTextAsEmailHtml } from "./sanitize-email-html";

describe("sanitizeEmailHtml", () => {
  it("strips <script> tags entirely", () => {
    const result = sanitizeEmailHtml('<p>Hi</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hi</p>");
  });

  it("strips inline event handlers like onclick", () => {
    const result = sanitizeEmailHtml('<button onclick="alert(1)">Click</button>');
    expect(result).not.toContain("onclick");
  });

  it("strips javascript: hrefs", () => {
    const result = sanitizeEmailHtml('<a href="javascript:alert(1)">Click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("moves img src to data-original-src and removes src, blocking remote images by default", () => {
    const result = sanitizeEmailHtml('<img src="https://tracker.example.com/pixel.gif" alt="pixel">');
    expect(result).toContain('data-original-src="https://tracker.example.com/pixel.gif"');
    expect(result).not.toMatch(/<img[^>]*\ssrc=/);
  });

  it("forces target=_blank rel=noopener noreferrer on links regardless of sender-specified attributes", () => {
    const result = sanitizeEmailHtml('<a href="https://example.com" target="_self">Visit</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("preserves safe formatting elements commonly used in email HTML", () => {
    const result = sanitizeEmailHtml(
      "<table><tr><td><p>Hello <strong>World</strong></p></td></tr></table>",
    );
    expect(result).toContain("<table>");
    expect(result).toContain("<strong>World</strong>");
    expect(result).toContain("<p>Hello");
  });

  it("blocks a remote background-image url() in an inline style attribute (tracking-pixel bypass of img blocking)", () => {
    const result = sanitizeEmailHtml('<div style="background-image:url(https://tracker.example.com/pixel.gif)">x</div>');
    expect(result).not.toMatch(/\sstyle="/);
    expect(result).toContain('data-original-style="background-image:url(https://tracker.example.com/pixel.gif)"');
  });

  it("blocks a protocol-relative url() in an inline style attribute", () => {
    const result = sanitizeEmailHtml('<div style="background:url(//tracker.example.com/pixel.gif)">x</div>');
    expect(result).not.toMatch(/\sstyle="/);
  });

  it("blocks the whole style value (not just the url() span) when a remote url() shares it with other rules, but preserves the full original for later restore", () => {
    const result = sanitizeEmailHtml('<div style="color:red;background:url(https://tracker.example.com/pixel.gif);font-weight:bold">x</div>');
    expect(result).not.toMatch(/\sstyle="/);
    expect(result).toContain('data-original-style="color:red;background:url(https://tracker.example.com/pixel.gif);font-weight:bold"');
  });

  it("blocks a remote url() hidden behind a CSS comment splitting the token", () => {
    const result = sanitizeEmailHtml('<div style="background:url(/**/https://tracker.example.com/pixel.gif)">x</div>');
    expect(result).not.toMatch(/\sstyle="/);
    expect(result).toContain("data-original-style=");
  });

  it("blocks a remote url() hidden behind CSS backslash-hex escapes in the function/scheme name", () => {
    const result = sanitizeEmailHtml('<div style="background:ur\\6c(https://tracker.example.com/pixel.gif)">x</div>');
    expect(result).not.toMatch(/\sstyle="/);
    expect(result).toContain("data-original-style=");
  });

  it("leaves data: URIs in style attributes untouched (no network request triggered)", () => {
    const result = sanitizeEmailHtml('<div style="background:url(data:image/png;base64,abcd)">x</div>');
    expect(result).toContain("data:image/png;base64,abcd");
    expect(result).not.toContain("data-original-style");
  });

  it("moves the legacy background attribute to data-original-background and removes it", () => {
    const result = sanitizeEmailHtml('<table background="https://tracker.example.com/pixel.gif"><tr><td>x</td></tr></table>');
    expect(result).toContain('data-original-background="https://tracker.example.com/pixel.gif"');
    expect(result).not.toMatch(/\sbackground="https/);
  });

  it("moves SVG <image> href/xlink:href to data-original attributes and removes them", () => {
    const result = sanitizeEmailHtml(
      '<svg><image href="https://tracker.example.com/a.gif" xlink:href="https://tracker.example.com/b.gif"></image></svg>',
    );
    expect(result).toContain('data-original-href="https://tracker.example.com/a.gif"');
    expect(result).toContain('data-original-xlink-href="https://tracker.example.com/b.gif"');
    expect(result).not.toContain(' href="https://tracker.example.com/a.gif"');
    expect(result).not.toContain(' xlink:href="https://tracker.example.com/b.gif"');
  });

  it("cleans up its hook after each call so it does not leak into unrelated sanitize calls", () => {
    sanitizeEmailHtml("<img src=\"https://example.com/a.png\">");
    const unrelated = sanitizeEmailHtml("<p>plain</p>");
    expect(unrelated).toBe("<p>plain</p>");
  });

  it("strips a sender-forged data-original-src instead of trusting it (reveal-blocked-images.ts restores these unconditionally on the client)", () => {
    const result = sanitizeEmailHtml('<img data-original-src="javascript:alert(document.domain)">');
    expect(result).not.toContain("data-original-src");
  });

  it("strips a sender-forged data-original-style instead of trusting it", () => {
    const result = sanitizeEmailHtml('<div data-original-style="background:url(https://tracker.example.com/pixel.gif)">x</div>');
    expect(result).not.toContain("data-original-style");
  });

  it("strips sender-forged data-original-href/xlink-href/background", () => {
    const result = sanitizeEmailHtml(
      '<svg><image data-original-href="https://tracker.example.com/a.gif" data-original-xlink-href="https://tracker.example.com/b.gif"></image></svg>' +
        '<table data-original-background="https://tracker.example.com/c.gif"><tr><td>x</td></tr></table>',
    );
    expect(result).not.toContain("data-original-href");
    expect(result).not.toContain("data-original-xlink-href");
    expect(result).not.toContain("data-original-background");
  });

  it("still allows ordinary data-* attributes unrelated to the trust boundary", () => {
    const result = sanitizeEmailHtml('<div data-testid="foo">x</div>');
    expect(result).toContain('data-testid="foo"');
  });
});

describe("sanitizePlainTextAsEmailHtml", () => {
  it("escapes HTML-special characters and converts newlines to <br>", () => {
    const result = sanitizePlainTextAsEmailHtml("Hi <there>\nSecond line & more");
    expect(result).toContain("&lt;there&gt;");
    expect(result).toContain("<br");
    expect(result).toContain("&amp;");
  });

  it("still routes through the same sanitizer (no raw script survives)", () => {
    const result = sanitizePlainTextAsEmailHtml("<script>alert(1)</script>");
    expect(result).not.toContain("<script");
  });
});
