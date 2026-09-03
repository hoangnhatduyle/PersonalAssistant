import type { KnowledgeCitation } from "@/lib/knowledge/retrieval";

type Props = {
  citations: KnowledgeCitation[];
};

/** React doesn't block javascript:/data: URLs in href — validate the scheme before rendering an <a>. */
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function CitationChips({ citations }: Props) {
  if (citations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {citations.map((citation) => (
        <span
          key={citation.sourceId}
          className="inline-flex items-center rounded-full border border-panel-border bg-bg-void-elevated px-2.5 py-0.5 text-xs text-text-secondary"
        >
          {citation.originUrl && isSafeHttpUrl(citation.originUrl) ? (
            <a href={citation.originUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent-teal">
              {citation.title}
            </a>
          ) : (
            citation.title
          )}
        </span>
      ))}
    </div>
  );
}
