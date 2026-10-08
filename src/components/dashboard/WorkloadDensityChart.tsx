"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DensityDayBucket } from "@/lib/dashboard/workload-density";
import { ITEM_KIND_LABEL } from "@/lib/dashboard/item-kind";
import { CHART_AXIS_TICK, CHART_GRID_STROKE, ChartTooltipShell, DayTick } from "@/components/dashboard/chart-theme";

type Props = {
  buckets: DensityDayBucket[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

// Same hues as ITEM_KIND_BG_CLASS, as raw CSS vars for SVG fills.
const KIND_FILL = {
  deadline: "var(--accent-teal)",
  task: "var(--accent-indigo)",
} as const;

function parseLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type Datum = DensityDayBucket & { weekday: string; label: string };

/**
 * Stripe-style stacked bars: hairline horizontal grid, integer y-axis,
 * muted fills with today (or the selected day) at full strength, and a
 * weekday + date axis. Click a bar to drill into that day.
 */
export function WorkloadDensityChart({ buckets, selectedDate, onSelectDate }: Props) {
  const data: Datum[] = buckets.map((bucket) => {
    const date = parseLocalDate(bucket.date);
    return {
      ...bucket,
      weekday: bucket.dayOffset === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
      label: date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
      }),
    };
  });

  const opacityFor = (bucket: Datum) => {
    if (selectedDate) return bucket.date === selectedDate ? 1 : 0.35;
    return bucket.dayOffset === 0 ? 1 : 0.6;
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Sessions are planned time, not owed work, so they get their own strip
          instead of inflating the bars. Padding mirrors the chart's y-axis
          width (24) and right margin (4) so each cell sits over its day. */}
      <p className="font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">Sessions planned</p>
      <div className="grid grid-cols-7 pl-6 pr-1" data-testid="session-strip">
        {data.map((bucket) => (
          <div key={bucket.date} className="flex justify-center">
            {bucket.sessionCount > 0 ? (
              <button
                type="button"
                onClick={() => onSelectDate(bucket.date)}
                title={`${bucket.sessionCount} session(s) planned`}
                aria-label={`${bucket.sessionCount} sessions planned on ${bucket.label}`}
                className="flex items-center gap-1.5 rounded-full bg-status-ok/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-status-ok transition-colors hover:bg-status-ok/25"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-ok" />
                {bucket.sessionCount}
              </button>
            ) : (
              <span className="py-0.5 font-mono text-[11px] text-text-eyebrow/50" aria-hidden>
                –
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="h-48 w-full" role="img" aria-label="Open deadlines and tasks due per day over the next 7 days">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
            <XAxis
              dataKey="date"
              axisLine={{ stroke: "rgb(255 255 255 / 0.12)" }}
              tickLine={false}
              interval={0}
              height={44}
              tick={(props) => {
                const datum = data[props.index];
                return (
                  <DayTick
                    x={Number(props.x)}
                    y={Number(props.y)}
                    weekday={datum.weekday}
                    date={datum.label}
                    emphasised={datum.dayOffset === 0}
                  />
                );
              }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={24}
              tick={CHART_AXIS_TICK}
              domain={[0, (max: number) => Math.max(3, max)]}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const bucket = payload[0].payload as Datum;
                return (
                  <ChartTooltipShell title={`${bucket.weekday === "Today" ? "Today" : bucket.weekday} · ${bucket.label}`}>
                    <span className="font-mono text-xs font-semibold text-text-primary">{bucket.total} due</span>
                    <span className="font-mono text-[10px] text-text-secondary">
                      {bucket.deadlineCount} {ITEM_KIND_LABEL.deadline.toLowerCase()} · {bucket.taskCount}{" "}
                      {ITEM_KIND_LABEL.task.toLowerCase()}
                    </span>
                    {bucket.sessionCount > 0 && (
                      <span className="font-mono text-[10px] text-text-secondary">{bucket.sessionCount} session(s) planned</span>
                    )}
                  </ChartTooltipShell>
                );
              }}
            />
            {(["deadline", "task"] as const).map((kind) => (
              <Bar
                key={kind}
                dataKey={`${kind}Count`}
                stackId="due"
                fill={KIND_FILL[kind]}
                maxBarSize={28}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(_: unknown, index: number) => onSelectDate(data[index].date)}
              >
                {data.map((bucket) => (
                  <Cell key={bucket.date} fillOpacity={opacityFor(bucket)} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
