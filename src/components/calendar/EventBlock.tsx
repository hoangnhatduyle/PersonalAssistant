import Link from "next/link";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  title: string;
  subtitle?: string;
  top: number;
  height: number;
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
export function EventBlock({ title, subtitle, top, height, tone, href, color }: Props) {
  return (
    <Link
      href={href}
      className={`absolute inset-x-1 overflow-hidden rounded-control border px-2 py-1 text-xs transition-colors hover:brightness-125 ${
        color ? "" : toneClasses(tone)
      }`}
      style={{
        top: `${top}%`,
        height: `${Math.max(height, 4)}%`,
        ...(color ? { backgroundColor: `${color}26`, borderColor: `${color}66`, color } : {}),
      }}
    >
      <p className="truncate font-medium">{title}</p>
      {subtitle && <p className="truncate text-[10px] opacity-80">{subtitle}</p>}
    </Link>
  );
}
