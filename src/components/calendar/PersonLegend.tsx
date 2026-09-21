import type { PersonRow } from "@/lib/api/entity-types";
import type { PersonFilterSelection } from "@/components/calendar/PersonFilterToggle";

type Props = {
  people: PersonRow[];
  /** When set, only people currently selected in the PersonFilterToggle get a legend entry. */
  selection?: PersonFilterSelection;
};

/**
 * One hex-colored swatch per tracked Person (People feature) — shared by
 * CalendarLegend and any other list that color-codes rows by person. Renders
 * as a fragment (no wrapping element) so callers compose it inside their own
 * `flex flex-wrap` container alongside other legend entries.
 */
export function PersonLegend({ people, selection }: Props) {
  const visible = selection ? people.filter((person) => selection.has(person.id)) : people;
  return (
    <>
      {visible.map((person) => (
        <span key={person.id} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: person.color }} />
          {person.name}
        </span>
      ))}
    </>
  );
}
