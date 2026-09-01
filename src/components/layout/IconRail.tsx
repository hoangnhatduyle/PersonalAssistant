"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

type Props = {
  /** Shown in the mobile drawer only — the header hides it below md to avoid crowding. */
  email: string;
};

// Small hand-rolled stroke icons (no icon library dependency for 7 glyphs).
const icons = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  ),
  courses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <path d="M4 6a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" />
      <path d="M4 6v12a2 2 0 0 0 2 2h11" />
    </svg>
  ),
  deadlines: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <path d="m5 12 4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  notes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M9 12h6M9 16h6" strokeLinecap="round" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
    </svg>
  ),
  assistant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <path d="M12 3a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5z" />
      <path d="M6 12v1a6 6 0 0 0 12 0v-1M12 19v2" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: icons.today },
  { href: "/courses", label: "Courses", icon: icons.courses },
  { href: "/deadlines", label: "Deadlines", icon: icons.deadlines },
  { href: "/tasks", label: "Tasks", icon: icons.tasks },
  { href: "/notes", label: "Notes", icon: icons.notes },
  { href: "/calendar", label: "Calendar", icon: icons.calendar },
  { href: "/assistant", label: "Assistant", icon: icons.assistant },
  { href: "/settings", label: "Settings", icon: icons.settings },
];

export function IconRail({ email }: Props) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Route changes (including nav-link taps) should close the mobile drawer
  // rather than leaving it open over the newly navigated page.
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={isMobileOpen}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-control border border-panel-border bg-bg-void-elevated text-text-secondary md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-1 overflow-y-auto border-r border-panel-border bg-bg-void-elevated p-3 transition-transform duration-200 ease-out md:static md:z-auto md:w-56 md:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-between px-2 md:hidden">
          <span className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Menu</span>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-control text-text-secondary hover:bg-panel hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mb-2 flex items-center gap-2 border-b border-panel-border px-2 pb-3 md:hidden">
          <span className="h-2 w-2 shrink-0 rounded-full bg-status-ok" aria-hidden="true" />
          <span className="truncate font-mono text-xs uppercase tracking-wide text-text-eyebrow">Signed in as {email}</span>
        </div>
        {NAV_ITEMS.map((item) => {
          // Segment boundary, not a bare prefix — a future sibling route like
          // /tasks-archive must not falsely highlight the /tasks nav item.
          const isActive = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-accent-indigo/15 text-accent-indigo"
                  : "text-text-secondary hover:bg-panel hover:text-text-primary"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
