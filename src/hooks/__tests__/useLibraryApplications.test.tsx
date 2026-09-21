import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import { ToastProvider } from "@/components/ui/Toast";
import { useApplicationTransition, type ApplicationsPage } from "@/hooks/useLibraryApplications";
import type { LibraryApplicationWithEmployer } from "@/lib/api/entity-types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/http/client")>()), apiFetch }));

function application(id: string, status: LibraryApplicationWithEmployer["status"]): LibraryApplicationWithEmployer {
  return {
    id,
    user_id: "u",
    employer_id: "e",
    title: `Role ${id}`,
    job_url: null,
    normalized_job_url: null,
    location: null,
    work_mode: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    tech_stack: [],
    date_found: "2026-09-01",
    status,
    status_changed_at: "2026-09-01T00:00:00.000Z",
    notes: "",
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    employer: { id: "e", name: "Acme" },
  };
}

const boardKey = libraryKeys.applications({ limit: 100 });
const page = (): ApplicationsPage => ({ rows: [application("a1", "applied"), application("a2", "interested")], meta: { total: 2, page: 1, limit: 100 } });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(boardKey, page());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useApplicationTransition(), { wrapper });
  return { client, ...view };
}

const statusOf = (client: QueryClient, id: string) => client.getQueryData<ApplicationsPage>(boardKey)?.rows.find((row) => row.id === id)?.status;

describe("useApplicationTransition", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("moves the card in the cached board immediately, before the server answers", async () => {
    let resolve!: (value: unknown) => void;
    apiFetch.mockImplementation(() => new Promise((res) => (resolve = res)));
    const { client, result } = setup();

    act(() => result.current.mutate({ id: "a1", to: "interviewing" }));
    await waitFor(() => expect(statusOf(client, "a1")).toBe("interviewing"));
    expect(statusOf(client, "a2")).toBe("interested"); // other cards untouched
    expect(client.getQueryData<ApplicationsPage>(boardKey)?.rows[0].status_changed_at).not.toBe("2026-09-01T00:00:00.000Z");

    resolve({ data: application("a1", "interviewing") });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith("/api/library/applications/a1/transition", { method: "POST", body: { to: "interviewing" } });
  });

  it("rolls the card back to its original column when the server refuses", async () => {
    // A stalled refetch keeps onSettled's invalidation from replacing the rolled-back cache with server data.
    apiFetch.mockRejectedValueOnce(new ApiError("Cannot move", 400));
    const { client, result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ id: "a1", to: "offer" }).catch(() => undefined);
    });
    expect(result.current.isError).toBe(true);
    expect(statusOf(client, "a1")).toBe("applied");
    expect(client.getQueryData<ApplicationsPage>(boardKey)?.rows[0].status_changed_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("invalidates the Library cache once settled so the server's status_changed_at wins", async () => {
    apiFetch.mockResolvedValueOnce({ data: application("a1", "offer") });
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ id: "a1", to: "offer" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryKeys.all });
  });
});
