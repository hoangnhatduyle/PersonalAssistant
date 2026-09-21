"use client";

import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

export interface EntityOption {
  id: string;
  label: string;
}

type Props = {
  legend: string;
  options: EntityOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
  emptyText?: string;
};

/**
 * Filterable checkbox list for linking a post to People / Courses (no picker
 * component exists in the app; precedent: TaskForm's label toggle). Options
 * that are selected always stay visible, whatever the filter says.
 */
export function EntityMultiSelect({ legend, options, value, onChange, isLoading = false, emptyText = "Nothing to link yet" }: Props) {
  const [filter, setFilter] = useState("");
  const baseId = useId();
  const needle = filter.trim().toLowerCase();
  const visible = options.filter((option) => !needle || option.label.toLowerCase().includes(needle) || value.includes(option.id));

  const toggle = (id: string, checked: boolean) => onChange(checked ? [...value, id] : value.filter((existing) => existing !== id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-eyebrow">
        {legend}
        {value.length > 0 && <span className="ml-2 text-accent-indigo">{value.length} linked</span>}
      </legend>
      {options.length > 6 && (
        <Input type="search" aria-label={`Filter ${legend.toLowerCase()}`} placeholder="Filter…" value={filter} onChange={(event) => setFilter(event.target.value)} />
      )}
      {isLoading ? (
        <p className="text-sm text-text-secondary">Loading…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-text-secondary">{emptyText}</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-control border border-panel-border p-2">
          {visible.map((option) => (
            <Checkbox
              key={option.id}
              id={`${baseId}-${option.id}`}
              label={option.label}
              checked={value.includes(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
            />
          ))}
          {visible.length === 0 && <p className="text-sm text-text-secondary">No match</p>}
        </div>
      )}
    </fieldset>
  );
}
