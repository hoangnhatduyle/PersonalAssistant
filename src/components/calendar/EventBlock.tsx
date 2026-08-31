import Link from "next/link";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  title: string;
  subtitle?: string;
  top: number;
  height: number;
  tone: StatusTone;
  href: string;
};

/** Indigo (`accent` tone) for courses; the deadline status-tone map for deadlines. */
export function EventBlock({ title, subtitle, top, height, tone, href }: Props) {
  return (
    <Link
      href={href}
      className={`absolute inset-x-1 overflow-hidden rounded-control border px-2 py-1 text-xs transition-colors hover:brightness-125 ${toneClasses(tone)}`}
      style={{ top: `${top}%`, height: `${Math.max(height, 4)}%` }}
    >
      <p className="truncate font-medium">{title}</p>
      {subtitle && <p className="truncate text-[10px] opacity-80">{subtitle}</p>}
    </Link>
  );
}
