import { convert } from "html-to-text";

/**
 * Strips a fetched URL source's HTML down to readable text before chunking.
 * `html-to-text` never executes anything in the input — it's a pure
 * text-extraction pass over a DOM it parses itself, not a renderer, so
 * feeding it attacker-controlled page content (this is fetched from an
 * arbitrary URL the user supplied) carries no script-execution risk.
 */
export function extractReadableText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
    ],
  }).trim();
}
