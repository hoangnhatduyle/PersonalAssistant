"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDeadlineNotes } from "@/hooks/useNotes";
import { MarkdownBody } from "@/components/notes/MarkdownBody";

type Props = {
  deadlineId: string;
};

const MAX_PREVIEW = 2;

/**
 * Read-only view of a deadline's notes for the Workload card. Notes are only
 * added/edited/deleted from the deadline's detail page — this never renders
 * any controls, just a link there when there are more than fit.
 */
export function DeadlineNotesPreview({ deadlineId }: Props) {
  const { data } = useDeadlineNotes();
  const notes = useMemo(() => (data?.rows ?? []).filter((note) => note.linked_deadline_id === deadlineId), [data, deadlineId]);

  if (notes.length === 0) return null;

  const shown = notes.slice(0, MAX_PREVIEW);
  const hidden = notes.length - shown.length;

  return (
    <div className="flex flex-col gap-1.5 border-t border-panel-border pt-2">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Notes</p>
      {shown.map((note) => (
        <div key={note.id} className="max-h-24 overflow-hidden">
          <MarkdownBody content={note.body} />
        </div>
      ))}
      {hidden > 0 && (
        <Link href={`/courses/deadlines/${deadlineId}`} className="text-xs text-accent-indigo hover:underline">
          +{hidden} more in details
        </Link>
      )}
    </div>
  );
}
