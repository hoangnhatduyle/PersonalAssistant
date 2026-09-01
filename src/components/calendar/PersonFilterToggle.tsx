import type { PersonRow } from "@/lib/api/entity-types";

export type PersonFilterValue = "all" | "me" | string;

type Props = {
  people: PersonRow[];
  value: PersonFilterValue;
  onChange: (value: PersonFilterValue) => void;
  /** Defaults to "calendar" for the original use case; pass the surface name when reused elsewhere (e.g. "courses"). */
  label?: string;
};

/** Mine / [Person] / All overlaid — mirrors the toggle UX the user was already hand-rolling for ride planning before this feature existed. */
export function PersonFilterToggle({ people, value, onChange, label = "calendar" }: Props) {
  const options: Array<{ key: PersonFilterValue; label: string }> = [
    { key: "all", label: "All overlaid" },
    { key: "me", label: "Mine" },
    ...people.map((person) => ({ key: person.id, label: person.name })),
  ];

  return (
    <div role="group" aria-label={`Filter ${label} by person`} className="inline-flex rounded-full border border-panel-border bg-panel p-1">
      {options.map((option) => {
        const isActive = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.key)}
            className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide transition-colors ${
              isActive ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
