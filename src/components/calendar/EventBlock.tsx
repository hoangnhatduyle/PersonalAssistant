import Link from "next/link";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  title: string;
  timeLabel: string;
  subtitle: string;
  topPx: number;
  heightPx: number;
  leftPx: number;
  widthPx: number;
  tone: StatusTone;
  href: string;
  /** A tracked Person's hex color (People feature) — takes rendering priority over `tone` when set. */
  color?: string;
};

/**
 * Indigo (`accent` tone) for the account owner's own courses; the deadline/
 * task status-tone maps for their deadlines/tasks. When `color` is set (a
 * tracked Person's event, not the account owner's own — see
 * src/lib/calendar/build-week-events.ts), it renders via inline style
 * instead, so an arbitrary number of people can each get a distinct color
 * without needing a StatusTone entry per person.
 */
export function EventBlock({ title, timeLabel, subtitle, topPx, heightPx, leftPx, widthPx, tone, href, color }: Props) {
  return (
    <Link
      href={href}
      className={`absolute overflow-hidden rounded-control border px-2 py-1.5 text-xs transition-colors hover:brightness-125 ${
        color ? "" : toneClasses(tone)
      }`}
      style={{
        top: topPx,
        left: leftPx,
        width: widthPx,
        height: heightPx,
        ...(color ? { backgroundColor: `${color}26`, borderColor: `${color}66`, color } : {}),
      }}
    >
      <div className="flex h-full flex-col justify-between gap-0.5">
        <p className="line-clamp-1 text-xs font-medium leading-tight">{title}</p>
        <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{timeLabel}</p>
        <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{subtitle}</p>
      </div>
    </Link>
  );
}
