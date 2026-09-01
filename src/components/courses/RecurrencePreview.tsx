"use client";

import { useFormContext } from "react-hook-form";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getNextOccurrence, formatBlocksSummary, formatMinutesOfDay, type MeetingBlock } from "@/lib/calendar/recurrence";
import type { CoursePayload } from "@/lib/api/schemas";

const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];
const PREVIEW_WINDOW_START = 8 * 60;
const PREVIEW_WINDOW_END = 18 * 60;
const PREVIEW_COLUMN_HEIGHT_PX = 140;

function isCompleteBlock(block: Partial<MeetingBlock> | undefined): block is MeetingBlock {
  return (
    Array.isArray(block?.days) &&
    block.days.length > 0 &&
    typeof block?.startMinutes === "number" &&
    typeof block?.endMinutes === "number" &&
    block.endMinutes > block.startMinutes
  );
}

/** "LIVE RECURRENCE PREVIEW" — next occurrence, a compact week grid, and a plain-language summary, all driven by the form's current in-memory values (no submit needed). */
export function RecurrencePreview() {
  const { watch } = useFormContext<CoursePayload>();
  const rawBlocks = watch("meeting_blocks") ?? [];
  const blocks = rawBlocks.filter(isCompleteBlock);
  const rangeStart = watch("recurrence_start_date") ?? null;
  const rangeEnd = watch("recurrence_end_date") ?? null;

  const next = getNextOccurrence(blocks, new Date(), rangeStart, rangeEnd);

  let windowStart = PREVIEW_WINDOW_START;
  let windowEnd = PREVIEW_WINDOW_END;
  for (const block of blocks) {
    windowStart = Math.min(windowStart, block.startMinutes);
    windowEnd = Math.max(windowEnd, block.endMinutes);
  }
  const span = windowEnd - windowStart;

  return (
    <GlassPanel className="flex flex-col gap-4 p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Live recurrence preview</p>

      <div className="flex flex-col gap-1 rounded-control border border-panel-border bg-bg-void-elevated p-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">Next occurrence</p>
        {next ? (
          <>
            <p className="font-display text-lg font-semibold text-text-primary">
              {next.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <p className="text-xs text-text-secondary">
              {formatMinutesOfDay(next.startMinutes)}–{formatMinutesOfDay(next.endMinutes)}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-secondary">Add a day and time to see the next occurrence.</p>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {DAY_ABBR.map((abbr, dayOfWeek) => {
          const dayBlocks = blocks.filter((block) => block.days.includes(dayOfWeek));
          return (
            <div key={dayOfWeek} className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px] uppercase text-text-eyebrow">{abbr}</span>
              <div
                className="relative w-full overflow-hidden rounded-control border border-panel-border bg-bg-void-elevated"
                style={{ height: PREVIEW_COLUMN_HEIGHT_PX }}
              >
                {dayBlocks.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="absolute inset-x-0.5 rounded-control bg-accent-indigo"
                    style={{
                      top: `${((block.startMinutes - windowStart) / span) * 100}%`,
                      height: `${((block.endMinutes - block.startMinutes) / span) * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-secondary">{formatBlocksSummary(blocks)}</p>
    </GlassPanel>
  );
}
