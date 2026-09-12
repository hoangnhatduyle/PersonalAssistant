"use client";

import { useState } from "react";
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from "@/hooks/useLabels";
import { LabelChip } from "@/components/ui/LabelChip";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { LABEL_COLOR_SWATCH_CLASSES, LABEL_COLOR_TOKENS, type LabelColorToken } from "@/lib/label-colors";
import type { LabelRow } from "@/lib/api/entity-types";

type Props = {
  /** Omitted: create mode. Present: edit mode (Save/Delete instead of Create). */
  label?: LabelRow;
  onBack: () => void;
  /** Fires after a successful delete so the caller can drop this id from any in-progress selection (e.g. TaskForm's label_ids). */
  onDeleted?: (labelId: string) => void;
};

/** Step 2 of the Trello-style labels popover — a title + fixed-palette swatch grid, opened via a label row's pencil icon or "Create a new label". */
export function LabelEditor({ label, onBack, onDeleted }: Props) {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<LabelColorToken | null>(label?.color ?? null);
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel(label?.id ?? "");
  const deleteLabel = useDeleteLabel(label?.id ?? "");
  const { showToast } = useToast();

  const isSaving = createLabel.isPending || updateLabel.isPending;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (label) {
        await updateLabel.mutateAsync({ name: trimmed, color });
        showToast("Label updated", "success");
      } else {
        await createLabel.mutateAsync({ name: trimmed, color });
        showToast("Label created", "success");
      }
      onBack();
    } catch {
      showToast(label ? "Could not update label" : "Could not create label", "error");
    }
  };

  const handleDelete = async () => {
    if (!label) return;
    try {
      await deleteLabel.mutateAsync();
      showToast("Label deleted", "success");
      onDeleted?.(label.id);
    } catch {
      showToast("Could not delete label", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to labels list"
        className="self-start text-sm text-text-secondary hover:text-text-primary"
      >
        ‹ Back
      </button>

      <LabelChip color={color} className="self-start">
        {name.trim() || "Label preview"}
      </LabelChip>

      <FormField label="Title" htmlFor="label-title">
        <Input
          id="label-title"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Select a color</p>
        <div className="grid grid-cols-5 gap-2">
          {LABEL_COLOR_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              aria-label={token}
              aria-pressed={color === token}
              onClick={() => setColor(token)}
              className={`h-7 w-full rounded-control ${LABEL_COLOR_SWATCH_CLASSES[token]} ${
                color === token ? "ring-2 ring-accent-indigo ring-offset-1 ring-offset-bg-void-elevated" : ""
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setColor(null)}
          className="mt-1 self-start text-xs text-text-secondary hover:text-text-primary"
        >
          × Remove color
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {label ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            isLoading={deleteLabel.isPending}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={!name.trim()}
        >
          {label ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}
