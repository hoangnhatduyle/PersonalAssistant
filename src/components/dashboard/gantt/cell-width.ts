import type { GanttUnit } from "@/lib/dashboard/gantt-rows";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MIN_CELL_PX: Record<GanttUnit, number> = { day: 26, week: 40 };
const MAX_CELL_PX: Record<GanttUnit, number> = { day: 56, week: 72 };
/** Used before the pane has been measured. */
const FALLBACK_CELL_PX: Record<GanttUnit, number> = { day: 44, week: 56 };

/**
 * Column width that makes the whole range fit the pane when it can, so most views need no horizontal scroll.
 * It never goes below a readable minimum (the chart then scrolls) or above a comfortable maximum (a short range
 * is not stretched into huge cells).
 */
export function fitCellWidth(unit: GanttUnit, rangeStart: Date, rangeEnd: Date, paneWidthPx: number): number {
  if (paneWidthPx <= 0) return FALLBACK_CELL_PX[unit];
  const days = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS));
  const columns = unit === "week" ? Math.ceil(days / WEEK_DAYS) : days;
  return Math.min(MAX_CELL_PX[unit], Math.max(MIN_CELL_PX[unit], Math.floor(paneWidthPx / columns)));
}

const LABEL_SHARE = 0.34;
const MIN_LABEL_PX = 84;
const MAX_LABEL_PX = 156;
const FALLBACK_LABEL_PX = 112;

/** Title-column width: about a third of the card, so the bars always keep the larger share, within readable limits. */
export function labelColumnWidth(totalWidthPx: number): number {
  if (totalWidthPx <= 0) return FALLBACK_LABEL_PX;
  return Math.min(MAX_LABEL_PX, Math.max(MIN_LABEL_PX, Math.round(totalWidthPx * LABEL_SHARE)));
}
