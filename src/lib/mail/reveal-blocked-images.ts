/**
 * Browser-only: swaps data-original-src back to src on an already-sanitized
 * string, undoing sanitize-email-html.ts's image-blocking hook when the
 * user taps "Show images". Kept as a plain string-in/string-out function
 * rather than reaching into the dialog's iframe DOM — the iframe's
 * sandbox="allow-popups" (no allow-same-origin) makes it opaque-origin, so
 * the parent page structurally cannot reach contentDocument even if it
 * tried. Toggling images works by recomputing this string and reassigning
 * srcDoc, which reloads the iframe's content fresh.
 */
export function revealBlockedImages(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const img of doc.querySelectorAll("img[data-original-src]")) {
    const originalSrc = img.getAttribute("data-original-src");
    if (originalSrc) img.setAttribute("src", originalSrc);
    img.removeAttribute("data-original-src");
  }

  for (const image of doc.querySelectorAll("image[data-original-href]")) {
    const originalHref = image.getAttribute("data-original-href");
    if (originalHref) image.setAttribute("href", originalHref);
    image.removeAttribute("data-original-href");
  }

  for (const image of doc.querySelectorAll("image[data-original-xlink-href]")) {
    const originalHref = image.getAttribute("data-original-xlink-href");
    if (originalHref) image.setAttribute("xlink:href", originalHref);
    image.removeAttribute("data-original-xlink-href");
  }

  for (const element of doc.querySelectorAll("[data-original-background]")) {
    const originalBackground = element.getAttribute("data-original-background");
    if (originalBackground) element.setAttribute("background", originalBackground);
    element.removeAttribute("data-original-background");
  }

  for (const element of doc.querySelectorAll("[data-original-style]")) {
    const originalStyle = element.getAttribute("data-original-style");
    if (originalStyle) element.setAttribute("style", originalStyle);
    element.removeAttribute("data-original-style");
  }

  return doc.body.innerHTML;
}
