"use client";

import { useId, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CycleTimeTrendPoint } from "@/lib/dashboard/completion-trend";

type Props = {
  points: CycleTimeTrendPoint[];
};

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 160;
const PAD_X = 20;
const TOP_Y = 16;
const BASELINE_Y = 138;
const GRIDLINE_FRACTIONS = [0, 0.5, 1];
const LABEL_PAD_PCT = (PAD_X / VIEW_WIDTH) * 100;

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

/**
 * Interactive cycle-time-per-day trend for MomentumCard: gradient-filled
 * line, a visible date axis (not just a hover-only tooltip), and a
 * pointer-tracked crosshair/tooltip. Nulls (no completions that day) plot
 * at the baseline with a hollow marker and their own tooltip copy, kept
 * visually distinct from a real 0-day cycle time.
 */
export function CycleTimeTrendChart({ points }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = useId();

  const step = points.length > 1 ? (VIEW_WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const maxAvgDays = Math.max(1, ...points.map((point) => point.avgDays ?? 0));
  const coords = points.map((point, index) => ({
    x: PAD_X + index * step,
    y: BASELINE_Y - ((point.avgDays ?? 0) / maxAvgDays) * (BASELINE_Y - TOP_Y),
  }));

  const linePath = coords.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${BASELINE_Y} L ${coords[0].x} ${BASELINE_Y} Z`
      : "";

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const index = Math.round(relativeX * (points.length - 1));
    setHoveredIndex(Math.min(points.length - 1, Math.max(0, index)));
  }

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoveredCoord = hoveredIndex !== null ? coords[hoveredIndex] : null;
  const tooltipLeftPct = hoveredCoord ? (hoveredCoord.x / VIEW_WIDTH) * 100 : 0;
  const tooltipAlign = hoveredIndex === 0 ? "left-0 translate-x-0" : hoveredIndex === points.length - 1 ? "right-0 translate-x-0" : "-translate-x-1/2";

  return (
    <div className="relative">
      {hovered && hoveredCoord && (
        <div
          className={`pointer-events-none absolute top-0 z-10 flex flex-col rounded-md border border-panel-border-hover bg-bg-void-elevated px-2 py-1 shadow-panel ${tooltipAlign}`}
          style={hoveredIndex !== 0 && hoveredIndex !== points.length - 1 ? { left: `${tooltipLeftPct}%` } : undefined}
        >
          <span className="font-mono text-[10px] text-text-secondary">{formatShortDate(hovered.date)}</span>
          <span className="font-mono text-xs font-semibold text-text-primary">
            {hovered.count === 0 ? "No completions" : `${hovered.avgDays!.toFixed(1)}d · ${hovered.count} resolved`}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-44 w-full touch-none"
        role="img"
        aria-label="Daily average cycle time over the trailing week"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-teal)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent-teal)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {GRIDLINE_FRACTIONS.map((fraction) => {
          const y = TOP_Y + fraction * (BASELINE_Y - TOP_Y);
          return (
            <line
              key={fraction}
              x1={PAD_X}
              x2={VIEW_WIDTH - PAD_X}
              y1={y}
              y2={y}
              className="stroke-panel-border"
              strokeWidth={1}
              strokeDasharray={fraction === 1 ? undefined : "3 4"}
            />
          );
        })}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        {linePath && <path d={linePath} fill="none" className="stroke-accent-teal" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {hoveredCoord && (
          <line x1={hoveredCoord.x} x2={hoveredCoord.x} y1={TOP_Y} y2={BASELINE_Y} className="stroke-panel-border-hover" strokeWidth={1} />
        )}

        {coords.map((coord, index) => {
          const point = points[index];
          const isHovered = hoveredIndex === index;
          const hasData = point.count > 0;
          return (
            <circle
              key={point.date.toISOString()}
              cx={coord.x}
              cy={coord.y}
              r={isHovered ? 5 : hasData ? 3 : 2.5}
              className={hasData ? "fill-accent-teal" : "fill-bg-void-elevated stroke-panel-border-hover"}
              strokeWidth={hasData ? 0 : 1.5}
            />
          );
        })}
      </svg>

      <div
        className="mt-1.5 flex justify-between font-mono text-[10px] leading-none text-text-secondary"
        style={{ paddingLeft: `${LABEL_PAD_PCT}%`, paddingRight: `${LABEL_PAD_PCT}%` }}
      >
        {points.map((point, index) => (
          <span
            key={point.date.toISOString()}
            className={index === points.length - 1 ? "text-text-primary" : undefined}
          >
            {formatShortDate(point.date)}
          </span>
        ))}
      </div>
    </div>
  );
}
