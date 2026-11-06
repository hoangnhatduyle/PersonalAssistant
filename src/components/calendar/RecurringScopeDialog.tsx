"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type Props = {
  /** What is being changed ("First Solar"); null keeps the dialog closed. */
  title: string | null;
  onThis: () => void;
  onAll: () => void;
  onCancel: () => void;
};

/**
 * Asked every time a recurring course or appointment is moved or resized from
 * the calendar, like Google Calendar: only this day, or the whole weekly
 * pattern. "This occurrence" comes first and is the primary action — it's the
 * usual intent ("I'm off this Thursday") and leaves every other date alone.
 */
export function RecurringScopeDialog({ title, onThis, onAll, onCancel }: Props) {
  if (title === null) return null;
  return (
    <Dialog open onClose={onCancel} title="Change recurring event">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{title}</span> repeats every week. Change just this day, or every one?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onAll}>
            All occurrences
          </Button>
          <Button type="button" onClick={onThis}>
            This occurrence
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
