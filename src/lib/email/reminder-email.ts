import type { Database } from "@/lib/supabase/types";
import { formatRelativeTime } from "@/lib/format-relative-time";

type ItemPriority = Database["public"]["Enums"]["item_priority"];

export interface ReminderEmailContent {
  targetType: "deadline" | "task";
  title: string;
  dueAt: string;
  priority?: ItemPriority | null;
  /** Task-kind only. */
  tags?: string[];
  /** Deadline-kind only — its parent course's name. */
  courseName?: string | null;
  /** Absolute link back into the app (e.g. `${REMINDER_EMAIL_URL}/board/{id}`), omitted when the base URL isn't configured. */
  itemUrl?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

// Literal hex values, not Tailwind classes/CSS vars — email clients strip
// <style> blocks and don't resolve custom properties, so every color here
// is copied from src/styles/tokens.css and src/lib/status-colors.ts by hand.
// Keep these two files in sync if the app's palette changes.
const COLOR = {
  void: "#05070d",
  panel: "#10131c",
  panelBorder: "#242938",
  textPrimary: "#f4f6fb",
  textSecondary: "#94a3b8",
  textEyebrow: "#64748b",
  accentTeal: "#2dd4bf",
  accentIndigo: "#6366f1",
  statusOk: "#2dd4bf",
  statusWarn: "#f59e0b",
  statusUrgent: "#fb7185",
  statusNeutral: "#64748b",
} as const;

// Mirrors ITEM_KIND_FILL_CLASS (src/lib/dashboard/item-kind.ts): deadline is
// teal, task is indigo, everywhere else in the app.
const KIND_ACCENT: Record<ReminderEmailContent["targetType"], string> = {
  deadline: COLOR.accentTeal,
  task: COLOR.accentIndigo,
};

// Mirrors ITEM_PRIORITY_TONE (src/lib/status-colors.ts) mapped to literal hex.
const PRIORITY_COLOR: Record<ItemPriority, string> = {
  Low: COLOR.statusNeutral,
  Medium: COLOR.accentIndigo,
  High: COLOR.statusWarn,
  Urgent: COLOR.statusUrgent,
};

function pill(label: string, color: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;border:1px solid ${color}4d;background:${color}26;color:${color};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(label)}</span>`;
}

export function renderReminderEmail(content: ReminderEmailContent): RenderedEmail {
  const label = content.targetType === "deadline" ? "Deadline" : "Task";
  const dueDate = new Date(content.dueAt);
  const now = new Date();
  const isPastDue = dueDate.getTime() < now.getTime();
  const dueDateFormatted = dueDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const relative = formatRelativeTime(dueDate, now);
  const accent = KIND_ACCENT[content.targetType];

  const subject = `Reminder: ${content.title}`;

  const metaPills = [
    pill(`${label} reminder`, accent),
    ...(isPastDue ? [pill("Past due", COLOR.statusUrgent)] : []),
    ...(content.priority ? [pill(`${content.priority} priority`, PRIORITY_COLOR[content.priority])] : []),
    ...(content.courseName ? [pill(content.courseName, COLOR.accentIndigo)] : []),
    ...(content.tags ?? []).map((tag) => pill(tag, COLOR.statusNeutral)),
  ].join("");

  const button = content.itemUrl
    ? `<a href="${escapeHtml(content.itemUrl)}" style="display:inline-block;margin-top:22px;padding:11px 22px;border-radius:8px;background:${COLOR.accentTeal};color:${COLOR.void};font-family:ui-sans-serif,Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">Open in Cadence &rarr;</a>`
    : "";
  const settingsUrl = content.itemUrl ? `${new URL(content.itemUrl).origin}/settings` : null;

  const html = `
<div style="background:${COLOR.void};padding:32px 16px;font-family:ui-sans-serif,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="padding-bottom:16px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${COLOR.accentTeal};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.textEyebrow};vertical-align:middle;">Cadence</span>
      </td>
    </tr>
    <tr>
      <td style="background:${COLOR.panel};border:1px solid ${COLOR.panelBorder};border-radius:16px;padding:28px;">
        <div>${metaPills}</div>
        <p style="margin:18px 0 0;font-size:21px;line-height:1.35;font-weight:600;color:${COLOR.textPrimary};font-family:ui-sans-serif,Arial,sans-serif;">
          ${escapeHtml(content.title)}
        </p>
        <p style="margin:10px 0 0;font-size:14px;color:${COLOR.textSecondary};">
          Due ${dueDateFormatted} &middot; <span style="color:${isPastDue ? COLOR.statusUrgent : COLOR.textSecondary};">${relative}</span>
        </p>
        ${button}
      </td>
    </tr>
    <tr>
      <td style="padding-top:18px;font-size:12px;line-height:1.6;color:${COLOR.textEyebrow};">
        Automated reminder from Cadence.${settingsUrl ? ` Manage this in <a href="${escapeHtml(settingsUrl)}" style="color:${COLOR.textEyebrow};">Settings</a>.` : ""}
      </td>
    </tr>
  </table>
</div>`.trim();

  const textLines = [
    `${label} reminder: "${content.title}"`,
    `Due ${dueDateFormatted} (${relative})${isPastDue ? " — PAST DUE" : ""}`,
    content.priority ? `Priority: ${content.priority}` : null,
    content.courseName ? `Course: ${content.courseName}` : null,
    content.tags && content.tags.length > 0 ? `Tags: ${content.tags.join(", ")}` : null,
    content.itemUrl ? `Open: ${content.itemUrl}` : null,
  ].filter((line): line is string => line !== null);
  const text = textLines.join("\n");

  return { subject, html, text };
}
