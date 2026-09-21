import { toneClasses } from "@/lib/status-colors";
import { PersonLegend } from "@/components/calendar/PersonLegend";
import type { PersonFilterSelection } from "@/components/calendar/PersonFilterToggle";
import type { PersonRow } from "@/lib/api/entity-types";

// The owner's Courses use their chosen color (or the "accent" tone until one
// is picked); Deadlines/Tasks/Appointments always keep their own type tone.
const TYPE_LEGEND_ITEMS = [
  { label: "Deadline", tone: "urgent" as const },
  { label: "Task", tone: "purple" as const },
  { label: "Appointment", tone: "warn" as const },
];

type Props = {
  people?: PersonRow[];
  /** Which people (and "me") are currently shown; omitted = everyone. */
  selection?: PersonFilterSelection;
  /** The account owner's chosen color (#RRGGBB), or null/undefined if never chosen. */
  ownerColor?: string | null;
};

/**
 * "Mine" (the owner's Courses) plus the Deadline/Task/Appointment tone
 * entries — all of which are the owner's own items, so they hide together
 * when "Mine" is toggled off — followed by one swatch per selected tracked
 * Person (People feature).
 */
export function CalendarLegend({ people = [], selection, ownerColor }: Props) {
  const showMine = !selection || selection.has("me");
  return (
    <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-text-secondary">
      {showMine && (
        <>
          <span className="flex items-center gap-1.5">
            {ownerColor ? (
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: ownerColor }} />
            ) : (
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border ${toneClasses("accent")}`} />
            )}
            Mine
          </span>
          {TYPE_LEGEND_ITEMS.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border ${toneClasses(item.tone)}`} />
              {item.label}
            </span>
          ))}
        </>
      )}
      <PersonLegend people={people} selection={selection} />
    </div>
  );
}
