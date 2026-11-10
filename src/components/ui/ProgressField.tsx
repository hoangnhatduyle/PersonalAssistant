"use client";

import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { MAX_PROGRESS_NOTE_LENGTH } from "@/lib/api/schemas";

const QUICK_VALUES = [0, 25, 50, 75, 100] as const;

type Props = {
  /** Prefix for the control ids, so two fields on one page never collide. */
  idPrefix: string;
  /** The hand-set percent (0-100), or null when progress is derived automatically. */
  percent: number | null;
  note: string | null;
  onPercentChange: (percent: number | null) => void;
  onNoteChange: (note: string | null) => void;
  /** What progress would be without a hand-set value (shown, not committed, until the user picks one). */
  autoPercent?: number | null;
  /** Plain-words reason for the automatic value, e.g. "3 of 5 checklist items done". */
  autoHint?: string;
  disabled?: boolean;
};

/**
 * Hand-set progress for a deadline, task or session: a slider plus quick-set buttons, a way back
 * to "automatic", and a short note. Fully controlled so it works inside react-hook-form (via
 * Controller) and plain-state forms alike. 0 % is a real value -- only `null` means "automatic".
 */
export function ProgressField({ idPrefix, percent, note, onPercentChange, onNoteChange, autoPercent = null, autoHint, disabled = false }: Props) {
  const sliderId = `${idPrefix}-progress`;
  const noteId = `${idPrefix}-progress-note`;
  const shown = percent ?? autoPercent;
  const readout = percent != null ? `${percent}%` : autoPercent != null ? `Auto ${autoPercent}%` : "Not set";

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Progress" htmlFor={sliderId}>
        <div className="flex items-center gap-3">
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={shown ?? 0}
            disabled={disabled}
            aria-label="Progress"
            aria-valuetext={readout}
            onChange={(event) => onPercentChange(Number(event.target.value))}
            className={`h-1.5 flex-1 cursor-pointer accent-accent-indigo disabled:cursor-not-allowed ${percent == null ? "opacity-50" : ""}`}
          />
          <span className="w-20 text-right font-mono text-xs text-text-primary">{readout}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_VALUES.map((value) => (
            <Button
              key={value}
              variant="secondary"
              size="sm"
              disabled={disabled}
              aria-pressed={percent === value}
              className={`px-2.5 py-1 font-mono text-xs ${percent === value ? "border-accent-indigo text-accent-indigo" : ""}`}
              onClick={() => onPercentChange(value)}
            >
              {value}%
            </Button>
          ))}
          {percent != null && (
            <Button variant="ghost" size="sm" disabled={disabled} className="px-2.5 py-1 text-xs" onClick={() => onPercentChange(null)}>
              Use automatic
            </Button>
          )}
        </div>
        {autoHint && <p className="font-mono text-xs text-text-secondary">{autoHint}</p>}
      </FormField>

      <FormField label="Progress note" htmlFor={noteId}>
        <Textarea
          id={noteId}
          rows={2}
          maxLength={MAX_PROGRESS_NOTE_LENGTH}
          disabled={disabled}
          placeholder="Where does this stand? e.g. waiting on data, outline done"
          value={note ?? ""}
          onChange={(event) => onNoteChange(event.target.value === "" ? null : event.target.value)}
        />
      </FormField>
    </div>
  );
}
