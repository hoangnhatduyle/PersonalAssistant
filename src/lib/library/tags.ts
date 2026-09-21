import { MAX_TAGS_PER_POST, MAX_TAG_CHARS, MAX_TECH_STACK_ITEMS, MAX_TECH_STACK_CHARS } from "@/lib/library/constants";

/**
 * Trim, lowercase, collapse inner whitespace, drop empties/commas (a comma
 * would break the comma-joined `tag` query param), dedupe (first wins), and
 * cap both tag length and tag count.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TAG_CHARS).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_POST) break;
  }
  return out;
}

/**
 * Like normalizeTags but case-preserving ("TypeScript", "AWS" read wrong
 * lowercased): trim, collapse whitespace, drop commas/empties, dedupe
 * case-insensitively (first casing wins), cap item length and count.
 */
export function normalizeTechStack(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TECH_STACK_CHARS).trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_TECH_STACK_ITEMS) break;
  }
  return out;
}
