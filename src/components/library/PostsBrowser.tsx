"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLibraryPosts, useLibraryTags } from "@/hooks/useLibraryPosts";
import { CreatePostDialog } from "@/components/library/CreatePostDialog";
import { PostCard } from "@/components/library/PostCard";
import { PostFilters } from "@/components/library/PostFilters";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { parseLibraryPostFilters, serializeLibraryPostFilters, type LibraryPostFilters } from "@/lib/library/filters";

export const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 12;

function hasActiveFilters(filters: LibraryPostFilters): boolean {
  return Boolean(filters.q || filters.platform || filters.favorite || filters.tags?.length || filters.personId || filters.courseId || filters.employerId || (filters.archived && filters.archived !== "exclude"));
}

/**
 * Container for the Library's Posts tab. Filter/search/page state lives in
 * the URL so it survives reloads and back-navigation from a post's page;
 * the search box keeps its own text and commits to `q` after a short pause.
 */
export function PostsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlFilters = useMemo(() => parseLibraryPostFilters(searchParams), [searchParams]);
  const [isCreateOpen, setCreateOpen] = useState(false);

  // The box owns its text while typing (adopting the URL's `q` mid-typing would eat keystrokes that arrive during the navigation);
  // it is seeded from the URL on mount, which covers reloads and back-navigation from a post's page.
  const [searchText, setSearchText] = useState(urlFilters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // router.replace lands a beat after the click: a second change in that window (a fast double-click, a
  // keystroke while a chip toggle is in flight) must build on the filters we just requested, not on the
  // stale URL. `pendingRef` holds the last requested filters until the URL catches up.
  const pendingRef = useRef<LibraryPostFilters | null>(null);
  const urlFiltersRef = useRef(urlFilters);
  useEffect(() => {
    urlFiltersRef.current = urlFilters;
    pendingRef.current = null;
  }, [urlFilters]);
  const currentFilters = () => pendingRef.current ?? urlFiltersRef.current;

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const filters: LibraryPostFilters = { ...urlFilters, limit: PAGE_SIZE };
  const { data, isLoading, isError, isPlaceholderData } = useLibraryPosts(filters);
  const { data: tagCounts } = useLibraryTags();

  const navigate = (next: LibraryPostFilters) => {
    pendingRef.current = next;
    const query = serializeLibraryPostFilters({ ...next, limit: undefined }).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const applyFilters = (patch: Partial<LibraryPostFilters>) => navigate({ ...currentFilters(), page: undefined, ...patch });

  const handleSearchText = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Built at fire time: another filter may have changed since the keystroke.
      navigate({ ...currentFilters(), page: undefined, q: text.trim() || undefined });
    }, SEARCH_DEBOUNCE_MS);
  };

  const rows = data?.rows ?? [];
  const total = data?.meta?.total ?? 0;
  const page = data?.meta?.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = hasActiveFilters(urlFilters);

  return (
    <div className="library-atmosphere flex flex-col gap-5 rounded-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Library</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Saved posts</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Save a post</Button>
      </div>

      <PostFilters filters={urlFilters} searchText={searchText} onSearchTextChange={handleSearchText} onChange={applyFilters} tags={tagCounts ?? []} />

      {urlFilters.employerId && (
        <p className="flex items-center gap-2 font-mono text-xs text-text-secondary">
          Showing posts linked to one employer
          <Button variant="secondary" size="sm" onClick={() => applyFilters({ employerId: undefined })}>
            Clear employer filter
          </Button>
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-72 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="Could not load your library" description="Check your connection and try again." />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No posts match"
            description="Try a different search or clear some filters."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setSearchText(""); navigate({}); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nothing saved yet"
            description="Keep the Facebook and Instagram posts worth coming back to — add a link, your own notes and screenshots."
            action={<Button onClick={() => setCreateOpen(true)}>Save your first post</Button>}
          />
        )
      ) : (
        <div className={`grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}>
          {rows.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        rangeStart={(page - 1) * PAGE_SIZE + 1}
        rangeEnd={Math.min(page * PAGE_SIZE, total)}
        onPageChange={(next) => navigate({ ...currentFilters(), page: next })}
        itemLabel="posts"
      />

      <CreatePostDialog open={isCreateOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
