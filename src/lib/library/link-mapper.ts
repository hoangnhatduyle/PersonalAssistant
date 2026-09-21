import type { CourseRow, LibraryEmployer, LibraryPost, LibraryPostImage, LibraryPostWithRelations, PersonRow } from "@/lib/api/entity-types";

type PersonEmbed = Pick<PersonRow, "id" | "name" | "deleted_at">;
type CourseEmbed = Pick<CourseRow, "id" | "name" | "code" | "deleted_at">;
type EmployerEmbed = Pick<LibraryEmployer, "id" | "name" | "deleted_at">;

/**
 * The raw row shape returned by the posts query's embeds. To-one embeds
 * (person/course) come back `null` when RLS or a filter hides them, and
 * soft-deleted parents are NOT filtered by PostgREST — so the mapper drops
 * them explicitly. (Library deliberately does not touch
 * soft_delete_person_cascade / soft_delete_course_cascade.)
 */
export type LibraryPostRow = LibraryPost & {
  images?: LibraryPostImage[] | null;
  library_post_people?: { person: PersonEmbed | null }[] | null;
  library_post_courses?: { course: CourseEmbed | null }[] | null;
  library_post_employers?: { employer: EmployerEmbed | null }[] | null;
};

export function mapPostRow(row: LibraryPostRow): LibraryPostWithRelations {
  const { images, library_post_people, library_post_courses, library_post_employers, ...post } = row;

  const liveImages = (images ?? [])
    .filter((image) => image.deleted_at === null)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));

  const people = (library_post_people ?? []).flatMap(({ person }) =>
    person && person.deleted_at === null ? [{ id: person.id, name: person.name }] : [],
  );
  const courses = (library_post_courses ?? []).flatMap(({ course }) =>
    course && course.deleted_at === null ? [{ id: course.id, name: course.name, code: course.code }] : [],
  );

  const employers = (library_post_employers ?? []).flatMap(({ employer }) =>
    employer && employer.deleted_at === null ? [{ id: employer.id, name: employer.name }] : [],
  );

  return { ...post, images: liveImages, people, courses, employers };
}
