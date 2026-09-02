"use client";

import { useState } from "react";
import { useCreateTodoItem, useUpdateTodoItem } from "@/hooks/useTodoItems";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

type Props = {
  list: TodoListRow;
  items: TodoItemRow[];
  courseName?: string;
};

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function TodoItemLine({ item }: { item: TodoItemRow }) {
  const updateItem = useUpdateTodoItem(item.id);
  // Local calendar day, not toISOString's UTC day — see upcoming-items.ts's
  // buildUpcomingItems for the same fix and why it matters in the evening.
  const isOverdue = !item.is_done && Boolean(item.due_date) && item.due_date! < localDateKey(new Date());

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <Checkbox
        label={item.title}
        checked={item.is_done}
        onChange={(event) => updateItem.mutate({ is_done: event.target.checked })}
        className={item.is_done ? "text-text-secondary line-through" : ""}
      />
      {item.due_date && (
        <span className={`shrink-0 font-mono text-[11px] ${isOverdue ? "text-status-urgent" : "text-text-secondary"}`}>
          due {new Date(`${item.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}
    </li>
  );
}

export function CourseTodoListCard({ list, items, courseName }: Props) {
  const createItem = useCreateTodoItem();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  const doneCount = items.filter((item) => item.is_done).length;

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createItem.mutateAsync({ list_id: list.id, title: trimmed, due_date: dueDate || null });
    setTitle("");
    setDueDate("");
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">{courseName ? "Course" : "Custom list"}</p>
          <h3 className="font-display text-sm font-semibold text-text-primary">{courseName ?? list.name}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-panel-border px-2 py-0.5 font-mono text-[11px] text-text-secondary">
          {doneCount}/{items.length} done
        </span>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-panel-border">
          {items.map((item) => (
            <TodoItemLine key={item.id} item={item} />
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
        className="flex flex-wrap gap-2"
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task or assignment"
          className="min-w-0 flex-1"
        />
        <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-36" />
        <Button type="submit" size="sm" isLoading={createItem.isPending} disabled={!title.trim()}>
          +
        </Button>
      </form>
    </GlassPanel>
  );
}
