"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCreateTask, useTasks } from "@/hooks/useTasks";
import {
  useCreateTodoList,
  useDeleteTodoList,
  useTodoLists,
} from "@/hooks/useTodoLists";
import { useCourses } from "@/hooks/useCourses";
import { usePeople } from "@/hooks/usePeople";
import { apiFetch } from "@/lib/http/client";
import { taskKeys } from "@/lib/query/keys";
import { BoardColumn } from "@/components/board/BoardColumn";
import { BoardCard } from "@/components/board/BoardCard";
import { CreateTodoListDialog } from "@/components/board/CreateTodoListDialog";
import { TaskForm } from "@/components/board/TaskForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { TaskRow } from "@/lib/api/entity-types";
import type { TaskPayload, TodoListPayload } from "@/lib/api/schemas";

const UNSORTED_ID = "unsorted";

type ColumnsState = Record<string, TaskRow[]>;

function groupTasksByColumn(tasks: TaskRow[], listIds: string[]): ColumnsState {
  const columns: ColumnsState = {};
  for (const listId of listIds) columns[listId] = [];
  columns[UNSORTED_ID] = [];

  const byPosition = (a: TaskRow, b: TaskRow) => a.position - b.position;
  for (const task of [...tasks].sort(byPosition)) {
    const key =
      task.list_id && task.list_id in columns ? task.list_id : UNSORTED_ID;
    columns[key].push(task);
  }
  return columns;
}

function findColumnId(
  itemId: string,
  columns: ColumnsState,
): string | undefined {
  if (itemId in columns) return itemId;
  return Object.keys(columns).find((colId) =>
    columns[colId].some((task) => task.id === itemId),
  );
}

