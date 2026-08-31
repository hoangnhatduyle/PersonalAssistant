import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor?: string;
  error?: string;
  /** id for the rendered error <p>, so a field's `aria-describedby` can point at it. */
  errorId?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, error, errorId, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-status-urgent">
          {error}
        </p>
      )}
    </div>
  );
}
