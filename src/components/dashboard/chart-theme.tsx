import type { ReactNode } from "react";

/** Shared Recharts styling so the dashboard's charts read as one system. */
export const CHART_GRID_STROKE = "rgb(255 255 255 / 0.06)";
export const CHART_AXIS_TICK = { fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono, ui-monospace, monospace)" } as const;

export function ChartTooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none flex min-w-28 flex-col gap-1 rounded-md border border-panel-border-hover bg-bg-void-elevated px-2.5 py-1.5 shadow-panel">
      <span className="font-mono text-[10px] uppercase tracking-wide text-text-secondary">{title}</span>
      {children}
    </div>
  );
}

/** Two-line axis tick: weekday over MM/DD, the last/"today" slot emphasised. */
export function DayTick({
  x,
  y,
  weekday,
  date,
  emphasised,
  extra,
}: {
  x: number;
  y: number;
  weekday: string;
  date: string;
  emphasised: boolean;
  extra?: ReactNode;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={12} style={CHART_AXIS_TICK} fill={emphasised ? "var(--text-primary)" : "var(--text-secondary)"} fontWeight={emphasised ? 600 : 400}>
        {weekday}
      </text>
      <text textAnchor="middle" dy={24} style={CHART_AXIS_TICK} fill="var(--text-eyebrow)">
        {date}
      </text>
      {extra}
    </g>
  );
}
