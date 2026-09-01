import { toneClasses } from "@/lib/status-colors";
import { PersonLegend } from "@/components/calendar/PersonLegend";
import type { PersonRow } from "@/lib/api/entity-types";

const LEGEND_ITEMS = [
  { label: "Course", tone: "accent" as const },
  { label: "Deadline", tone: "urgent" as const },
  { label: "Task", tone: "accent" as const },
];

type Props = {
  people?: PersonRow[];
};

/** Static Course/Deadline/Task tone entries (the account owner's own events) plus one hex-colored swatch per tracked Person (People feature). */
export function CalendarLegend({ people = [] }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-text-secondary">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border ${toneClasses(item.tone)}`} />
          {item.label}
        </span>
      ))}
      <PersonLegend people={people} />
    </div>
  );
}
