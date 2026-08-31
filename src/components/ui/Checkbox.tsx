import type { InputHTMLAttributes, Ref } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  ref?: Ref<HTMLInputElement>;
  label: string;
};

export function Checkbox({ ref, label, id, className = "", ...rest }: Props) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label htmlFor={inputId} className={`flex items-center gap-2 text-sm text-text-primary ${className}`}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-panel-border bg-bg-void-elevated text-accent-indigo focus:ring-2 focus:ring-accent-indigo/50"
        {...rest}
      />
      {label}
    </label>
  );
}
