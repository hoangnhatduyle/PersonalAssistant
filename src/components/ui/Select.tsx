import type { SelectHTMLAttributes, Ref } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: Ref<HTMLSelectElement>;
  invalid?: boolean;
};

export function Select({ ref, invalid = false, className = "", children, ...rest }: Props) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-control border bg-bg-void-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 ${
        invalid ? "border-status-urgent" : "border-panel-border focus:border-panel-border-hover"
      } ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
