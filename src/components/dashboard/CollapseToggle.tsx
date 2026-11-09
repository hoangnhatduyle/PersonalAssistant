"use client";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  /** Card name, used for the accessible label, e.g. "weekly review". */
  label: string;
};

/** Chevron button that collapses a dashboard card down to its header. */
export function CollapseToggle({ collapsed, onToggle, label }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
      className="flex h-6 w-6 items-center justify-center rounded-control text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-teal"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`transition-transform motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
      >
        <path d="M3 5l4 4 4-4" />
      </svg>
    </button>
  );
}
