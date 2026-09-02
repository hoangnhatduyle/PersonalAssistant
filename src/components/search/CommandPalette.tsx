"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/http/client";
import type { SearchResult } from "@/app/api/search/route";

const TYPE_ICON: Record<SearchResult["type"], string> = {
  course: "C",
  deadline: "D",
  task: "T",
  note: "N",
};

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  course: "Course",
  deadline: "Deadline",
  task: "Task",
  note: "Note",
};

const TYPE_COLOR: Record<SearchResult["type"], string> = {
  course: "bg-accent-teal/20 text-accent-teal",
  deadline: "bg-status-urgent/20 text-status-urgent",
  task: "bg-accent-indigo/20 text-accent-indigo",
  note: "bg-accent-violet/20 text-accent-violet",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResults(data);
          setActiveIndex(0);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex].href);
    } else if (e.key === "Escape") {
      close();
    }
  };

  if (!open) return null;

  const grouped = new Map<SearchResult["type"], SearchResult[]>();
  for (const result of results) {
    const group = grouped.get(result.type) ?? [];
    group.push(result);
    grouped.set(result.type, group);
  }

  let flatIndex = 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-bg-void/80 backdrop-blur-sm" aria-hidden="true" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-panel border border-panel-border bg-bg-void-elevated shadow-panel"
      >
        <div className="flex items-center gap-3 border-b border-panel-border px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 shrink-0 text-text-secondary"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search courses, deadlines, tasks, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-panel-border px-1.5 py-0.5 font-mono text-[10px] text-text-secondary sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">Searching…</div>
          )}

          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">No results found.</div>
          )}

          {query.trim().length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">
              Type at least 2 characters to search.
            </div>
          )}

          {Array.from(grouped.entries()).map(([type, items]) => (
            <div key={type}>
              <div className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">
                {TYPE_LABEL[type]}s
              </div>
              {items.map((result) => {
                const idx = flatIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => navigate(result.href)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? "bg-panel/60" : "hover:bg-panel/30"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold ${TYPE_COLOR[result.type]}`}
                    >
                      {TYPE_ICON[result.type]}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-text-primary">{result.title}</span>
                      {result.subtitle && (
                        <span className="truncate font-mono text-xs text-text-secondary">{result.subtitle}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-panel-border px-4 py-2">
          <span className="font-mono text-[10px] text-text-secondary">
            {results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-panel-border px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">↑↓</kbd>
            <span className="font-mono text-[10px] text-text-secondary">navigate</span>
            <kbd className="rounded border border-panel-border px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">↵</kbd>
            <span className="font-mono text-[10px] text-text-secondary">open</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
