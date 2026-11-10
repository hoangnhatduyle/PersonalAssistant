/** Chart geometry shared by the chart, its title column and the box that holds them. Kept out of GanttChart so sizing the box never pulls the chart library into the first-load bundle. */
export const CELL_HEIGHT = 34;
export const SCALE_HEIGHT = 28;
/** The scale header is two rows (month over day/week). */
export const SCALE_ROWS = 2;
const SCROLLBAR_ALLOWANCE = 18;
/** Height that fits `rowCount` rows plus the scale header and the horizontal scrollbar. */
export function ganttHeightPx(rowCount: number): number {
  return SCALE_HEIGHT * SCALE_ROWS + CELL_HEIGHT * rowCount + SCROLLBAR_ALLOWANCE;
}
