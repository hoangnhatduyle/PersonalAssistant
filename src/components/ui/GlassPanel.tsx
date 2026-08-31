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

export function GlassPanel({ variant = "default", className = "", ...rest }: Props) {
  return (
    <div
      className={`rounded-panel border border-panel-border bg-panel backdrop-blur-md ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
