import { Button } from "@/components/ui/Button";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (page: number) => void;
  /** Noun for the "Showing 1–10 of 25 appointments" summary. */
  itemLabel?: string;
};

/** Prev/Next pager with a range summary. Renders nothing when everything fits on one page. */
export function Pagination({ page, totalPages, total, rangeStart, rangeEnd, onPageChange, itemLabel = "items" }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-panel-border pt-3">
      <p className="font-mono text-xs text-text-secondary" aria-live="polite">
        Showing {rangeStart}–{rangeEnd} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="font-mono text-xs text-text-secondary">
          Page {page} of {totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
