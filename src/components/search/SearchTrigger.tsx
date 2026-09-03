"use client";

export function SearchTrigger() {
  const handleClick = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Search (Ctrl+K)"
      className="flex items-center gap-2 rounded-control border border-panel-border bg-bg-void px-3 py-1.5 text-text-secondary transition-colors hover:border-panel-border-hover hover:text-text-primary"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <span className="hidden text-xs sm:inline">Search</span>
      <kbd className="hidden rounded border border-panel-border px-1 py-0.5 font-mono text-[10px] sm:inline">
        Ctrl+K
      </kbd>
    </button>
  );
}
