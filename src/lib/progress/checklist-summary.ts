export interface ChecklistSummaryRow {
  task_id: string;
  done: number;
  total: number;
}

/** Collapses a user's checklist rows into one done/total tally per task. Keeps first-seen task order. */
export function summarizeChecklistRows(rows: Array<{ task_id: string; is_done: boolean }>): ChecklistSummaryRow[] {
  const byTaskId = new Map<string, ChecklistSummaryRow>();
  for (const row of rows) {
    const tally = byTaskId.get(row.task_id) ?? { task_id: row.task_id, done: 0, total: 0 };
    tally.total += 1;
    if (row.is_done) tally.done += 1;
    byTaskId.set(row.task_id, tally);
  }
  return Array.from(byTaskId.values());
}
