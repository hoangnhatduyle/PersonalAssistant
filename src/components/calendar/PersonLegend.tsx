import type { PersonRow } from "@/lib/api/entity-types";

type Props = {
  people: PersonRow[];
};

/**
 * One hex-colored swatch per tracked Person (People feature) — shared by
 * CalendarLegend and any other list that color-codes rows by person. Renders
 * as a fragment (no wrapping element) so callers compose it inside their own
 * `flex flex-wrap` container alongside other legend entries.
 */
export function PersonLegend({ people }: Props) {
  return (
    <>
      {people.map((person) => (
        <span key={person.id} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: person.color }} />
          {person.name}
        </span>
      ))}
    </>
  );
}
