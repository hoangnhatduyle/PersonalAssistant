import { fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PipelineBoard } from "@/components/library/PipelineBoard";
import { application } from "@/components/library/__tests__/fixtures";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useLibraryApplications", () => ({ useApplicationTransition: () => ({ mutate }) }));

// Capture DndContext's props so a drop can be simulated without a real pointer.
interface DndProps {
  children: ReactNode;
  onDragStart: (event: { active: { id: string } }) => void;
  onDragEnd: (event: { active: { id: string }; over: { id: string } | null }) => void;
  accessibility: { announcements: Record<string, (event: { active: { id: string }; over: { id: string } | null }) => string>; screenReaderInstructions: { draggable: string } };
}
const dnd = vi.hoisted(() => ({ props: null as unknown as DndProps }));
vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dnd-kit/core")>()),
  DndContext: (props: DndProps) => {
    dnd.props = props;
    return <>{props.children}</>;
  },
}));

const apps = [
  application("a1", { title: "Frontend", status: "applied", status_changed_at: "2026-09-15T00:00:00.000Z" }),
  application("a2", { title: "Backend", status: "applied", status_changed_at: "2026-09-18T00:00:00.000Z" }),
  application("a3", { title: "SRE", status: "offer", employer: { id: "e2", name: "Globex" } }),
  application("a4", { title: "Intern", status: "rejected" }),
];

describe("PipelineBoard", () => {
  beforeEach(() => {
    mutate.mockReset();
  });

  it("renders one lane per status with its applications and a count", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    for (const name of ["Interested", "Applied", "Interviewing", "Offer", "Rejected", "Withdrawn"]) {
      expect(screen.getByRole("region", { name: `${name} applications` })).toBeInTheDocument();
    }
    const applied = screen.getByRole("region", { name: "Applied applications" });
    expect(within(applied).getByText("2")).toBeInTheDocument();
    expect(within(applied).getByText("Frontend")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Offer applications" })).getByText("Globex")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Interviewing applications" })).getByText("Drop here")).toBeInTheDocument();
  });

  it("orders a lane by most recently moved", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    const applied = screen.getByRole("region", { name: "Applied applications" });
    const titles = within(applied).getAllByText(/Frontend|Backend/).map((node) => node.textContent);
    expect(titles).toEqual(["Backend", "Frontend"]);
  });

  it("the card's status select moves it through the transition hook (non-drag fallback)", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    fireEvent.change(screen.getByLabelText("Status for Frontend at Acme"), { target: { value: "interviewing" } });
    expect(mutate).toHaveBeenCalledWith({ id: "a1", to: "interviewing" });
  });

  it("choosing the current status does nothing", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    fireEvent.change(screen.getByLabelText("Status for Frontend at Acme"), { target: { value: "applied" } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("dropping a card on another lane calls the transition hook", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    dnd.props.onDragEnd({ active: { id: "a1" }, over: { id: "offer" } });
    expect(mutate).toHaveBeenCalledWith({ id: "a1", to: "offer" });
  });

  it("ignores a drop on its own lane, outside any lane, or on a non-status target", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    dnd.props.onDragEnd({ active: { id: "a1" }, over: { id: "applied" } });
    dnd.props.onDragEnd({ active: { id: "a1" }, over: null });
    dnd.props.onDragEnd({ active: { id: "a1" }, over: { id: "some-card" } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("announces moves to screen readers with role, employer and stage names", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    const { announcements, screenReaderInstructions } = dnd.props.accessibility;
    expect(announcements.onDragStart({ active: { id: "a1" }, over: null })).toBe("Picked up Frontend at Acme.");
    expect(announcements.onDragOver({ active: { id: "a1" }, over: { id: "interviewing" } })).toBe("Frontend at Acme is over the Interviewing stage.");
    expect(announcements.onDragEnd({ active: { id: "a1" }, over: { id: "offer" } })).toBe("Frontend at Acme was dropped in the Offer stage.");
    expect(announcements.onDragEnd({ active: { id: "a1" }, over: null })).toBe("Frontend at Acme was dropped.");
    expect(screenReaderInstructions.draggable).toMatch(/arrow keys/);
  });

  it("gives every card a keyboard drag handle and links the card to its employer", () => {
    renderWithProviders(<PipelineBoard applications={apps} />);
    expect(screen.getByRole("button", { name: "Move Frontend at Acme" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Globex/ })).toHaveAttribute("href", "/library/employers/e2");
  });
});
