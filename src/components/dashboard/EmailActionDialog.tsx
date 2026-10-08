"use client";

import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { AppointmentForm } from "@/components/calendar/AppointmentForm";
import { TaskForm } from "@/components/board/TaskForm";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { useCreateTask } from "@/hooks/useTasks";
import { useCreateDeadline } from "@/hooks/useDeadlines";
import { useUpdateTriageItem } from "@/hooks/useEmailTriage";
import { senderName } from "@/lib/email-triage/summary";
import type { SuggestedAction, TriageItem } from "@/lib/email-triage/types";

type Props = {
  /** The triage item whose suggested action is being confirmed; null = closed. */
  item: TriageItem | null;
  onClose: () => void;
};

export function actionLabel(action: SuggestedAction): string {
  switch (action.kind) {
    case "deadline":
      return "Add deadline";
    case "event":
      return "Add event";
    case "task":
      return action.reminders_enabled ? "Add task + reminder" : "Add task";
  }
}

/**
 * Confirms an email's suggested next step by opening the existing create form
 * prefilled (title, due date, course) — submitting the form IS the
 * confirmation, and nothing is created before that. On success the triage item
 * is marked acted so it leaves the "Needs your attention" list.
 */
export function EmailActionDialog({ item, onClose }: Props) {
  const { showToast } = useToast();
  const createTask = useCreateTask();
  const createDeadline = useCreateDeadline();
  const createAppointment = useCreateAppointment();
  const updateItem = useUpdateTriageItem();

  const action = item?.suggestedAction;
  if (!item || !action) return null;

  const markActed = async (message: string) => {
    try {
      await updateItem.mutateAsync({ id: item.id, status: "acted" });
    } catch {
      // The entity was created; the item just stays open until dismissed or expired.
    }
    showToast(message, "success");
    onClose();
  };

  const source = (
    <p className="mb-4 truncate font-mono text-xs text-text-secondary">
      From email: {item.subject} · {senderName(item.sender)}
    </p>
  );

  if (action.kind === "event") {
    return (
      <Dialog open onClose={onClose} title="Add event from email" size="xl">
        {source}
        <AppointmentForm
          defaultTitle={action.title}
          defaultDate={action.date}
          defaultTime={action.time}
          defaultDurationMinutes={action.duration_minutes}
          onSubmit={async (values) => {
            try {
              await createAppointment.mutateAsync(values);
              await markActed("Event created");
            } catch {
              showToast("Could not create event", "error");
            }
          }}
          onCancel={onClose}
        />
      </Dialog>
    );
  }

  if (action.kind === "deadline") {
    return (
      <Dialog open onClose={onClose} title="Add deadline from email">
        {source}
        <DeadlineForm
          defaultTitle={action.title}
          defaultCourseId={action.course_id}
          defaultDueAt={action.due_at}
          submitLabel="Create deadline"
          onSubmit={async (values) => {
            try {
              await createDeadline.mutateAsync(values);
              await markActed("Deadline created");
            } catch {
              showToast("Could not create deadline", "error");
            }
          }}
          onCancel={onClose}
        />
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Add task from email">
      {source}
      <TaskForm
        defaultTitle={action.title}
        defaultDueAt={action.due_at}
        submitLabel="Create task"
        onSubmit={async (values) => {
          try {
            await createTask.mutateAsync(values);
            await markActed("Task created");
          } catch {
            showToast("Could not create task", "error");
          }
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}
