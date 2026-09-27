import type { ReactNode } from "react";
import { CourseSectionTabs } from "@/components/courses/CourseSectionTabs";

/**
 * Route group (list), not a URL segment: wraps only the Board list (/board)
 * with the Workload tab switcher, while /board/[id]'s detail page — a
 * sibling outside this group — stays unwrapped, matching how
 * /courses/(workload) keeps /courses/[id] unwrapped.
 */
export default function BoardListLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <CourseSectionTabs />
      {children}
    </div>
  );
}
