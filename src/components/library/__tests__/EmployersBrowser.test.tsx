import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { EmployersBrowser } from "@/components/library/EmployersBrowser";
import { application, employer } from "@/components/library/__tests__/fixtures";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/library/employers",
  useSearchParams: () => new URLSearchParams(search),
}));

const useLibraryEmployers = vi.fn();
const useLibraryApplications = vi.fn();
vi.mock("@/hooks/useLibraryEmployers", () => ({
  useLibraryEmployers: (filters: unknown, options: unknown) => useLibraryEmployers(filters, options),
  useCreateLibraryEmployer: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useLibraryApplications", () => ({
  useLibraryApplications: (filters: unknown) => useLibraryApplications(filters),
  useCreateLibraryApplication: () => ({ mutateAsync: vi.fn() }),
  useApplicationTransition: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/library/PipelineBoard", () => ({
  PipelineBoard: ({ applications }: { applications: unknown[] }) => <div>board with {applications.length} applications</div>,
}));
vi.mock("@/components/library/EmployerForm", () => ({ EmployerForm: () => <div>employer form</div> }));
vi.mock("@/components/library/ApplicationForm", () => ({ ApplicationForm: () => <div>role form</div> }));

const ok = (rows: unknown[], total = rows.length) => ({ data: { rows, meta: { total, page: 1, limit: 12 } }, isLoading: false, isError: false, isPlaceholderData: false });

describe("EmployersBrowser", () => {
  beforeEach(() => {
    search = "";
    replace.mockClear();
    useLibraryEmployers.mockReset().mockReturnValue(ok([]));
    useLibraryApplications.mockReset().mockReturnValue(ok([]));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the first-run empty state", () => {
    renderWithProviders(<EmployersBrowser />);
    expect(screen.getByText("No employers yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first employer" })).toBeInTheDocument();
  });

  it("shows a filtered-empty state with a clear action when filters yield nothing", () => {
    search = "q=zzz";
    renderWithProviders(<EmployersBrowser />);
    expect(screen.getByText("No employers match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(replace).toHaveBeenCalledWith("/library/employers", { scroll: false });
  });

  it("lists employers and only fetches them in the list view", () => {
    useLibraryEmployers.mockReturnValue(ok([employer({ id: "e1", name: "Acme Corp" }), employer({ id: "e2", name: "Globex" })]));
    renderWithProviders(<EmployersBrowser />);
    expect(screen.getByRole("link", { name: "Acme Corp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Globex" })).toBeInTheDocument();
    expect(useLibraryEmployers).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 12 }), { enabled: true });
  });

  it("debounces the search box into the URL's q", () => {
    vi.useFakeTimers();
    renderWithProviders(<EmployersBrowser />);
    fireEvent.change(screen.getByLabelText("Search employers"), { target: { value: "acme" } });
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledWith("/library/employers?q=acme", { scroll: false });
  });

  it("the funnel legend filters by status via the URL", () => {
    useLibraryApplications.mockReturnValue(ok([application("a1", { status: "applied" })]));
    renderWithProviders(<EmployersBrowser />);
    fireEvent.click(screen.getByRole("button", { name: /Applied/ }));
    expect(replace).toHaveBeenCalledWith("/library/employers?status=applied", { scroll: false });
  });

  it("switching to Board sets ?view=board; the board view renders the pipeline and skips the employers query", () => {
    const { unmount } = renderWithProviders(<EmployersBrowser />);
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(replace).toHaveBeenCalledWith("/library/employers?view=board", { scroll: false });
    unmount();

    search = "view=board";
    useLibraryApplications.mockReturnValue(ok([application("a1"), application("a2")]));
    renderWithProviders(<EmployersBrowser />);
    expect(screen.getByText("board with 2 applications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
    expect(useLibraryEmployers).toHaveBeenLastCalledWith(expect.anything(), { enabled: false });
    expect(screen.queryByLabelText("Search employers")).not.toBeInTheDocument();
  });

  it("an empty board explains itself", () => {
    search = "view=board";
    renderWithProviders(<EmployersBrowser />);
    expect(screen.getByText("Your pipeline is empty")).toBeInTheDocument();
  });

  it("opens the add-employer and add-role dialogs", () => {
    renderWithProviders(<EmployersBrowser />);
    fireEvent.click(screen.getByRole("button", { name: "Add employer" }));
    expect(screen.getByText("employer form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(screen.getByText("role form")).toBeInTheDocument();
  });
});
