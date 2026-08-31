import type { TextareaHTMLAttributes, Ref } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  invalid?: boolean;
};

export function Textarea({ ref, invalid = false, className = "", ...rest }: Props) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-control border bg-bg-void-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 ${
        invalid ? "border-status-urgent" : "border-panel-border focus:border-panel-border-hover"
      } ${className}`}
      {...rest}
    />
  );
}
