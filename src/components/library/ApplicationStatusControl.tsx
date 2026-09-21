"use client";

import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, type ApplicationStatus } from "@/lib/library/application-status";
import { Select } from "@/components/ui/Select";

type Props = {
  value: ApplicationStatus;
  onChange: (to: ApplicationStatus) => void;
  /** Names the control for assistive tech, e.g. "Status for Frontend Engineer". */
  label: string;
  disabled?: boolean;
  className?: string;
};

/** Any-to-any status picker — the non-drag way to move an application (POST .../transition). */
export function ApplicationStatusControl({ value, onChange, label, disabled = false, className = "" }: Props) {
  return (
    <Select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ApplicationStatus)}
      className={`py-1 font-mono text-xs ${className}`}
    >
      {APPLICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {APPLICATION_STATUS_LABEL[status]}
        </option>
      ))}
    </Select>
  );
}
