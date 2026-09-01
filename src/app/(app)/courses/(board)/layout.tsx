import type { ReactNode } from "react";
import { CourseSectionTabs } from "@/components/courses/CourseSectionTabs";

/**
 * Route group (board), not a URL segment: wraps only the Courses list and
 * To-Do board (/courses, /courses/todos) with the tab switcher, while
 * /courses/[id]'s detail page — a sibling outside this group — stays
 * unwrapped, since a per-course detail view has nothing to switch between.
 */
export default function CoursesBoardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <CourseSectionTabs />
      {children}
    </div>
  );
}
