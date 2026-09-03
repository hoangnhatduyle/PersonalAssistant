"use client";

import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateTodoItem, useUpdateTodoItem, useDeleteTodoItem } from "@/hooks/useTodoItems";
import { todoItemPayloadSchema, type TodoItemPayload } from "@/lib/api/schemas";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { ITEM_PRIORITY_TONE } from "@/lib/status-colors";
import type { ItemPriority, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

const PRIORITY_OPTIONS: ItemPriority[] = ["Low", "Medium", "High", "Urgent"];

// An untouched date input or the "No priority" <select> option reports "",
// but the schema's z.iso.date().nullable().optional() and enum().nullable().optional()
// reject "" — normalize at register time, same pattern as CreateTodoListDialog's
// emptyToUndefined for course_id.
const emptyToNull = (value: string) => (value === "" ? null : value);
const emptyPriorityToUndefined = (value: string) => (value === "" ? undefined : (value as ItemPriority));

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
  const deleteItem = useDeleteTodoItem(item.id);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDueDate, setEditDueDate] = useState(item.due_date ?? "");
  const [editPriority, setEditPriority] = useState<ItemPriority | "">(item.priority ?? "");

  const isOverdue = !item.is_done && Boolean(item.due_date) && item.due_date! < localDateKey(new Date());

  const handleSave = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    updateItem.mutate({ title: trimmed, due_date: editDueDate || null, priority: editPriority || null });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(item.title);
    setEditDueDate(item.due_date ?? "");
    setEditPriority(item.priority ?? "");
    setEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5">
        <Input
          value={editTitle}
          onChange={(event) => setEditTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1"
          autoFocus
        />
        <Input
          type="date"
          value={editDueDate}
          onChange={(event) => setEditDueDate(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-36"
        />
        <Select
          value={editPriority}
          onChange={(event) => setEditPriority(event.target.value as ItemPriority | "")}
          className="w-28"
        >
          <option value="">No priority</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={handleSave} disabled={!editTitle.trim()}>Save</Button>
        <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between gap-2 py-1.5">
      <Checkbox
        label={item.title}
        checked={item.is_done}
        onChange={(event) => updateItem.mutate({ is_done: event.target.checked })}
        className={item.is_done ? "text-text-secondary line-through" : ""}
      />
      <div className="flex shrink-0 items-center gap-1.5">
        {item.priority && <Badge tone={ITEM_PRIORITY_TONE[item.priority]}>{item.priority}</Badge>}
        {item.due_date && (
          <span className={`font-mono text-[11px] ${isOverdue ? "text-status-urgent" : "text-text-secondary"}`}>
            due {new Date(`${item.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
        <button
          type="button"
          aria-label="Edit item"
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-text-secondary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L3.463 11.098l-.53 1.856 1.856-.53 8.61-8.61a.25.25 0 0 0 0-.354L12.427 2.487Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Delete item"
          onClick={() => deleteItem.mutate()}
          className="rounded p-0.5 text-text-secondary opacity-0 transition-opacity hover:text-status-urgent group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM9.5 1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V3h3V1.75ZM4.997 6.178a.75.75 0 1 0-1.493.144l.44 4.56a2.25 2.25 0 0 0 2.24 2.018h3.632a2.25 2.25 0 0 0 2.24-2.018l.44-4.56a.75.75 0 0 0-1.494-.144l-.439 4.56a.75.75 0 0 1-.747.672H6.184a.75.75 0 0 1-.747-.672l-.44-4.56Z" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function AddTodoItemDialog({ listId, open, onClose }: { listId: string; open: boolean; onClose: () => void }) {
  const createItem = useCreateTodoItem();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TodoItemPayload>({
    resolver: zodResolver(todoItemPayloadSchema),
    defaultValues: { list_id: listId, title: "", due_date: "", priority: undefined },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Add task or assignment">
      <form
        onSubmit={handleSubmit(async (values) => {
          await createItem.mutateAsync({ ...values, list_id: listId });
          reset();
          onClose();
        })}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField label="Task" htmlFor="item-title" error={errors.title?.message}>
          <Input id="item-title" placeholder="Add a task or assignment" invalid={Boolean(errors.title)} autoFocus {...register("title")} />
        </FormField>

        <FormField label="Due date" htmlFor="item-due-date" error={errors.due_date?.message}>
          <Input id="item-due-date" type="date" {...register("due_date", { setValueAs: emptyToNull })} />
        </FormField>

        <FormField label="Priority" htmlFor="item-priority" error={errors.priority?.message}>
          <Select id="item-priority" {...register("priority", { setValueAs: emptyPriorityToUndefined })}>
            <option value="">No priority</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add task
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CourseTodoListCard({ list, items, courseName }: Props) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const doneCount = items.filter((item) => item.is_done).length;

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

      <Button type="button" variant="secondary" size="sm" onClick={() => setAddDialogOpen(true)}>
        + Add task
      </Button>

      <AddTodoItemDialog listId={list.id} open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
    </GlassPanel>
  );
}
