import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard } from "@/components/courses/CourseCard";
import type { CourseRow, PersonRow } from "@/lib/api/entity-types";

type Props = {
  courses: CourseRow[];
  people?: PersonRow[];
};

export function CourseList({ courses, people = [] }: Props) {
  if (courses.length === 0) {
    return <EmptyState title="No courses yet" description="Add a course to start tracking its deadlines." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => {
        const person = course.person_id ? people.find((candidate) => candidate.id === course.person_id) : undefined;
        return <CourseCard key={course.id} course={course} personName={person?.name} personColor={person?.color} />;
      })}
    </div>
  );
}
