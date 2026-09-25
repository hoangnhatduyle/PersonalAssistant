import DOMPurify from "isomorphic-dompurify";

/**
 * Neutralizes url(...) references to remote resources inside a CSS value
 * (inline style="..." attribute) so a background-image can't be used as a
 * tracking pixel — DOMPurify's default config sanitizes script-executing
 * CSS constructs but does not touch plain url() image references. data:
 * URIs are left alone since they don't trigger a network request.
 */
function blockRemoteCssUrls(css: string): string {
  return css.replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^'")]*\1\s*\)/gi, "url()");
}

/**
 * Sanitizes raw third-party email HTML server-side before it ever reaches
 * the client (defense layer 1 — layer 2 is the sandboxed iframe the
 * dialog renders it into, see MailMessageDialog.tsx). DOMPurify's defaults
 * already strip <script>, inline event handlers, javascript: URLs, and
 * <style> blocks entirely.
 *
 * Hooks run in the same sanitize pass to close every remaining
 * remote-fetch vector email HTML can use as a tracking pixel, matching
 * Gmail/Outlook's own "blocked by default, reveal on demand" behavior:
 * - <img src> and SVG <image href>/<image xlink:href> are moved to
 *   data-original-* attributes and removed.
 * - The legacy HTML `background="..."` attribute (still valid on
 *   <table>/<td>/<body> etc.) is moved to data-original-background.
 * - Any inline style="...url(...)..." pointing at a remote (http(s)://
 *   or protocol-relative //) resource has the url() neutralized, with the
 *   original saved to data-original-style.
 * All of the above are restored by reveal-blocked-images.ts on "Show images".
 *
 * Separately, every <a> gets target="_blank" rel="noopener noreferrer"
 * forced, regardless of what the sender's HTML specified.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src");
      if (src) {
        node.setAttribute("data-original-src", src);
        node.removeAttribute("src");
      }
    }
    if (node.tagName === "image") {
      for (const attr of ["href", "xlink:href"]) {
        const value = node.getAttribute(attr);
        if (value) {
          node.setAttribute(`data-original-${attr.replace(":", "-")}`, value);
          node.removeAttribute(attr);
        }
      }
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }

    const background = node.getAttribute("background");
    if (background) {
      node.setAttribute("data-original-background", background);
      node.removeAttribute("background");
    }

    const style = node.getAttribute("style");
    if (style) {
      const blocked = blockRemoteCssUrls(style);
      if (blocked !== style) {
        node.setAttribute("data-original-style", style);
        node.setAttribute("style", blocked);
      }
    }
  });

  try {
    return DOMPurify.sanitize(rawHtml);
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
}

/** Escapes plain-text-only message bodies and runs them through the same sanitizer, so callers always get one sanitizedBodyHtml string regardless of the source format. */
export function sanitizePlainTextAsEmailHtml(rawText: string): string {
  const escaped = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return sanitizeEmailHtml(escaped);
}
