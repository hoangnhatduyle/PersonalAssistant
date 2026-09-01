"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type DialogSize = "md" | "xl";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "md" (default) fits the usual single-column forms; "xl" is for wider content like CourseForm's two-column recurrence picker. */
  size?: DialogSize;
};

const SIZE_CLASSES: Record<DialogSize, string> = {
  md: "max-w-lg",
  xl: "max-w-5xl",
};

export function Dialog({ open, onClose, title, children, size = "md" }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-bg-void/80 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`relative flex max-h-[85vh] w-full flex-col rounded-panel border border-panel-border bg-bg-void-elevated p-6 shadow-panel ${SIZE_CLASSES[size]}`}
      >
        <h2 id="dialog-title" className="mb-4 shrink-0 font-display text-lg font-semibold text-text-primary">
          {title}
        </h2>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
