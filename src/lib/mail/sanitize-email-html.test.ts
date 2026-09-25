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

  it("neutralizes a remote background-image url() in an inline style attribute (tracking-pixel bypass of img blocking)", () => {
    const result = sanitizeEmailHtml('<div style="background-image:url(https://tracker.example.com/pixel.gif)">x</div>');
    expect(result).toContain('style="background-image:url()"');
    expect(result).toContain('data-original-style="background-image:url(https://tracker.example.com/pixel.gif)"');
  });

  it("neutralizes a protocol-relative url() in an inline style attribute", () => {
    const result = sanitizeEmailHtml('<div style="background:url(//tracker.example.com/pixel.gif)">x</div>');
    expect(result).toContain('style="background:url()"');
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
});

describe("sanitizePlainTextAsEmailHtml", () => {
  it("escapes HTML-special characters and converts newlines to <br>", () => {
    const result = sanitizePlainTextAsEmailHtml("Hi <there>\nSecond line & more");
    expect(result).toContain("&lt;there&gt;");
    expect(result).toContain("<br>");
    expect(result).toContain("&amp;");
  });

  it("still routes through the same sanitizer (no raw script survives)", () => {
    const result = sanitizePlainTextAsEmailHtml("<script>alert(1)</script>");
    expect(result).not.toContain("<script");
  });
});
