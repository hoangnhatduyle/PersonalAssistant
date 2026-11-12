import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { UpNextPanel } from "@/components/dashboard/UpNextPanel";
import { makeDeadline, makeTask } from "@/lib/dashboard/__tests__/fixtures";
import type { GanttOpenTarget } from "@/components/dashboard/gantt/UpNextGanttView";
import type { UpcomingItem } from "@/lib/dashboard/upcoming-items";

// The heavy children have their own tests; here they are stand-ins that expose what the panel hands them.
vi.mock("@/components/dashboard/MailInboxCard", () => ({ MailInboxCard: () => null }));
vi.mock("@/components/dashboard/LongTermTasksCard", () => ({ LongTermTasksCard: () => null }));
vi.mock("@/components/dashboard/gantt/UpNextGanttView", () => ({
  UpNextGanttView: ({ items, window, onOpen }: { items: UpcomingItem[]; window: string; onOpen: (target: GanttOpenTarget) => void }) => (
    <div data-testid="gantt" data-window={window}>
      <span data-testid="gantt-items">{items.map((item) => item.title).join("|")}</span>
      <button onClick={() => onOpen({ kind: "deadline", id: "d-open" })}>open deadline bar</button>
      <button onClick={() => onOpen({ kind: "task", id: "t-open" })}>open task bar</button>
      <button onClick={() => onOpen({ kind: "session", id: "s-open" })}>open session bar</button>
    </div>
  ),
}));
vi.mock("@/components/board/BoardCardDetailDialog", () => ({
  BoardCardDetailDialog: ({ taskId }: { taskId: string | null }) => (taskId ? <div data-testid="task-dialog">{taskId}</div> : null),
}));
vi.mock("@/components/deadlines/DeadlineDetailDialog", () => ({
  DeadlineDetailDialog: ({ deadlineId }: { deadlineId: string | null }) => (deadlineId ? <div data-testid="deadline-dialog">{deadlineId}</div> : null),
}));
vi.mock("@/components/deadlines/SessionEditDialog", () => ({
  SessionEditDialog: ({ sessionId }: { sessionId: string | null }) => (sessionId ? <div data-testid="session-dialog">{sessionId}</div> : null),
}));

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR_MS).toISOString();

const dueSoon = makeDeadline({ id: "d-soon", title: "Due this evening", due_at: inHours(2), created_at: inHours(-48) });
const dueLater = makeTask({ id: "t-later", title: "Due in five days", due_at: new Date(Date.now() + 5 * DAY_MS).toISOString(), created_at: inHours(-48) });

function renderPanel() {
  return renderWithProviders(
    <UpNextPanel deadlines={[dueSoon]} tasks={[dueLater]} people={[]} todoLists={[]} courses={[]} appointments={[]} longTermTasks={[]} />,
  );
}

const filterGroup = () => screen.getByRole("group", { name: "Filter by due date" });
const openGantt = () => fireEvent.click(screen.getByRole("button", { name: "Gantt" }));
const ganttRange = () => screen.getByRole("group", { name: "Gantt range" });

describe("UpNextPanel Gantt dialog", () => {
  it("always shows the list and keeps the Gantt closed until asked", () => {
    renderPanel();
    expect(screen.getAllByText("Due this evening").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Gantt" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument();
  });

  it("opens the Gantt in a dialog and closes it on Escape, leaving the list in place", () => {
    renderPanel();
    openGantt();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("gantt")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument();
    expect(screen.getAllByText("Due this evening").length).toBeGreaterThan(0);
  });

  it("has its own range, defaulting to 7 days, independent of the list filter", () => {
    renderPanel();
    expect(within(filterGroup()).getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");

    openGantt();
    expect(screen.getByTestId("gantt")).toHaveAttribute("data-window", "7days");
    expect(screen.getByTestId("gantt-items")).toHaveTextContent("Due this evening|Due in five days");

    fireEvent.click(within(ganttRange()).getByRole("button", { name: "Today" }));
    expect(screen.getByTestId("gantt")).toHaveAttribute("data-window", "today");
    expect(screen.getByTestId("gantt-items")).not.toHaveTextContent("Due in five days");
    expect(within(filterGroup()).getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("UpNextPanel opening an item from the Gantt", () => {
  it("opens nothing until a bar is clicked", () => {
    renderPanel();
    openGantt();
    expect(screen.queryByTestId("deadline-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("session-dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["open deadline bar", "deadline-dialog", "d-open"],
    ["open task bar", "task-dialog", "t-open"],
    ["open session bar", "session-dialog", "s-open"],
  ])("%s opens only that kind's dialog", (buttonName, dialogTestId, id) => {
    renderPanel();
    openGantt();
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByTestId(dialogTestId)).toHaveTextContent(id);
    const others = ["deadline-dialog", "task-dialog", "session-dialog"].filter((testId) => testId !== dialogTestId);
    for (const other of others) expect(screen.queryByTestId(other)).not.toBeInTheDocument();
  });

  it("Escape while an item dialog is open leaves the Gantt dialog open", () => {
    renderPanel();
    openGantt();
    fireEvent.click(screen.getByRole("button", { name: "open task bar" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("gantt")).toBeInTheDocument();
  });

  it("switching to another bar replaces the open dialog", () => {
    renderPanel();
    openGantt();
    fireEvent.click(screen.getByRole("button", { name: "open deadline bar" }));
    fireEvent.click(screen.getByRole("button", { name: "open task bar" }));
    expect(screen.queryByTestId("deadline-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-dialog")).toHaveTextContent("t-open");
  });
});
