"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { libraryPostPayloadSchema, type LibraryPostFormInput, type LibraryPostPayload } from "@/lib/api/library-schemas";
import type { LibraryPostWithRelations } from "@/lib/api/entity-types";
import { useCourses } from "@/hooks/useCourses";
import { useLibraryEmployers } from "@/hooks/useLibraryEmployers";
import { usePeople } from "@/hooks/usePeople";
import { ApiError } from "@/lib/http/client";
import { detectPlatform, parsePostUrl } from "@/lib/library/url";
import { EntityMultiSelect } from "@/components/library/EntityMultiSelect";
import { PlatformBadge } from "@/components/library/PlatformBadge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { TagInput } from "@/components/ui/TagInput";
import { Textarea } from "@/components/ui/Textarea";

// The pickers must offer everyone/every course, and both list hooks default to a 20-row page.
const PICKER_LIMIT = 100;

type Props = {
  post?: LibraryPostWithRelations;
  /** Rejects with an ApiError on failure — this form renders the 409 "already saved" and generic messages itself. */
  onSubmit: (values: LibraryPostPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Extra form section (the create dialog's screenshot picker), rendered above the buttons. */
  imageSlot?: ReactNode;
};

export function PostForm({ post, onSubmit, onCancel, submitLabel = "Save post", imageSlot }: Props) {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: people, isLoading: peopleLoading } = usePeople({ limit: PICKER_LIMIT });
  const { data: courses, isLoading: coursesLoading } = useCourses({ limit: PICKER_LIMIT });
  const { data: employers, isLoading: employersLoading } = useLibraryEmployers({ limit: PICKER_LIMIT });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LibraryPostFormInput, unknown, LibraryPostPayload>({
    resolver: zodResolver(libraryPostPayloadSchema),
    defaultValues: {
      title: post?.title ?? "",
      url: post?.url ?? "",
      author_name: post?.author_name ?? "",
      notes: post?.notes ?? "",
      tags: post?.tags ?? [],
      is_favorite: post?.is_favorite ?? false,
      person_ids: post?.people.map((person) => person.id) ?? [],
      course_ids: post?.courses.map((course) => course.id) ?? [],
      employer_ids: post?.employers.map((employer) => employer.id) ?? [],
    },
  });

  const url = useWatch({ control, name: "url" }) ?? "";
  const detected = url.trim() && parsePostUrl(url) ? detectPlatform(url) : null;

  const submit = handleSubmit(async (values) => {
    setDuplicateId(null);
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const existing = (error.data as { existing_id?: string | null } | null)?.existing_id ?? null;
        setDuplicateId(existing ?? "");
      } else {
        setFormError(error instanceof Error ? error.message : "Could not save the post");
      }
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="library-title" error={errors.title?.message}>
        <Input id="library-title" placeholder="What is this post about?" invalid={Boolean(errors.title)} {...register("title")} />
      </FormField>

      <FormField label="Link (optional)" htmlFor="library-url" error={errors.url?.message}>
        <Input id="library-url" type="url" inputMode="url" placeholder="https://www.instagram.com/p/…" invalid={Boolean(errors.url) || duplicateId !== null} {...register("url")} />
        {detected && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            Detected <PlatformBadge platform={detected} />
          </p>
        )}
        {duplicateId !== null && (
          <p role="alert" className="text-xs text-status-warn">
            Already saved
            {duplicateId && (
              <>
                {" — "}
                <Link href={`/library/posts/${duplicateId}`} className="underline underline-offset-2 hover:text-text-primary">
                  Open it
                </Link>
              </>
            )}
          </p>
        )}
      </FormField>

      <FormField label="Author / page (optional)" htmlFor="library-author" error={errors.author_name?.message}>
        <Input id="library-author" placeholder="Who posted it?" invalid={Boolean(errors.author_name)} {...register("author_name")} />
      </FormField>

      <FormField label="Notes" htmlFor="library-notes" error={errors.notes?.message}>
        <Textarea id="library-notes" rows={4} placeholder="Why is this worth keeping? Anything you'll want to remember." invalid={Boolean(errors.notes)} {...register("notes")} />
      </FormField>

      <FormField label="Tags" error={errors.tags?.message}>
        <Controller control={control} name="tags" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} />} />
      </FormField>

      <Controller
        control={control}
        name="is_favorite"
        render={({ field }) => <Switch checked={field.value ?? false} onCheckedChange={field.onChange} label="Favorite" />}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="person_ids"
          render={({ field }) => (
            <EntityMultiSelect
              legend="People"
              options={(people?.rows ?? []).map((person) => ({ id: person.id, label: person.name }))}
              value={field.value ?? []}
              onChange={field.onChange}
              isLoading={peopleLoading}
              emptyText="No people yet"
            />
          )}
        />
        <Controller
          control={control}
          name="course_ids"
          render={({ field }) => (
            <EntityMultiSelect
              legend="Courses"
              options={(courses?.rows ?? []).map((course) => ({ id: course.id, label: course.code ? `${course.code} · ${course.name}` : course.name }))}
              value={field.value ?? []}
              onChange={field.onChange}
              isLoading={coursesLoading}
              emptyText="No courses yet"
            />
          )}
        />
      </div>

      <Controller
        control={control}
        name="employer_ids"
        render={({ field }) => (
          <EntityMultiSelect
            legend="Employers"
            options={(employers?.rows ?? []).map((employer) => ({ id: employer.id, label: employer.name }))}
            value={field.value ?? []}
            onChange={field.onChange}
            isLoading={employersLoading}
            emptyText="No employers yet"
          />
        )}
      />

      {imageSlot}

      {formError && (
        <p role="alert" className="text-sm text-status-urgent">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
