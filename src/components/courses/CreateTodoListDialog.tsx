"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { todoListPayloadSchema, type TodoListPayload } from "@/lib/api/schemas";
import { useCourses } from "@/hooks/useCourses";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TodoListPayload) => Promise<void> | void;
};

// course_id "" in the select means "no course". z.uuid() rejects "" (it's
// not a valid UUID, and .optional() only accepts undefined) — normalize at
// register time, same pattern as DeadlineForm's emptyToUndefined.
const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

/** Submits with course_id normalized to null so a freestanding custom list ("Misc", "Project: X") is created when no course is chosen. */
export function CreateTodoListDialog({ open, onClose, onSubmit }: Props) {
  const { data: courses } = useCourses({ personId: "me" });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TodoListPayload>({
    resolver: zodResolver(todoListPayloadSchema),
    defaultValues: { course_id: "", name: "" },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="New to-do list">
      <form
        onSubmit={handleSubmit(async (values) => {
          await onSubmit({ ...values, course_id: values.course_id || null });
          reset();
        })}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField label="Course" htmlFor="course_id" error={errors.course_id?.message}>
          <Select id="course_id" invalid={Boolean(errors.course_id)} {...register("course_id", { setValueAs: emptyToUndefined })}>
            <option value="">No course (custom list)</option>
            {(courses?.rows ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="List name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" placeholder="e.g. Misc, Project: Agrivoltaics" invalid={Boolean(errors.name)} {...register("name")} />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create list
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
