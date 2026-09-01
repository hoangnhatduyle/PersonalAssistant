export interface ReminderEmailContent {
  targetType: "deadline" | "task";
  title: string;
  dueAt: string;
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

export function renderReminderEmail(content: ReminderEmailContent): RenderedEmail {
  const label = content.targetType === "deadline" ? "Deadline" : "Task";
  const dueDate = new Date(content.dueAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const subject = `Reminder: ${content.title}`;
  const text = `${label} reminder: "${content.title}" is due ${dueDate}.`;
  const html = `<p>${label} reminder: <strong>${escapeHtml(content.title)}</strong> is due ${dueDate}.</p>`;
  return { subject, html, text };
}
