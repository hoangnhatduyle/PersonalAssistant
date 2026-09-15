"use client";

import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { AppointmentForm } from "@/components/calendar/AppointmentForm";
import { TaskForm } from "@/components/board/TaskForm";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { CourseForm } from "@/components/courses/CourseForm";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { useCreateTask } from "@/hooks/useTasks";
import { useCreateDeadline } from "@/hooks/useDeadlines";
import { useCreateCourse } from "@/hooks/useCourses";
import type { CreateRequest } from "@/components/calendar/DayColumnEvents";

type Props = {
  request: CreateRequest | null;
  onClose: () => void;
};

/** Course meeting blocks default to a 50-minute window — matches CourseForm.tsx's own DEFAULT_BLOCK convention. */
const DEFAULT_COURSE_BLOCK_MINUTES = 50;

function minutesToTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Builds a full ISO-with-offset datetime (what DateTimeField/the API schemas expect) from a YYYY-MM-DD date and a minutes-of-day value, using local wall-clock time. */
function minutesToIso(dateKey: string, minutes: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  return date.toISOString();
}

function dayOfWeekFor(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * Dispatches an empty-slot Calendar click (src/components/calendar/DayColumnEvents.tsx)
 * to the right entity's existing create form, pre-filled with the clicked date/time.
 * Owned by WeekGridContainer so only one dialog exists regardless of how many day
 * columns are rendered.
 */
export function CreateEventDialog({ request, onClose }: Props) {
  const { showToast } = useToast();
  const createAppointment = useCreateAppointment();
  const createTask = useCreateTask();
  const createDeadline = useCreateDeadline();
  const createCourse = useCreateCourse();

  if (!request) return null;

  const { type, date, minutes } = request;

  if (type === "appointment") {
    return (
      <Dialog open onClose={onClose} title="Add Appointment" size="xl">
        <AppointmentForm
          defaultDate={date}
          defaultTime={minutesToTimeInput(minutes)}
          onSubmit={(values) => createAppointment.mutate(values, { onSuccess: onClose })}
          onCancel={onClose}
        />
      </Dialog>
    );
  }

  if (type === "task") {
    return (
      <Dialog open onClose={onClose} title="Add Task">
        <TaskForm
          defaultDueAt={minutesToIso(date, minutes)}
          submitLabel="Create task"
          onSubmit={async (values) => {
            try {
              await createTask.mutateAsync(values);
              showToast("Card created", "success");
              onClose();
            } catch {
              showToast("Could not create card", "error");
            }
          }}
          onCancel={onClose}
        />
      </Dialog>
    );
  }

  if (type === "deadline") {
    return (
      <Dialog open onClose={onClose} title="Add Deadline">
        <DeadlineForm
          defaultDueAt={minutesToIso(date, minutes)}
          submitLabel="Create deadline"
          onSubmit={async (values) => {
            try {
              await createDeadline.mutateAsync(values);
              showToast("Deadline created", "success");
              onClose();
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
    <Dialog open onClose={onClose} title="Add Course" size="xl">
      <CourseForm
        defaultBlock={{
          days: [dayOfWeekFor(date)],
          startMinutes: minutes,
          endMinutes: minutes + DEFAULT_COURSE_BLOCK_MINUTES,
        }}
        submitLabel="Create course"
        onSubmit={async (values) => {
          try {
            await createCourse.mutateAsync(values);
            showToast("Course created", "success");
            onClose();
          } catch {
            showToast("Could not create course", "error");
          }
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}
