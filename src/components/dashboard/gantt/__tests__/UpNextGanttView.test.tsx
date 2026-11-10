import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { UpNextGanttView } from "@/components/dashboard/gantt/UpNextGanttView";
import { buildUpcomingItems } from "@/lib/dashboard/upcoming-items";
import { makeAppointment, makeDeadline, makeTask } from "@/lib/dashboard/__tests__/fixtures";
import type { GanttRow } from "@/lib/dashboard/gantt-rows";

// The chart library needs a real browser (canvas, layout). It has its own spike/e2e coverage, so here
// next/dynamic resolves to a stand-in that exposes the rows the view computed and lets a test "click" one.
vi.mock("next/dynamic", () => ({
  default: () =>
    function ChartStub({ rows, onOpenRow }: { rows: GanttRow[]; onOpenRow: (rowId: string) => void }) {
      return (
        <ul data-testid="chart">
          {rows.map((row) => (
            <li key={row.id}>
              <button onClick={() => onOpenRow(row.id)}>{`${row.kind}:${row.title}:${row.percent ?? "none"}`}</button>
            </li>
          ))}
        </ul>
      );
    },
}));

const checklistSummary = vi.hoisted(() => ({ data: [] as Array<{ task_id: string; done: number; total: number }> }));
vi.mock("@/hooks/useChecklistItems", () => ({ useChecklistSummary: () => checklistSummary }));

const NOW = new Date(2026, 0, 10, 12, 0, 0);
const at = (days: number, hours = 0) => new Date(2026, 0, 10 + days, hours);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  checklistSummary.data = [];
});
afterEach(() => vi.useRealTimers());

function renderView(overrides: Partial<Parameters<typeof UpNextGanttView>[0]> = {}) {
  const deadlines = overrides.deadlines ?? [];
  const tasks = overrides.tasks ?? [];
  const appointments = overrides.appointments ?? [];
  const onOpen = vi.fn();
  renderWithProviders(
    <UpNextGanttView
      items={buildUpcomingItems({ deadlines, tasks, appointments })}
      deadlines={deadlines}
      tasks={tasks}
      appointments={appointments}
      window="all"
      now={NOW}
      onOpen={onOpen}
      {...overrides}
    />,
  );
  return { onOpen };
}

describe("UpNextGanttView", () => {
  it("draws a bar for each deadline and task with its resolved progress", () => {
    const deadline = makeDeadline({ id: "d-1", title: "Essay", created_at: at(-3).toISOString(), due_at: at(4).toISOString(), progress_percent: 40 });
    const task = makeTask({ id: "t-1", title: "Read paper", created_at: at(-2).toISOString(), due_at: at(2).toISOString() });
    checklistSummary.data = [{ task_id: "t-1", done: 3, total: 4 }];
    renderView({ deadlines: [deadline], tasks: [task] });

    expect(screen.getByRole("button", { name: "task:Read paper:75" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "deadline:Essay:40" })).toBeInTheDocument();
  });

  it("reports which item was clicked, by kind and its own id", () => {
    const deadline = makeDeadline({ id: "d-1", title: "Essay", created_at: at(-3).toISOString(), due_at: at(4).toISOString() });
    const task = makeTask({ id: "t-1", title: "Read paper", created_at: at(-2).toISOString(), due_at: at(2).toISOString() });
    const session = makeAppointment({ id: "s-1", title: "Draft", deadline_id: "d-1", date: "2026-01-11", time: "10:00", duration_minutes: 60, session_status: "planned" });
    const { onOpen } = renderView({ deadlines: [deadline], tasks: [task], appointments: [session] });

    fireEvent.click(screen.getByRole("button", { name: /^deadline:Essay/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "deadline", id: "d-1" });
    fireEvent.click(screen.getByRole("button", { name: /^task:Read paper/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "task", id: "t-1" });
    fireEvent.click(screen.getByRole("button", { name: /^session:Draft/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "session", id: "s-1" });
  });

  it("explains itself when only events are due, since events get no bar", () => {
    const event = makeAppointment({ id: "e-1", title: "Dentist", category: "Personal", deadline_id: null, session_status: null, event_status: "planned", date: "2026-01-11", time: "10:00" });
    renderView({ appointments: [event] });

    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    expect(screen.getByText(/nothing to chart/i)).toBeInTheDocument();
  });

  it("shows a legend for the bar colours and the progress fill", () => {
    const deadline = makeDeadline({ id: "d-1", title: "Essay", created_at: at(-3).toISOString(), due_at: at(4).toISOString() });
    renderView({ deadlines: [deadline] });

    const legend = screen.getByRole("list", { name: "Chart legend" });
    for (const label of ["Deadline", "Task", "Session", "Overdue", "Fill = progress"]) expect(legend).toHaveTextContent(label);
  });
});
