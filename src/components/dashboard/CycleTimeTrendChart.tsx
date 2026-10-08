"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CycleTimeTrendPoint } from "@/lib/dashboard/completion-trend";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, ChartTooltipShell, DayTick } from "@/components/dashboard/chart-theme";

type Props = {
  points: CycleTimeTrendPoint[];
};

type Datum = {
  index: number;
  avgDays: number | null;
  count: number;
  weekday: string;
  label: string;
  isLast: boolean;
};

/**
 * Daily average cycle time for MomentumCard: a 1.5px line over a faint
 * area fill, hairline grid, labelled day-count y-axis and weekday/date x-axis.
 * Days with no completions have no marker and the line bridges them; the
 * tooltip still says "No completions" so they're never read as a 0-day cycle.
 */
export function CycleTimeTrendChart({ points }: Props) {
  const gradientId = useId();
  const data: Datum[] = points.map((point, index) => ({
    index,
    avgDays: point.avgDays,
    count: point.count,
    weekday: index === points.length - 1 ? "Today" : point.date.toLocaleDateString("en-US", { weekday: "short" }),
    label: point.date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
    isLast: index === points.length - 1,
  }));

  return (
    <div className="h-48 w-full" role="img" aria-label="Daily average cycle time over the trailing week">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-teal)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--accent-teal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey="index"
            axisLine={{ stroke: "rgb(255 255 255 / 0.12)" }}
            tickLine={false}
            interval={0}
            height={36}
            padding={{ left: 12, right: 12 }}
            tick={(props) => {
              const datum = data[props.index];
              return <DayTick x={Number(props.x)} y={Number(props.y)} weekday={datum.weekday} date={datum.label} emphasised={datum.isLast} />;
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={32}
            tick={CHART_AXIS_TICK}
            tickFormatter={(value: number) => `${value}d`}
            allowDecimals={false}
            domain={[0, (max: number) => Math.max(2, Math.ceil(max))]}
          />
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.16)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const datum = payload[0].payload as Datum;
              return (
                <ChartTooltipShell title={`${datum.weekday} · ${datum.label}`}>
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    {datum.count === 0 ? "No completions" : `${datum.avgDays!.toFixed(1)}d avg`}
                  </span>
                  {datum.count > 0 && <span className="font-mono text-[10px] text-text-secondary">{datum.count} resolved</span>}
                </ChartTooltipShell>
              );
            }}
          />
          <Area
            type="linear"
            dataKey="avgDays"
            stroke="var(--accent-teal)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            connectNulls
            isAnimationActive={false}
            dot={{ r: 2.5, fill: "var(--bg-void-elevated)", stroke: "var(--accent-teal)", strokeWidth: 1.5 }}
            activeDot={{ r: 4, fill: "var(--accent-teal)", stroke: "var(--bg-void-elevated)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
