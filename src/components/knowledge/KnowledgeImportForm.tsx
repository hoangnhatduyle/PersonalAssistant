"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useCreateKnowledgeSource } from "@/hooks/useKnowledge";
import { useToast } from "@/components/ui/Toast";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { KNOWLEDGE_MAX_PASTED_TEXT_CHARS, KNOWLEDGE_MAX_TITLE_CHARS } from "@/lib/knowledge/constants";
import type { KnowledgeSourceType } from "@/lib/api/entity-types";

type ImportMode = "url" | "pasted_text" | "file";
type InvalidField = "title" | "url" | "text" | "file" | null;

const MODE_LABEL: Record<ImportMode, string> = { url: "URL", pasted_text: "Pasted text", file: "File" };
const ERROR_ID: Record<Exclude<InvalidField, null>, string> = {
  title: "knowledge-title-error",
  url: "knowledge-url-error",
  text: "knowledge-text-error",
  file: "knowledge-file-error",
};

/** Best-effort UX mapping only — the server independently sniffs magic bytes and is the real authority on file type. */
function detectFileSourceType(file: File): "image" | "video" | "audio" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

/**
 * 3-way segmented control (url/pasted_text/file) building FormData matching
 * knowledgeSourceCreateFieldsSchema. Plain toggle buttons (aria-pressed), not
 * a role="tab" tablist — a11y-architect review finding: this codebase has no
 * roving-tabindex/arrow-key handling, and a tablist role without that
 * keyboard behavior announces broken semantics to assistive tech, which is
 * worse than no ARIA role at all.
 */
export function KnowledgeImportForm() {
  const [mode, setMode] = useState<ImportMode>("url");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<InvalidField>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const createSource = useCreateKnowledgeSource();
  const { showToast } = useToast();

  const reset = () => {
    setTitle("");
    setUrl("");
    setText("");
    setFile(null);
    setClientError(null);
    setInvalidField(null);
    // The native <input type="file"> is uncontrolled — clearing `file` state
    // alone leaves its displayed filename stale. Remounting via a key is
    // simpler than holding a ref just to reset .value (a11y-architect
    // review finding).
    setFileInputKey((key) => key + 1);
  };

  const fail = (field: InvalidField, message: string) => {
    setInvalidField(field);
    setClientError(message);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setClientError(null);
    setInvalidField(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      fail("title", "Title is required");
      return;
    }
    if (trimmedTitle.length > KNOWLEDGE_MAX_TITLE_CHARS) {
      fail("title", `Title must be ${KNOWLEDGE_MAX_TITLE_CHARS} characters or fewer`);
      return;
    }

    let source_type: KnowledgeSourceType;
    if (mode === "url") {
      if (url.trim().length === 0) {
        fail("url", "URL is required");
        return;
      }
      source_type = "url";
    } else if (mode === "pasted_text") {
      if (text.trim().length === 0) {
        fail("text", "Text is required");
        return;
      }
      if (text.length > KNOWLEDGE_MAX_PASTED_TEXT_CHARS) {
        fail("text", `Pasted text must be ${KNOWLEDGE_MAX_PASTED_TEXT_CHARS.toLocaleString()} characters or fewer`);
        return;
      }
      source_type = "pasted_text";
    } else {
      if (!file) {
        fail("file", "A file is required");
        return;
      }
      const detected = detectFileSourceType(file);
      if (!detected) {
        fail("file", "Unsupported file type — expected an image, video, or audio file");
        return;
      }
      source_type = detected;
    }

    try {
      await createSource.mutateAsync({
        source_type,
        title: trimmedTitle,
        url: mode === "url" ? url.trim() : undefined,
        text: mode === "pasted_text" ? text : undefined,
        file: mode === "file" ? (file ?? undefined) : undefined,
      });
      showToast("Import started", "success");
      reset();
    } catch {
      showToast("Could not start the import", "error");
    }
  };

  const isBusy = createSource.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5" disabled={isBusy}>
        <legend className="sr-only">Import type</legend>
        <div className="flex gap-1 rounded-control border border-panel-border bg-bg-void-elevated p-1">
          {(Object.keys(MODE_LABEL) as ImportMode[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                setClientError(null);
                setInvalidField(null);
              }}
              className={`flex-1 rounded-control px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === option ? "bg-accent-indigo/15 text-accent-indigo" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {MODE_LABEL[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <FormField
        label="Title"
        htmlFor="knowledge-title"
        error={invalidField === "title" ? (clientError ?? undefined) : undefined}
        errorId={ERROR_ID.title}
      >
        <Input
          id="knowledge-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={KNOWLEDGE_MAX_TITLE_CHARS}
          invalid={invalidField === "title"}
          aria-describedby={invalidField === "title" ? ERROR_ID.title : undefined}
        />
      </FormField>

      {mode === "url" && (
        <FormField
          label="URL"
          htmlFor="knowledge-url"
          error={invalidField === "url" ? (clientError ?? undefined) : undefined}
          errorId={ERROR_ID.url}
        >
          <Input
            id="knowledge-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            invalid={invalidField === "url"}
            aria-describedby={invalidField === "url" ? ERROR_ID.url : undefined}
          />
        </FormField>
      )}

      {mode === "pasted_text" && (
        <FormField
          label="Text"
          htmlFor="knowledge-text"
          error={invalidField === "text" ? (clientError ?? undefined) : undefined}
          errorId={ERROR_ID.text}
        >
          <Textarea
            id="knowledge-text"
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={KNOWLEDGE_MAX_PASTED_TEXT_CHARS}
            invalid={invalidField === "text"}
            aria-describedby={invalidField === "text" ? ERROR_ID.text : undefined}
          />
        </FormField>
      )}

      {mode === "file" && (
        <FormField
          label="File"
          htmlFor="knowledge-file"
          error={invalidField === "file" ? (clientError ?? undefined) : undefined}
          errorId={ERROR_ID.file}
        >
          <input
            key={fileInputKey}
            id="knowledge-file"
            type="file"
            accept="image/*,video/*,audio/*"
            disabled={isBusy}
            aria-invalid={invalidField === "file" || undefined}
            aria-describedby={invalidField === "file" ? ERROR_ID.file : undefined}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm text-text-secondary file:mr-3 file:rounded-control file:border-0 file:bg-accent-indigo/15 file:px-3 file:py-1.5 file:text-accent-indigo disabled:opacity-50"
          />
        </FormField>
      )}

      <div className="flex justify-end">
        <Button type="submit" isLoading={isBusy}>
          Import
        </Button>
      </div>
    </form>
  );
}
