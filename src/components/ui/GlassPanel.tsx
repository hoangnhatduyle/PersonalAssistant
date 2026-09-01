import type { HTMLAttributes } from "react";

type GlassPanelVariant = "default" | "interactive" | "glow-ok" | "glow-warn" | "glow-urgent";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: GlassPanelVariant;
};

const VARIANT_CLASSES: Record<GlassPanelVariant, string> = {
  default: "shadow-panel",
  interactive: "shadow-panel transition-colors hover:border-panel-border-hover cursor-pointer",
  "glow-ok": "glow-ok",
  "glow-warn": "glow-warn",
  "glow-urgent": "glow-urgent",
};

// No backdrop-blur: every usage sits in normal document flow on the flat
// --bg-void background, never overlapping other content, so blur has zero
// visible effect while still forcing a per-frame recomposite on scroll —
// this was the main cause of janky scrolling in panel-heavy views (e.g. the
// course form's recurrence picker/preview).
export function GlassPanel({ variant = "default", className = "", ...rest }: Props) {
  return (
    <div
      className={`rounded-panel border border-panel-border bg-panel ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
