"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/courses", label: "Courses" },
  { href: "/courses/deadlines", label: "Deadlines" },
  { href: "/board", label: "Boards" },
];

const matchesTab = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Segmented tab switcher for the Workload section — styling mirrors PersonFilterToggle's pill-button treatment. */
export function CourseSectionTabs() {
  const pathname = usePathname();
  // Longest matching href wins so /courses/deadlines doesn't also light up
  // the /courses tab (segment-boundary matching alone can't tell those apart
  // since /courses/deadlines starts with "/courses/").
  const activeHref = [...TABS].sort((a, b) => b.href.length - a.href.length).find((tab) => matchesTab(pathname, tab.href))?.href;

  return (
    <div role="tablist" aria-label="Workload section" className="inline-flex gap-1 rounded-full border border-panel-border bg-panel p-1">
      {TABS.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide transition-colors ${
              isActive ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
