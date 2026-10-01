"use client";

import { useTask } from "@/hooks/useTasks";
import { BoardCardDetailContainer } from "@/components/board/BoardCardDetailContainer";
import { Dialog } from "@/components/ui/Dialog";

type Props = {
  taskId: string | null;
  onClose: () => void;
  /** Switches the dialog to another card (e.g. the fresh copy from "Duplicate as new"). */
  onOpenTask?: (taskId: string) => void;
};

/** Trello-style in-place card detail — shares useTask's cache entry with BoardCardDetailContainer, so opening a card that's already loaded on the board triggers no extra fetch. */
export function BoardCardDetailDialog({ taskId, onClose, onOpenTask }: Props) {
  const { data: task } = useTask(taskId ?? "");

  return (
    <Dialog
      open={taskId !== null}
      onClose={onClose}
      title={task?.title ?? "Card"}
      size="lg"
    >
      {taskId && <BoardCardDetailContainer taskId={taskId} embedded onDeleted={onClose} onOpenTask={onOpenTask} />}
    </Dialog>
  );
}
