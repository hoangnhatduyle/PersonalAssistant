import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DuplicateTaskButton } from "@/components/board/DuplicateTaskButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/useUserTimezone", () => ({
  useUserTimezone: () => "America/Detroit",
  useUserTimezoneReady: () => true,
}));

const duplicateMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const useUpdateTask = vi.fn();
vi.mock("@/hooks/useTasks", () => ({
  useDuplicateTask: () => ({ mutateAsync: duplicateMutateAsync, isPending: false }),
  useUpdateTask: (id: string) => {
    useUpdateTask(id);
    return { mutateAsync: updateMutateAsync, isPending: false };
  },
}));

describe("DuplicateTaskButton", () => {
  beforeEach(() => {
    duplicateMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    useUpdateTask.mockReset();
    push.mockReset();
    duplicateMutateAsync.mockResolvedValue({ id: "task-copy" });
    updateMutateAsync.mockResolvedValue({});
  });

  it("duplicates the card, then asks for the copy's due date", async () => {
    renderWithProviders(<DuplicateTaskButton taskId="task-1" onOpenTask={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new" }));

    expect(await screen.findByText("Due date for the new card")).toBeInTheDocument();
    expect(duplicateMutateAsync).toHaveBeenCalledTimes(1);
    expect(useUpdateTask).toHaveBeenCalledWith("task-copy");
  });

  it("opens the copy without a due date when the prompt is skipped", async () => {
    const onOpenTask = vi.fn();
    renderWithProviders(<DuplicateTaskButton taskId="task-1" onOpenTask={onOpenTask} />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(onOpenTask).toHaveBeenCalledWith("task-copy");
    expect(screen.queryByText("Due date for the new card")).not.toBeInTheDocument();
  });

  it("saves the chosen due date on the copy before opening it", async () => {
    const onOpenTask = vi.fn();
    renderWithProviders(<DuplicateTaskButton taskId="task-1" onOpenTask={onOpenTask} />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new" }));
    fireEvent.change(await screen.findByLabelText("Due date"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save due date" }));

    await waitFor(() => expect(onOpenTask).toHaveBeenCalledWith("task-copy"));
    // 9:00 AM in the profile zone (Detroit, EDT = UTC-4 on Oct 5), not the machine's zone.
    expect(updateMutateAsync).toHaveBeenCalledWith({ due_at: "2026-10-05T13:00:00.000Z" });
  });

  it("navigates to the standalone card page when there is no dialog to switch", async () => {
    renderWithProviders(<DuplicateTaskButton taskId="task-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    expect(push).toHaveBeenCalledWith("/board/task-copy");
  });

  it("shows an error and no prompt when the duplicate call fails", async () => {
    duplicateMutateAsync.mockRejectedValue(new Error("boom"));
    renderWithProviders(<DuplicateTaskButton taskId="task-1" onOpenTask={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new" }));

    expect(await screen.findByText("Could not duplicate card")).toBeInTheDocument();
    expect(screen.queryByText("Due date for the new card")).not.toBeInTheDocument();
  });
});
