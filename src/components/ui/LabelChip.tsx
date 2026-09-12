import type { ReactNode } from "react";
import { labelSwatchClasses, type LabelColorToken } from "@/lib/label-colors";

type Props = {
  color: LabelColorToken | null;
  children: ReactNode;
  className?: string;
};

/** A Trello-style label pill — LABEL_COLOR_SWATCH_CLASSES' fixed palette, or a neutral outline for a colorless ("Remove color") label. Same pill sizing as Badge. */
export function LabelChip({ color, children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${labelSwatchClasses(color)} ${className}`}
    >
      {children}
    </span>
  );
}
