import { getResendClient } from "@/lib/email/resend-client";
import { renderReminderEmail, type ReminderEmailContent } from "@/lib/email/reminder-email";
import { requireEnv } from "@/lib/env";

/**
 * Thin wrapper isolating the actual Resend call so it's mockable in unit
 * tests without hitting the network. Throws on a Resend-returned error so
 * the caller (the send-reminder-emails cron route) can treat it as a
 * per-row failure and retry on the next tick, rather than silently
 * marking the reminder emailed.
 */
export async function sendReminderEmail(to: string, content: ReminderEmailContent): Promise<void> {
  const { subject, html, text } = renderReminderEmail(content);
  const { error } = await getResendClient().emails.send({
    from: requireEnv("RESEND_FROM_EMAIL"),
    to,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
