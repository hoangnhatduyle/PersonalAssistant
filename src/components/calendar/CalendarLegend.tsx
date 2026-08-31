import { toneClasses } from "@/lib/status-colors";

const LEGEND_ITEMS = [
  { label: "Course", tone: "accent" as const },
  { label: "Deadline", tone: "urgent" as const },
];

export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-text-secondary">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border ${toneClasses(item.tone)}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
