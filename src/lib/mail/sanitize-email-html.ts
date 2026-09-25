import sanitizeHtml from "sanitize-html";

// sanitize-html's own default allowlist already excludes script/style/iframe/
// object/embed/base/link/meta (the tags capable of executing script or
// injecting remote CSS/navigation). We extend it with the tags/attributes
// email HTML actually uses that aren't in a generic rich-text default.
const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat(["img", "svg", "image", "font", "center"]);

const ALLOWED_ATTRIBUTES = {
  ...sanitizeHtml.defaults.allowedAttributes,
  "*": [
    "style",
    "class",
    "align",
    "valign",
    "width",
    "height",
    "border",
    "cellpadding",
    "cellspacing",
    "bgcolor",
    "color",
    "face",
    "size",
    "background",
    "data-*",
  ],
  img: ["src", "alt", "width", "height", "style", "border"],
  image: ["href", "xlink:href", "width", "height"],
  a: ["href", "name", "target", "rel"],
};

/**
 * Real CSS parsers strip comments and resolve backslash escapes before
 * tokenizing `url(...)` — an attacker can hide a remote reference from a
 * naive string match by splitting it with a comment (`url(/**\/https://…)`)
 * or backslash-escaping characters in the scheme (`ur\6c(`, `htt\70://`).
 * Undo both before we go looking for `url(`, so detection sees what a real
 * browser would.
 */
function normalizeCssForUrlDetection(css: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutComments.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_match, hex: string | undefined, char: string | undefined) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : (char ?? ""),
  );
}

const REMOTE_CSS_URL = /url\(\s*(['"]?)(?:https?:)?\/\/[^'")]*\1\s*\)/i;

/**
 * Detects a url(...) reference to a remote (http(s):// or protocol-relative
 * //) resource anywhere in a CSS value — including comment- or
 * backslash-escape-obfuscated ones (see normalizeCssForUrlDetection) — so a
 * background-image can't be used as a tracking pixel. data: URIs are left
 * alone since they don't trigger a network request.
 *
 * On a hit, the *entire* style value is blocked (not just the url(...)
 * span): once we know the attacker is willing to obfuscate, we can no
 * longer trust string-surgery on the raw value to remove only the unsafe
 * part without leaving some other encoding of it behind. The full original
 * is preserved in data-original-style and restored verbatim by
 * reveal-blocked-images.ts on "Show images", so nothing is lost — it's
 * just gated the same way an <img src> is.
 */
function containsRemoteCssUrl(css: string): boolean {
  return REMOTE_CSS_URL.test(normalizeCssForUrlDetection(css));
}

const EVENT_HANDLER_ATTR = /^on/i;

// The exact set of attribute names this sanitizer's own transform produces
// to record a blocked remote reference (see below). reveal-blocked-images.ts
// trusts these unconditionally on the client to restore live src/href/style,
// so a sender embedding one of these names directly in their HTML — instead
// of a plain src/href/style/background — would bypass every check above.
// They're stripped from sender-supplied HTML up front, before any of this
// function's own (legitimate) renames run, so only renames performed here
// can ever produce them in the output.
const FORGEABLE_TRUST_ATTRS = ["data-original-src", "data-original-href", "data-original-xlink-href", "data-original-background", "data-original-style"];

/**
 * Sanitizes raw third-party email HTML server-side before it ever reaches
 * the client (defense layer 1 — layer 2 is the sandboxed iframe the
 * dialog renders it into, see MailMessageDialog.tsx). `script`/`style`/
 * `iframe`/`object`/`embed`/`base`/`link`/`meta` are dropped entirely by the
 * allowlist above; this transform closes the remaining remote-fetch vectors
 * email HTML can use as a tracking pixel, matching Gmail/Outlook's own
 * "blocked by default, reveal on demand" behavior:
 * - <img src> and SVG <image href>/<image xlink:href> are moved to
 *   data-original-* attributes and removed.
 * - The legacy HTML `background="..."` attribute (still valid on
 *   <table>/<td>/<body> etc.) is moved to data-original-background.
 * - Any inline style="...url(...)..." pointing at a remote (http(s):// or
 *   protocol-relative //) resource is blocked in full (see
 *   containsRemoteCssUrl), with the original saved to data-original-style.
 * All of the above are restored by reveal-blocked-images.ts on "Show images".
 *
 * Separately, every <a> gets target="_blank" rel="noopener noreferrer"
 * forced, regardless of what the sender's HTML specified; any `on*`
 * event-handler attribute is stripped from every tag; and a sender cannot
 * plant one of the data-original-* trust attributes directly (see
 * FORGEABLE_TRUST_ATTRS) to smuggle an unvalidated value past all of the
 * above straight to reveal-blocked-images.ts's unconditional restore.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowVulnerableTags: false,
    parseStyleAttributes: false,
    transformTags: {
      "*": (tagName, attribs) => {
        const nextAttribs: Record<string, string> = {};
        for (const [name, value] of Object.entries(attribs)) {
          if (EVENT_HANDLER_ATTR.test(name)) continue;
          if (FORGEABLE_TRUST_ATTRS.includes(name.toLowerCase())) continue;
          nextAttribs[name] = value;
        }

        if (tagName === "img" && "src" in nextAttribs) {
          nextAttribs["data-original-src"] = nextAttribs.src;
          delete nextAttribs.src;
        }

        if (tagName === "image") {
          if ("href" in nextAttribs) {
            nextAttribs["data-original-href"] = nextAttribs.href;
            delete nextAttribs.href;
          }
          if ("xlink:href" in nextAttribs) {
            nextAttribs["data-original-xlink-href"] = nextAttribs["xlink:href"];
            delete nextAttribs["xlink:href"];
          }
        }

        if (tagName === "a") {
          nextAttribs.target = "_blank";
          nextAttribs.rel = "noopener noreferrer";
        }

        if ("background" in nextAttribs) {
          nextAttribs["data-original-background"] = nextAttribs.background;
          delete nextAttribs.background;
        }

        if ("style" in nextAttribs && containsRemoteCssUrl(nextAttribs.style)) {
          nextAttribs["data-original-style"] = nextAttribs.style;
          nextAttribs.style = "";
        }

        return { tagName, attribs: nextAttribs };
      },
    },
  });
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
