"use client";

import { createPortal } from "react-dom";
import { KIND_LABEL, SOURCE_PHRASE, type GanttRow } from "@/lib/dashboard/gantt-rows";
import { formatDateTime } from "@/lib/format/zoned-datetime";
import { useUserTimezone } from "@/hooks/useUserTimezone";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const TOOLTIP_WIDTH_PX = 288;
const EDGE_GAP_PX = 8;
const ANCHOR_GAP_PX = 10;
/** Enough to decide whether the tooltip fits above its anchor; it flips below when it does not. */
const FLIP_THRESHOLD_PX = 200;

const KIND_TEXT: Record<GanttRow["kind"], string> = {
  deadline: "text-accent-teal",
  task: "text-accent-indigo",
  session: "text-status-warn",
};
const KIND_BAR: Record<GanttRow["kind"], string> = {
  deadline: "bg-accent-teal",
  task: "bg-accent-indigo",
  session: "bg-status-warn",
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };

function formatSpan(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `${days}d`;
  const hours = Math.max(1, Math.round(ms / HOUR_MS));
  return `${hours}h`;
}

/** "Overdue by 3d", "Due in 2d", "Ended 1d ago" — relative to now. */
function describeTiming(row: GanttRow, now: Date): string {
  const delta = row.end.getTime() - now.getTime();
  if (delta < 0) return `${row.overdue ? "Overdue by" : "Ended"} ${formatSpan(-delta)}${row.overdue ? "" : " ago"}`;
  return `${row.kind === "session" ? "Starts" : "Due"} in ${formatSpan(delta)}`;
}

type Props = {
  row: GanttRow;
  /** Box of the hovered bar or title, in viewport coordinates. */
  anchor: DOMRect;
  now: Date;
};

/**
 * Hover card for one Gantt row, shown for both its bar and its title. Fixed-positioned from the anchor's box and clamped
 * to the viewport, so it stays readable at the dialog's edges. Rendered into the body: the dialog scrolls and clips overflow.
 */
export function GanttTooltip({ row, anchor, now }: Props) {
  const timeZone = useUserTimezone();
  const fill = Math.min(100, Math.max(0, row.percent ?? 0));
  const sourcePhrase = SOURCE_PHRASE[row.source];

  const centerX = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(centerX - TOOLTIP_WIDTH_PX / 2, EDGE_GAP_PX), window.innerWidth - TOOLTIP_WIDTH_PX - EDGE_GAP_PX);
  const showBelow = anchor.top < FLIP_THRESHOLD_PX;
  const verticalStyle = showBelow ? { top: anchor.bottom + ANCHOR_GAP_PX } : { bottom: window.innerHeight - anchor.top + ANCHOR_GAP_PX };

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] rounded-lg border border-panel-border bg-bg-void-elevated px-3.5 py-3 shadow-panel-raised"
      style={{ left, width: TOOLTIP_WIDTH_PX, ...verticalStyle }}
    >
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide">
        <span className={KIND_TEXT[row.kind]}>{KIND_LABEL[row.kind]}</span>
        {row.overdue && <span className="rounded-full bg-status-urgent/15 px-2 py-0.5 text-status-urgent">Overdue</span>}
        <span className="text-text-eyebrow">· {describeTiming(row, now)}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug text-text-primary">{row.title}</p>

      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
        <dt className="text-text-eyebrow">Start</dt>
        <dd className="text-text-secondary">{formatDateTime(row.actualStart, timeZone, DATE_TIME_OPTIONS)}</dd>
        <dt className="text-text-eyebrow">{row.kind === "session" ? "End" : "Due"}</dt>
        <dd className="text-text-secondary">{formatDateTime(row.end, timeZone, DATE_TIME_OPTIONS)}</dd>
        <dt className="text-text-eyebrow">Span</dt>
        <dd className="text-text-secondary">{formatSpan(Math.max(0, row.end.getTime() - row.actualStart.getTime()))}</dd>
      </dl>

      <div className="mt-3 border-t border-panel-border pt-2.5">
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wide">
          <span className="text-text-eyebrow">Progress</span>
          <span className="text-text-primary">{row.percent == null ? "Not recorded" : `${row.percent}%`}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-border">
          <div className={`h-full rounded-full ${row.overdue ? "bg-status-urgent" : KIND_BAR[row.kind]}`} style={{ width: `${fill}%` }} />
        </div>
        {sourcePhrase && <p className="mt-1.5 font-mono text-[10px] text-text-secondary">{sourcePhrase}</p>}
        {row.note && <p className="mt-1 text-xs leading-snug text-text-secondary">{row.note}</p>}
      </div>
    </div>,
    document.body,
  );
}
