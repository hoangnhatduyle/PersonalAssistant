type Props = {
  /** 0=Sunday..6=Saturday, matching Date.prototype.getDay(). */
  value: number[];
  onChange: (days: number[]) => void;
};

// Displayed Monday-first (academic-schedule convention), independent of the
// underlying 0=Sun..6=Sat values, which must stay aligned with Date.getDay().
const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

/** Multi-select day-of-week picker for a recurrence block's active days. */
export function DayOfWeekToggle({ value, onChange }: Props) {
  const toggle = (day: number) => {
    if (value.includes(day)) onChange(value.filter((d) => d !== day));
    else onChange([...value, day].sort((a, b) => a - b));
  };

  return (
    <div role="group" aria-label="Active days" className="flex flex-wrap gap-2">
      {DAYS.map((day) => {
        const isActive = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => toggle(day.value)}
            className={`rounded-control border px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              isActive
                ? "border-accent-indigo bg-accent-indigo text-white"
                : "border-panel-border bg-panel text-text-secondary hover:border-panel-border-hover hover:text-text-primary"
            }`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
