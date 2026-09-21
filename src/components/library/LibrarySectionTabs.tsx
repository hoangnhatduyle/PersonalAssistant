"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/library", label: "Posts" },
  { href: "/library/employers", label: "Employers" },
];

/** Section switcher for the Library. Renders nothing if there is only one section to switch between. */
export function LibrarySectionTabs() {
  const pathname = usePathname();
  if (TABS.length < 2) return null;

  return (
    <nav aria-label="Library sections" className="inline-flex gap-1 rounded-full border border-panel-border bg-panel p-1">
      {TABS.map((tab) => {
        const isActive = tab.href === "/library" ? pathname === "/library" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide transition-colors ${
              isActive ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
