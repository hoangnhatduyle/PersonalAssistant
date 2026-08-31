import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard } from "@/components/courses/CourseCard";
import type { CourseRow } from "@/lib/api/entity-types";

type Props = {
  courses: CourseRow[];
};

export function CourseList({ courses }: Props) {
  if (courses.length === 0) {
    return <EmptyState title="No courses yet" description="Add a course to start tracking its deadlines." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}
