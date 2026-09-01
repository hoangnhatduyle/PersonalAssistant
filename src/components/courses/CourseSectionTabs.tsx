"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/courses", label: "Courses" },
  { href: "/courses/todos", label: "To-Do" },
];

/** Segmented tab switcher for the Courses section — styling mirrors PersonFilterToggle's pill-button treatment. */
export function CourseSectionTabs() {
  const pathname = usePathname();

  return (
    <div role="tablist" aria-label="Courses section" className="inline-flex gap-1 rounded-full border border-panel-border bg-panel p-1">
      {TABS.map((tab) => {
        const isActive = tab.href === "/courses" ? pathname === "/courses" : pathname.startsWith(tab.href);
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
