import type {
  LibraryApplication,
  LibraryApplicationEvent,
  LibraryApplicationSummary,
  LibraryApplicationWithEmployer,
  LibraryEmployer,
  LibraryEmployerContact,
  LibraryEmployerDetail,
  LibraryEmployerListItem,
  LibraryInterview,
  LibraryInterviewWithPerson,
  LibraryPost,
  LibraryTimelineEntry,
  PersonRow,
} from "@/lib/api/entity-types";
import type { ContactKind } from "@/lib/library/constants";

// PostgREST does not filter soft-deleted parents out of embeds, and a to-one
// embed hidden by RLS / a filter comes back null — so every mapper here drops
// them explicitly (Library deliberately leaves soft_delete_person_cascade
// alone; see link-mapper.ts).

type PersonEmbed = Pick<PersonRow, "id" | "name" | "deleted_at">;
type ContactEmbed = { kind: ContactKind; note: string; person: PersonEmbed | null };
type ApplicationSummaryEmbed = LibraryApplicationSummary & { deleted_at: string | null };

/** Raw shape of the employers list query: live-filtering happens here, not in PostgREST. */
export type EmployerListRow = LibraryEmployer & {
  library_applications?: ApplicationSummaryEmbed[] | null;
  library_employer_contacts?: ContactEmbed[] | null;
};

export type EmployerDetailRow = LibraryEmployer & {
  library_applications?: LibraryApplication[] | null;
  library_employer_contacts?: ContactEmbed[] | null;
  library_post_employers?: { post: Pick<LibraryPost, "id" | "title" | "platform" | "deleted_at"> | null }[] | null;
};

/** Most recently moved first: what an employer row / detail should lead with. */
const byStatusChangedDesc = (a: { status_changed_at: string }, b: { status_changed_at: string }) =>
  b.status_changed_at.localeCompare(a.status_changed_at);

function mapContacts(contacts: ContactEmbed[] | null | undefined): LibraryEmployerContact[] {
  return (contacts ?? []).flatMap(({ kind, note, person }) =>
    person && person.deleted_at === null ? [{ person: { id: person.id, name: person.name }, kind, note }] : [],
  );
}

export function mapEmployerListRow(row: EmployerListRow): LibraryEmployerListItem {
  const { library_applications, library_employer_contacts, ...employer } = row;
  // `match` is the status-filter alias embed (see listEmployers); it must not leak into the response.
  delete (employer as { match?: unknown }).match;

  const applications = (library_applications ?? [])
    .filter((application) => application.deleted_at === null)
    .sort(byStatusChangedDesc)
    .map(({ id, title, status, status_changed_at }) => ({ id, title, status, status_changed_at }));

  return { ...employer, applications, contacts: mapContacts(library_employer_contacts) };
}

export function mapEmployerDetailRow(row: EmployerDetailRow): LibraryEmployerDetail {
  const { library_applications, library_employer_contacts, library_post_employers, ...employer } = row;

  const applications = (library_applications ?? []).filter((application) => application.deleted_at === null).sort(byStatusChangedDesc);
  const posts = (library_post_employers ?? []).flatMap(({ post }) =>
    post && post.deleted_at === null ? [{ id: post.id, title: post.title, platform: post.platform }] : [],
  );

  return { ...employer, applications, contacts: mapContacts(library_employer_contacts), posts };
}

/** Null when the parent employer is soft-deleted or hidden — the caller drops the application. */
export function mapApplicationWithEmployer(
  row: LibraryApplication & { employer: Pick<LibraryEmployer, "id" | "name" | "deleted_at"> | null },
): LibraryApplicationWithEmployer | null {
  const { employer, ...application } = row;
  if (!employer || employer.deleted_at !== null) return null;
  return { ...application, employer: { id: employer.id, name: employer.name } };
}

export function mapInterviewRow(row: LibraryInterview & { interviewer?: PersonEmbed | null }): LibraryInterviewWithPerson {
  const { interviewer, ...interview } = row;
  return {
    ...interview,
    interviewer: interviewer && interviewer.deleted_at === null ? { id: interviewer.id, name: interviewer.name } : null,
  };
}

/**
 * One chronological rail for an application: the DB-written status events
 * plus the interview log. An interview sits at its scheduled time, or where
 * it was logged when unscheduled. Ties: status changes before interviews.
 */
export function buildTimeline(
  events: readonly LibraryApplicationEvent[],
  interviews: readonly LibraryInterviewWithPerson[],
): LibraryTimelineEntry[] {
  const entries: LibraryTimelineEntry[] = [
    ...events.map((event): LibraryTimelineEntry => ({
      type: "status",
      id: event.id,
      at: event.created_at,
      from_status: event.from_status,
      to_status: event.to_status,
    })),
    ...interviews.map((interview): LibraryTimelineEntry => ({
      type: "interview",
      id: interview.id,
      at: interview.scheduled_at ?? interview.created_at,
      interview,
    })),
  ];

  const rank = (entry: LibraryTimelineEntry) => (entry.type === "status" ? 0 : 1);
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || rank(a) - rank(b) || a.id.localeCompare(b.id));
}
