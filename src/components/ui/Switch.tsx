type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
};

/** Labeled on/off toggle (role="switch") — for a setting that applies immediately, unlike Checkbox which reads as a form field. */
export function Switch({ checked, onCheckedChange, label, className = "" }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-control text-sm text-text-secondary outline-offset-2 transition-colors hover:text-text-primary focus-visible:outline-accent-indigo ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-accent-indigo bg-accent-indigo" : "border-panel-border bg-bg-void-elevated"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
