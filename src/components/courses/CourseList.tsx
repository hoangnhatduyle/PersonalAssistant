import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard } from "@/components/courses/CourseCard";
import type { CourseWorkloadPreview } from "@/lib/courses/course-workload";
import type { CourseRow, PersonRow } from "@/lib/api/entity-types";

type Props = {
  courses: CourseRow[];
  people?: PersonRow[];
  /** The account owner's chosen color — applied to their own (person_id null) courses. */
  ownerColor?: string | null;
  previewByCourseId?: Map<string, CourseWorkloadPreview>;
};

export function CourseList({ courses, people = [], ownerColor = null, previewByCourseId }: Props) {
  if (courses.length === 0) {
    return <EmptyState title="No courses yet" description="Add a course to start tracking its deadlines." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => {
        const person = course.person_id ? people.find((candidate) => candidate.id === course.person_id) : undefined;
        const preview = previewByCourseId?.get(course.id);
        if (person) return <CourseCard key={course.id} course={course} personName={person.name} personColor={person.color} preview={preview} />;
        return (
          <CourseCard
            key={course.id}
            course={course}
            personName={ownerColor ? "Mine" : undefined}
            personColor={ownerColor ?? undefined}
            preview={preview}
          />
        );
      })}
    </div>
  );
}