/** Tasks are also Board Cards now (board merge, supabase/migrations/0029_board_merge.sql) — replaces the old flat /tasks list and Course To-Do board with one Trello-like view. */
export function BoardContainer() {
  const { data: tasksData, isLoading: tasksLoading } = useTasks({ limit: 100 });
  const { data: todoListsData, isLoading: todoListsLoading } = useTodoLists({
    limit: 100,
  });
  const { data: coursesData } = useCourses({ limit: 100 });
  const { data: peopleData } = usePeople();
  const createTask = useCreateTask();
  const createTodoList = useCreateTodoList();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Memoized: groupTasksByColumn's useMemo below depends on this reference
  // staying stable across renders while todoListsData hasn't changed —
  // `?? []` inline would hand it a fresh array every render (notably while
  // still loading), defeating that memo and looping the render-phase
  // setColumns sync below forever.
  const lists = useMemo(() => todoListsData?.rows ?? [], [todoListsData]);
  const courseNameById = useMemo(
    () =>
      new Map(
        coursesData?.rows.map((course) => [course.id, course.name]) ?? [],
      ),
    [coursesData],
  );
  const peopleById = useMemo(
    () =>
      new Map(peopleData?.rows.map((person) => [person.id, person.name]) ?? []),
    [peopleData],
  );

  const serverColumns = useMemo(
    () =>
      groupTasksByColumn(
        tasksData?.rows ?? [],
        lists.map((list) => list.id),
      ),
    [tasksData, lists],
  );
  const [columns, setColumns] = useState<ColumnsState>(serverColumns);
  const lastServerColumnsRef = useRef(serverColumns);
  if (lastServerColumnsRef.current !== serverColumns) {
    lastServerColumnsRef.current = serverColumns;
    setColumns(serverColumns);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartSnapshotRef = useRef<ColumnsState | null>(null);

  const [isCreateListOpen, setCreateListOpen] = useState(false);
  const [createCardListId, setCreateCardListId] = useState<
    string | null | undefined
  >(undefined);
  const [deleteListTarget, setDeleteListTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Bound to whichever list is currently targeted for deletion (or "" when
  // none is — harmless, since mutate is only ever called while a target is
  // set and the confirm dialog is open).
  const deleteTodoList = useDeleteTodoList(deleteListTarget?.id ?? "");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const persistPositions = useMutation({
    mutationFn: async (
      updates: Array<{
        taskId: string;
        list_id: string | null;
        position: number;
      }>,
    ) => {
      await Promise.all(
        updates.map((update) =>
          apiFetch(`/api/tasks/${update.taskId}`, {
            method: "PATCH",
            body: { list_id: update.list_id, position: update.position },
          }),
        ),
      );
    },
    onError: () => showToast("Could not save the new card order", "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });

  function handleDragStart(event: DragStartEvent) {
    dragStartSnapshotRef.current = columns;
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeItemId = active.id as string;
    const overItemId = over.id as string;
    if (activeItemId === overItemId) return;

    setColumns((prev) => {
      const activeColId = findColumnId(activeItemId, prev);
      const overColId = findColumnId(overItemId, prev);
      if (!activeColId || !overColId || activeColId === overColId) return prev;

      const activeTasks = [...prev[activeColId]];
      const activeIndex = activeTasks.findIndex(
        (task) => task.id === activeItemId,
      );
      if (activeIndex === -1) return prev;
      const [moved] = activeTasks.splice(activeIndex, 1);

      const overTasks = [...prev[overColId]];
      const overIndex = overTasks.findIndex((task) => task.id === overItemId);
      overTasks.splice(overIndex >= 0 ? overIndex : overTasks.length, 0, moved);

      return { ...prev, [activeColId]: activeTasks, [overColId]: overTasks };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    const startSnapshot = dragStartSnapshotRef.current;
    dragStartSnapshotRef.current = null;
    if (!over || !startSnapshot) return;

    const activeItemId = active.id as string;
    const overItemId = over.id as string;

    setColumns((prev) => {
      const activeColId = findColumnId(activeItemId, prev);
      if (!activeColId) return prev;

      let finalColumns = prev;
      const overColId = findColumnId(overItemId, prev);
      if (overColId === activeColId) {
        const tasks = prev[activeColId];
        const activeIndex = tasks.findIndex((task) => task.id === activeItemId);
        const overIndex = tasks.findIndex((task) => task.id === overItemId);
        if (
          activeIndex !== -1 &&
          overIndex !== -1 &&
          activeIndex !== overIndex
        ) {
          finalColumns = {
            ...prev,
            [activeColId]: arrayMove(tasks, activeIndex, overIndex),
          };
        }
      }

      const changedColumnIds = new Set<string>();
      for (const colId of new Set([
        ...Object.keys(startSnapshot),
        ...Object.keys(finalColumns),
      ])) {
        const before = (startSnapshot[colId] ?? [])
          .map((task) => task.id)
          .join(",");
        const after = (finalColumns[colId] ?? [])
          .map((task) => task.id)
          .join(",");
        if (before !== after) changedColumnIds.add(colId);
      }

      if (changedColumnIds.size > 0) {
        const updates = [...changedColumnIds].flatMap((colId) =>
          (finalColumns[colId] ?? []).map((task, index) => ({
            taskId: task.id,
            list_id: colId === UNSORTED_ID ? null : colId,
            position: index,
          })),
        );
        persistPositions.mutate(updates);
      }

      return finalColumns;
    });
  }

  const handleCreateList = async (values: TodoListPayload) => {
    try {
      await createTodoList.mutateAsync(values);
      showToast("List created", "success");
      setCreateListOpen(false);
    } catch {
      showToast("Could not create list", "error");
    }
  };

  const handleCreateCard = async (values: TaskPayload) => {
    try {
      await createTask.mutateAsync(values);
      showToast("Card created", "success");
      setCreateCardListId(undefined);
    } catch {
      showToast("Could not create card", "error");
    }
  };

  const handleConfirmDeleteList = async () => {
    if (!deleteListTarget) return;
    try {
      const result = await deleteTodoList.mutateAsync();
      showToast(
        result.cascade.itemsDeleted > 0
          ? `List deleted — ${result.cascade.itemsDeleted} card(s) deleted.`
          : "List deleted.",
        "success",
      );
    } catch {
      showToast("Could not delete list", "error");
    } finally {
      setDeleteListTarget(null);
    }
  };

  const isLoading = tasksLoading || todoListsLoading;
  const activeTask = activeId
    ? Object.values(columns)
        .flat()
        .find((task) => task.id === activeId)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
            Board
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
            Your cards, organized
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setCreateCardListId(null)}>
            + New card
          </Button>
          <Button onClick={() => setCreateListOpen(true)}>+ New list</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-72 w-72 shrink-0" />
          ))}
        </div>
      ) : lists.length === 0 && (columns[UNSORTED_ID] ?? []).length === 0 ? (
        <EmptyState
          title="Board is empty"
          description="Create a list, or add a card straight to Unsorted."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {lists.map((list) => (
              <BoardColumn
                key={list.id}
                id={list.id}
                name={list.name}
                courseName={
                  list.course_id
                    ? courseNameById.get(list.course_id)
                    : undefined
                }
                tasks={columns[list.id] ?? []}
                peopleById={peopleById}
                isUnsorted={false}
                onAddCard={() => setCreateCardListId(list.id)}
                onDeleteList={() =>
                  setDeleteListTarget({ id: list.id, name: list.name })
                }
                isDeletingList={deleteTodoList.isPending}
              />
            ))}
            <BoardColumn
              id={UNSORTED_ID}
              name="Unsorted"
              tasks={columns[UNSORTED_ID] ?? []}
              peopleById={peopleById}
              isUnsorted
              onAddCard={() => setCreateCardListId(null)}
            />
          </div>

          <DragOverlay>
            {activeTask ? (
              <BoardCard
                task={activeTask}
                personName={
                  activeTask.person_id
                    ? peopleById.get(activeTask.person_id)
                    : undefined
                }
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <CreateTodoListDialog
        open={isCreateListOpen}
        onClose={() => setCreateListOpen(false)}
        onSubmit={handleCreateList}
      />

      <Dialog
        open={createCardListId !== undefined}
        onClose={() => setCreateCardListId(undefined)}
        title="New card"
      >
        <TaskForm
          defaultListId={createCardListId}
          onSubmit={handleCreateCard}
          onCancel={() => setCreateCardListId(undefined)}
          submitLabel="Create card"
        />
      </Dialog>

      <ConfirmDialog
        open={deleteListTarget !== null}
        onClose={() => setDeleteListTarget(null)}
        onConfirm={handleConfirmDeleteList}
        title={`Delete "${deleteListTarget?.name}"?`}
        description="Its cards will be deleted too, not moved to Unsorted."
        confirmLabel="Delete"
        isConfirming={deleteTodoList.isPending}
      />
    </div>
  );
}
