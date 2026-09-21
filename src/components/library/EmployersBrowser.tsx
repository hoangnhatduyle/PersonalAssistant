"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApplicationForm } from "@/components/library/ApplicationForm";
import { EmployerCard } from "@/components/library/EmployerCard";
import { EmployerForm } from "@/components/library/EmployerForm";
import { PipelineBoard } from "@/components/library/PipelineBoard";
import { PipelineFunnel } from "@/components/library/PipelineFunnel";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCreateLibraryApplication, useLibraryApplications } from "@/hooks/useLibraryApplications";
import { useCreateLibraryEmployer, useLibraryEmployers } from "@/hooks/useLibraryEmployers";
import { funnelCounts } from "@/lib/library/application-status";
import type { ArchivedMode, EmployerView } from "@/lib/library/constants";
import { parseEmployerFilters, serializeEmployerFilters, type LibraryEmployerFilters } from "@/lib/library/employer-filters";
import type { LibraryApplicationPayload, LibraryEmployerPayload } from "@/lib/api/library-schemas";

export const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 12;
/** The funnel and the board share one applications query (the API's max page). */
const BOARD_LIMIT = 100;

const VIEWS: { value: EmployerView; label: string }[] = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

const hasActiveFilters = (filters: LibraryEmployerFilters) =>
  Boolean(filters.q || filters.status || (filters.archived && filters.archived !== "exclude"));

/**
 * Container for the Library's Employers tab: a paginated list or the
 * drag-and-drop pipeline board (`?view=list|board`), under one funnel bar.
 * Search/status/archived/page/view live in the URL (like the Posts tab); the
 * search box keeps its own text and commits to `q` after a short pause.
 */
export function EmployersBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const urlFilters = useMemo(() => parseEmployerFilters(searchParams), [searchParams]);
  const view: EmployerView = urlFilters.view ?? "list";
  const [isEmployerOpen, setEmployerOpen] = useState(false);
  const [isRoleOpen, setRoleOpen] = useState(false);

  const [searchText, setSearchText] = useState(urlFilters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // router.replace lands a beat after the call: build the next change on the filters just requested, not the stale URL.
  const pendingRef = useRef<LibraryEmployerFilters | null>(null);
  const urlFiltersRef = useRef(urlFilters);
  useEffect(() => {
    urlFiltersRef.current = urlFilters;
    pendingRef.current = null;
  }, [urlFilters]);
  const currentFilters = () => pendingRef.current ?? urlFiltersRef.current;
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const navigate = (next: LibraryEmployerFilters) => {
    pendingRef.current = next;
    const query = serializeEmployerFilters({ ...next, limit: undefined }).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const applyFilters = (patch: Partial<LibraryEmployerFilters>) => navigate({ ...currentFilters(), page: undefined, ...patch });

  const handleSearchText = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ ...currentFilters(), page: undefined, q: text.trim() || undefined }), SEARCH_DEBOUNCE_MS);
  };

  const employers = useLibraryEmployers({ ...urlFilters, limit: PAGE_SIZE }, { enabled: view === "list" });
  const applications = useLibraryApplications({ limit: BOARD_LIMIT });
  const createEmployer = useCreateLibraryEmployer();
  const createApplication = useCreateLibraryApplication();

  const applicationRows = useMemo(() => applications.data?.rows ?? [], [applications.data]);
  const counts = useMemo(() => funnelCounts(applicationRows), [applicationRows]);

  const rows = employers.data?.rows ?? [];
  const total = employers.data?.meta?.total ?? 0;
  const page = employers.data?.meta?.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = hasActiveFilters(urlFilters);

  const handleCreateEmployer = async (values: LibraryEmployerPayload) => {
    const created = await createEmployer.mutateAsync(values);
    showToast("Employer added", "success");
    setEmployerOpen(false);
    router.push(`/library/employers/${created.id}`);
  };

  const handleCreateRole = async (values: LibraryApplicationPayload) => {
    await createApplication.mutateAsync(values);
    showToast("Role added", "success");
    setRoleOpen(false);
  };

  return (
    <div className="library-atmosphere flex flex-col gap-5 rounded-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Library</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Employers</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setRoleOpen(true)}>
            Add role
          </Button>
          <Button onClick={() => setEmployerOpen(true)}>Add employer</Button>
        </div>
      </div>

      <PipelineFunnel counts={counts} activeStatus={view === "list" ? urlFilters.status : undefined} onSelect={view === "list" ? (status) => applyFilters({ status }) : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="View" className="inline-flex gap-1 rounded-full border border-panel-border bg-panel p-1">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => applyFilters({ view: option.value })}
              className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent-indigo ${
                view === option.value ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {view === "list" && (
          <>
            <div className="min-w-[14rem] flex-1">
              <Input type="search" aria-label="Search employers" placeholder="Search names, notes, links…" value={searchText} onChange={(event) => handleSearchText(event.target.value)} />
            </div>
            <div className="w-40">
              <Select aria-label="Archived employers" value={urlFilters.archived ?? "exclude"} onChange={(event) => applyFilters({ archived: event.target.value as ArchivedMode })}>
                <option value="exclude">Hide archived</option>
                <option value="only">Only archived</option>
                <option value="all">Include archived</option>
              </Select>
            </div>
          </>
        )}
      </div>

      {view === "board" ? (
        applications.isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2" aria-busy="true">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-72 w-72 shrink-0" />
            ))}
          </div>
        ) : applications.isError ? (
          <EmptyState title="Could not load your pipeline" description="Check your connection and try again." />
        ) : applicationRows.length === 0 ? (
          <EmptyState title="Your pipeline is empty" description="Add an employer, then track the roles you're eyeing." action={<Button onClick={() => setEmployerOpen(true)}>Add your first employer</Button>} />
        ) : (
          <PipelineBoard applications={applicationRows} />
        )
      ) : employers.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 w-full" />
          ))}
        </div>
      ) : employers.isError ? (
        <EmptyState title="Could not load your employers" description="Check your connection and try again." />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No employers match"
            description="Try a different search or clear the filters."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setSearchText(""); navigate({}); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState title="No employers yet" description="Keep track of who you'd like to work for, the roles you're chasing and where each one stands." action={<Button onClick={() => setEmployerOpen(true)}>Add your first employer</Button>} />
        )
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${employers.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}>
          {rows.map((employer) => (
            <EmployerCard key={employer.id} employer={employer} />
          ))}
        </div>
      )}

      {view === "list" && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          rangeStart={(page - 1) * PAGE_SIZE + 1}
          rangeEnd={Math.min(page * PAGE_SIZE, total)}
          onPageChange={(next) => navigate({ ...currentFilters(), page: next })}
          itemLabel="employers"
        />
      )}

      <Dialog open={isEmployerOpen} onClose={() => setEmployerOpen(false)} title="Add an employer" size="lg">
        <EmployerForm onSubmit={handleCreateEmployer} onCancel={() => setEmployerOpen(false)} submitLabel="Add employer" />
      </Dialog>
      <Dialog open={isRoleOpen} onClose={() => setRoleOpen(false)} title="Add a role" size="lg">
        <ApplicationForm onSubmit={handleCreateRole} onCancel={() => setRoleOpen(false)} submitLabel="Add role" />
      </Dialog>
    </div>
  );
}
