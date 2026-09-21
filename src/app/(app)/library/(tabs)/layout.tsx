import type { ReactNode } from "react";
import { LibrarySectionTabs } from "@/components/library/LibrarySectionTabs";

/**
 * Route group (tabs), not a URL segment: wraps the Library's list-style
 * sections with the section switcher, while /library/posts/[id] — a
 * sibling outside this group — stays unwrapped (a detail page has nothing
 * to switch between).
 */
export default function LibraryTabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <LibrarySectionTabs />
      {children}
    </div>
  );
}
