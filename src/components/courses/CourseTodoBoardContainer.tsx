"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { todoItemKeys } from "@/lib/query/keys";
import { useCourses } from "@/hooks/useCourses";
import { useCreateTodoList, useTodoLists } from "@/hooks/useTodoLists";
import { useTodoItems } from "@/hooks/useTodoItems";
import { CourseTodoListCard } from "@/components/courses/CourseTodoListCard";
import { CreateTodoListDialog } from "@/components/courses/CreateTodoListDialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { TodoListPayload } from "@/lib/api/schemas";
import type { TodoItemRow } from "@/lib/api/entity-types";

export function CourseTodoBoardContainer() {
  const { data: courses } = useCourses();
  const { data: lists, isLoading: listsLoading } = useTodoLists({ limit: 100 });
  const { data: items, isLoading: itemsLoading } = useTodoItems({ limit: 100 });
  const createList = useCreateTodoList();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);

  const courseNameById = useMemo(() => new Map((courses?.rows ?? []).map((course) => [course.id, course.name])), [courses]);

  const itemRows = useMemo(() => items?.rows ?? [], [items]);
  const itemsByListId = useMemo(() => {
    const map = new Map<string, TodoItemRow[]>();
    for (const item of itemRows) {
      const bucket = map.get(item.list_id) ?? [];
      bucket.push(item);
      map.set(item.list_id, bucket);
    }
    return map;
  }, [itemRows]);

  const doneItemIds = itemRows.filter((item) => item.is_done).map((item) => item.id);

  const clearCompleted = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiFetch(`/api/todo-items/${id}`, { method: "DELETE" })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoItemKeys.all });
    },
  });

  const handleCreateList = async (values: TodoListPayload) => {
    try {
      await createList.mutateAsync(values);
      showToast("List created", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not create list", "error");
    }
  };

  const handleClearCompleted = async () => {
    try {
      await clearCompleted.mutateAsync(doneItemIds);
    } catch {
      showToast("Could not clear completed items", "error");
    }
  };

  const isLoading = listsLoading || itemsLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Courses</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">To-do lists</h1>
        </div>
        <div className="flex items-center gap-2">
          {doneItemIds.length > 0 && (
            <Button variant="secondary" onClick={handleClearCompleted} isLoading={clearCompleted.isPending}>
              Clear completed
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>+ New list</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-48 w-full" />
          ))}
        </div>
      ) : (lists?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="No to-do lists yet"
          description="Create a list for one of your courses, or a custom list like Misc."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(lists?.rows ?? []).map((list) => (
            <CourseTodoListCard
              key={list.id}
              list={list}
              items={itemsByListId.get(list.id) ?? []}
              courseName={list.course_id ? courseNameById.get(list.course_id) : undefined}
            />
          ))}
        </div>
      )}

      <CreateTodoListDialog open={isCreateOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreateList} />
    </div>
  );
}
