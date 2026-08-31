import type { ReactNode } from "react";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wide ${toneClasses(tone)} ${className}`}
    >
      {children}
    </span>
  );
}
