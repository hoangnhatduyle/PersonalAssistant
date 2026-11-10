import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { UpNextPanel } from "@/components/dashboard/UpNextPanel";
import { resetPersistedViewMemory } from "@/hooks/usePersistedView";
import { UP_NEXT_VIEW_KEY } from "@/components/dashboard/collapse-keys";
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

const viewGroup = () => screen.getByRole("group", { name: "Up Next view" });
const filterGroup = () => screen.getByRole("group", { name: "Filter by due date" });

beforeEach(() => {
  localStorage.clear();
  resetPersistedViewMemory();
});

describe("UpNextPanel view toggle", () => {
  it("starts on the list view", () => {
    renderPanel();
    expect(within(viewGroup()).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(within(viewGroup()).getByRole("button", { name: "Gantt" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument();
    // The queue row is a link; the rings legend repeats the title as plain text.
    expect(screen.getByRole("link", { name: "Due this evening" })).toBeInTheDocument();
  });

  it("switches to the Gantt and back, remembering the choice", () => {
    renderPanel();
    fireEvent.click(within(viewGroup()).getByRole("button", { name: "Gantt" }));

    expect(screen.getByTestId("gantt")).toBeInTheDocument();
    expect(within(viewGroup()).getByRole("button", { name: "Gantt" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(UP_NEXT_VIEW_KEY)).toBe("gantt");

    fireEvent.click(within(viewGroup()).getByRole("button", { name: "List" }));
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument();
    // The queue row is a link; the rings legend repeats the title as plain text.
    expect(screen.getByRole("link", { name: "Due this evening" })).toBeInTheDocument();
    expect(localStorage.getItem(UP_NEXT_VIEW_KEY)).toBe("list");
  });

  it("opens on the Gantt when that was the last choice", () => {
    localStorage.setItem(UP_NEXT_VIEW_KEY, "gantt");
    renderPanel();
    expect(screen.getByTestId("gantt")).toBeInTheDocument();
  });
});

describe("UpNextPanel filter shared by both views", () => {
  it("gives the Gantt only what the selected window covers, and widens with it", () => {
    localStorage.setItem(UP_NEXT_VIEW_KEY, "gantt");
    renderPanel();

    expect(screen.getByTestId("gantt")).toHaveAttribute("data-window", "today");
    expect(screen.getByTestId("gantt-items")).toHaveTextContent("Due this evening");
    expect(screen.getByTestId("gantt-items")).not.toHaveTextContent("Due in five days");

    fireEvent.click(within(filterGroup()).getByRole("button", { name: "All" }));
    expect(screen.getByTestId("gantt")).toHaveAttribute("data-window", "all");
    expect(screen.getByTestId("gantt-items")).toHaveTextContent("Due this evening|Due in five days");
  });

  it("keeps the selected window when switching views", () => {
    renderPanel();
    fireEvent.click(within(filterGroup()).getByRole("button", { name: "7 Days" }));
    fireEvent.click(within(viewGroup()).getByRole("button", { name: "Gantt" }));
    expect(screen.getByTestId("gantt")).toHaveAttribute("data-window", "7days");
  });

  it("shows the empty state instead of an empty chart when nothing is due in the window", () => {
    localStorage.setItem(UP_NEXT_VIEW_KEY, "gantt");
    renderWithProviders(<UpNextPanel deadlines={[]} tasks={[]} people={[]} todoLists={[]} courses={[]} appointments={[]} longTermTasks={[]} />);
    expect(screen.queryByTestId("gantt")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing due today")).toBeInTheDocument();
  });
});

describe("UpNextPanel opening an item from the Gantt", () => {
  beforeEach(() => localStorage.setItem(UP_NEXT_VIEW_KEY, "gantt"));

  it("opens nothing until a bar is clicked", () => {
    renderPanel();
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
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByTestId(dialogTestId)).toHaveTextContent(id);
    const others = ["deadline-dialog", "task-dialog", "session-dialog"].filter((testId) => testId !== dialogTestId);
    for (const other of others) expect(screen.queryByTestId(other)).not.toBeInTheDocument();
  });

  it("switching to another bar replaces the open dialog", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "open deadline bar" }));
    fireEvent.click(screen.getByRole("button", { name: "open task bar" }));
    expect(screen.queryByTestId("deadline-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-dialog")).toHaveTextContent("t-open");
  });
});
