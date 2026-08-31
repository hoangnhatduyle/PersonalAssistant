"use client";

import { useState } from "react";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: (isoValue: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export function SnoozeUntilPicker({ onConfirm, onCancel, isSubmitting = false }: Props) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-panel-border p-3">
      <DateTimeField value={value} onChange={setValue} />
      <Button size="sm" disabled={!value} isLoading={isSubmitting} onClick={() => value && onConfirm(value)}>
        Confirm snooze
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
    </div>
  );
}
