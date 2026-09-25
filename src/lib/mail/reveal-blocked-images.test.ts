import { describe, expect, it } from "vitest";
import { revealBlockedImages } from "./reveal-blocked-images";

describe("revealBlockedImages", () => {
  it("round-trips a blocked-image string back to a real src", () => {
    const blocked = '<p>Hi</p><img data-original-src="https://example.com/a.png" alt="a">';
    const result = revealBlockedImages(blocked);
    expect(result).toContain('src="https://example.com/a.png"');
    expect(result).not.toContain("data-original-src");
  });

  it("leaves everything else untouched", () => {
    const html = "<p>Hello <strong>World</strong></p>";
    expect(revealBlockedImages(html)).toBe(html);
  });

  it("restores a blocked inline style background-image", () => {
    const blocked = '<div data-original-style="background-image:url(https://example.com/a.png)" style="background-image:url()">x</div>';
    const result = revealBlockedImages(blocked);
    expect(result).toContain('style="background-image:url(https://example.com/a.png)"');
    expect(result).not.toContain("data-original-style");
  });

  it("restores a blocked legacy background attribute", () => {
    const blocked = '<table data-original-background="https://example.com/a.png"><tbody><tr><td>x</td></tr></tbody></table>';
    const result = revealBlockedImages(blocked);
    expect(result).toContain('background="https://example.com/a.png"');
    expect(result).not.toContain("data-original-background");
  });

  it("restores blocked SVG image href and xlink:href", () => {
    const blocked =
      '<svg><image data-original-href="https://example.com/a.gif" data-original-xlink-href="https://example.com/b.gif"></image></svg>';
    const result = revealBlockedImages(blocked);
    expect(result).toContain('href="https://example.com/a.gif"');
    expect(result).toContain('xlink:href="https://example.com/b.gif"');
    expect(result).not.toContain("data-original-href");
    expect(result).not.toContain("data-original-xlink-href");
  });

  it("reveals multiple blocked images independently", () => {
    const blocked =
      '<img data-original-src="https://a.example.com/1.png"><img data-original-src="https://b.example.com/2.png">';
    const result = revealBlockedImages(blocked);
    expect(result).toContain('src="https://a.example.com/1.png"');
    expect(result).toContain('src="https://b.example.com/2.png"');
    expect(result).not.toContain("data-original-src");
  });
});
