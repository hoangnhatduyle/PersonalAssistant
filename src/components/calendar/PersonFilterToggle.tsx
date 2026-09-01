import type { PersonRow } from "@/lib/api/entity-types";

export type PersonFilterKey = "me" | string;
export type PersonFilterSelection = ReadonlySet<PersonFilterKey>;

export function allPersonFilterKeys(people: PersonRow[]): PersonFilterKey[] {
  return ["me", ...people.map((person) => person.id)];
}

/** Default selection shows every person overlaid — matches the pre-filter behavior of showing all fetched rows. */
export function defaultPersonFilterSelection(people: PersonRow[]): PersonFilterSelection {
  return new Set(allPersonFilterKeys(people));
}

type Props = {
  people: PersonRow[];
  value: PersonFilterSelection;
  onChange: (value: PersonFilterSelection) => void;
  /** Defaults to "calendar" for the original use case; pass the surface name when reused elsewhere (e.g. "courses"). */
  label?: string;
};

function toggleKey(current: PersonFilterSelection, key: PersonFilterKey): PersonFilterSelection {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** Mine / [Person] / All overlaid — each badge is independently toggleable so any combination (e.g. Mine + Châu) can be shown at once. */
export function PersonFilterToggle({ people, value, onChange, label = "calendar" }: Props) {
  const allKeys = allPersonFilterKeys(people);
  const isAllSelected = allKeys.every((key) => value.has(key));
  const options: Array<{ key: PersonFilterKey; label: string }> = [
    { key: "me", label: "Mine" },
    ...people.map((person) => ({ key: person.id, label: person.name })),
  ];

  return (
    <div role="group" aria-label={`Filter ${label} by person`} className="inline-flex flex-wrap gap-1 rounded-full border border-panel-border bg-panel p-1">
      <button
        type="button"
        aria-pressed={isAllSelected}
        onClick={() => onChange(isAllSelected ? new Set() : new Set(allKeys))}
        className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide transition-colors ${
          isAllSelected ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
        }`}
      >
        All overlaid
      </button>
      {options.map((option) => {
        const isActive = value.has(option.key);
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(toggleKey(value, option.key))}
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
