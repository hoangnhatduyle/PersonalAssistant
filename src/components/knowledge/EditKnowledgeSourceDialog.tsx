"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useCreateKnowledgeSource, useDeleteKnowledgeSource, useKnowledgeSourceContent } from "@/hooks/useKnowledge";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { KNOWLEDGE_MAX_PASTED_TEXT_CHARS, KNOWLEDGE_MAX_TITLE_CHARS } from "@/lib/knowledge/constants";
import type { KnowledgeSource } from "@/lib/api/entity-types";

type Props = {
  source: KnowledgeSource;
  open: boolean;
  onClose: () => void;
};

export function EditKnowledgeSourceDialog({ source, open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${source.title}`}>
      {/* Dialog itself renders null while closed, so this only ever mounts
          on open — a fresh instance every time, with initial field values
          read directly from `source`/the fetched content below. That's what
          lets the form avoid a reset-on-prop-change effect entirely. */}
      {open && <EditKnowledgeSourceForm source={source} onClose={onClose} />}
    </Dialog>
  );
}

/**
 * knowledge_sources has no UPDATE grant at all (0007_knowledge_base.sql,
 * NC-DATA-025) and a text edit needs re-chunking/re-embedding regardless —
 * so "edit" here is create-the-replacement-first, then delete-the-original,
 * never an in-place update. Creating first means a failed create leaves the
 * original source untouched instead of losing it.
 */
function EditKnowledgeSourceForm({ source, onClose }: { source: KnowledgeSource; onClose: () => void }) {
  const isPastedText = source.source_type === "pasted_text";
  // Guards against a race with the replace flow below: once the save is
  // underway, the delete's own success invalidation would otherwise refetch
  // this content query for the source id it just deleted (404) — disabling
  // it the instant the submit starts, rather than only after both mutations
  // resolve, closes that window.
  const [isReplacing, setReplacing] = useState(false);
  const { data, isLoading } = useKnowledgeSourceContent(source.id, isPastedText && !isReplacing);
  const createSource = useCreateKnowledgeSource();
  const deleteSource = useDeleteKnowledgeSource(source.id);
  const { showToast } = useToast();

  const titleRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const isBusy = createSource.isPending || deleteSource.isPending;
  const isContentLoading = isPastedText && isLoading;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = titleRef.current?.value.trim() ?? "";
    if (!trimmedTitle) return;

    setReplacing(true);
    try {
      if (isPastedText) {
        await createSource.mutateAsync({ source_type: "pasted_text", title: trimmedTitle, text: textRef.current?.value ?? "" });
      } else {
        await createSource.mutateAsync({ source_type: "url", title: trimmedTitle, url: urlRef.current?.value.trim() ?? "" });
      }
      await deleteSource.mutateAsync();
      showToast("Source updated", "success");
      onClose();
    } catch {
      showToast("Could not update the source", "error");
      setReplacing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Title" htmlFor="edit-knowledge-title">
        <Input id="edit-knowledge-title" ref={titleRef} defaultValue={source.title} maxLength={KNOWLEDGE_MAX_TITLE_CHARS} disabled={isBusy} />
      </FormField>

      {isPastedText ? (
        isContentLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <FormField label="Text" htmlFor="edit-knowledge-text">
            {/* Uncontrolled + keyed on the fetched content: the value only
                exists once (when this element is created, after `data`
                resolves), so there's no later prop change to sync via an
                effect — the user's own edits after that live in the DOM. */}
            <Textarea
              key={data?.raw_content ?? ""}
              id="edit-knowledge-text"
              ref={textRef}
              rows={8}
              defaultValue={data?.raw_content ?? ""}
              maxLength={KNOWLEDGE_MAX_PASTED_TEXT_CHARS}
              disabled={isBusy}
            />
          </FormField>
        )
      ) : (
        <FormField label="URL" htmlFor="edit-knowledge-url">
          <Input id="edit-knowledge-url" ref={urlRef} type="url" defaultValue={source.origin_url ?? ""} disabled={isBusy} />
        </FormField>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isBusy} disabled={isContentLoading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
