"use client";

import { useEffect, useRef, useState } from "react";
import { useLabels } from "@/hooks/useLabels";
import { LabelChip } from "@/components/ui/LabelChip";
import { LabelEditor } from "@/components/board/LabelEditor";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LabelRow } from "@/lib/api/entity-types";

type Step = { kind: "list" } | { kind: "edit"; label: LabelRow } | { kind: "create" };

type Props = {
  selectedLabelIds: string[];
  onToggleLabel: (labelId: string) => void;
};

/**
 * Trello's actual labels UI (screenshots-verified): a "+" trigger opens a
 * two-step popover — a searchable checklist of the user's labels (step 1),
 * or a title+fixed-palette editor for creating/editing one label (step 2,
 * reached via a row's pencil icon or "Create a new label"). Floats as a
 * popover anchored near the trigger, not a full Dialog.
 */
export function LabelsPopover({ selectedLabelIds, onToggleLabel }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: labels } = useLabels();

  function close() {
    setIsOpen(false);
    setStep({ kind: "list" });
    setSearch("");
  }

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleLabelDeleted(labelId: string) {
    if (selectedLabelIds.includes(labelId)) onToggleLabel(labelId);
    setStep({ kind: "list" });
  }

  const filteredLabels = (labels?.rows ?? []).filter((label) =>
    label.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button type="button" variant="secondary" size="sm" onClick={() => setIsOpen((value) => !value)}>
        + Labels
      </Button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-72 rounded-panel border border-panel-border bg-bg-void-elevated p-3 shadow-panel">
          {step.kind === "list" ? (
            <div className="flex flex-col gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search labels..."
              />

              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {filteredLabels.map((label) => (
                  <div key={label.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`toggle-label-${label.id}`}
                      label=""
                      aria-label={`Toggle label ${label.name}`}
                      checked={selectedLabelIds.includes(label.id)}
                      onChange={() => onToggleLabel(label.id)}
                    />
                    <LabelChip color={label.color} className="flex-1 justify-start truncate">
                      {label.name}
                    </LabelChip>
                    <button
                      type="button"
                      aria-label={`Edit ${label.name}`}
                      onClick={() => setStep({ kind: "edit", label })}
                      className="shrink-0 rounded p-1 text-text-secondary hover:text-text-primary"
                    >
                      ✎
                    </button>
                  </div>
                ))}
                {filteredLabels.length === 0 && (
                  <p className="px-1 py-2 text-xs text-text-secondary">No labels found.</p>
                )}
              </div>

              <Button type="button" variant="ghost" size="sm" onClick={() => setStep({ kind: "create" })}>
                Create a new label
              </Button>
            </div>
          ) : (
            <LabelEditor
              label={step.kind === "edit" ? step.label : undefined}
              onBack={() => setStep({ kind: "list" })}
              onDeleted={handleLabelDeleted}
            />
          )}
        </div>
      )}
    </div>
  );
}
