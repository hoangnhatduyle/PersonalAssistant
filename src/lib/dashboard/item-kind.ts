export type ItemKind = "deadline" | "task" | "reminder" | "session" | "appointment";

/**
 * Single source of truth for how each dashboard item kind is labeled and
 * colored, shared by WorkloadDensityStrip (bar segments + legend) and
 * UpNextPanel (clock ring dots + queue rows). Deliberately never reuses
 * status-urgent (red) for a kind's base color — that hue is reserved for
 * the urgent/past-due overlay, so it stays meaningful wherever it appears.
 */
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  deadline: "Deadline",
  task: "Task",
  reminder: "Reminder",
  session: "Session",
  appointment: "Event",
};

/** Tailwind `bg-*` classes — legend dots, stacked bar segments. */
export const ITEM_KIND_BG_CLASS: Record<ItemKind, string> = {
  deadline: "bg-accent-teal",
  task: "bg-accent-indigo",
  reminder: "bg-status-neutral",
  session: "bg-status-ok",
  appointment: "bg-status-warn",
};

/** Tailwind `fill-*` classes — SVG contexts (Up Next's clock ring dots). */
export const ITEM_KIND_FILL_CLASS: Record<ItemKind, string> = {
  deadline: "fill-accent-teal",
  task: "fill-accent-indigo",
  reminder: "fill-status-neutral",
  session: "fill-status-ok",
  appointment: "fill-status-warn",
};
