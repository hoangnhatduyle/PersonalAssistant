const URL_PATTERN = /https?:\/\/[^\s<>\]"']+/g;

export type TextSegment = { text: string; isLink: boolean };

/** Splits text into plain/link segments so callers can render URLs as clickable anchors. */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), isLink: false });
    segments.push({ text: match[0], isLink: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isLink: false });

  return segments;
}

export function containsLink(text: string): boolean {
  // `match` (unlike `test`/`exec`) doesn't mutate URL_PATTERN's lastIndex, so
  // repeated calls against a shared global regex stay safe here.
  return text.match(URL_PATTERN) !== null;
}
