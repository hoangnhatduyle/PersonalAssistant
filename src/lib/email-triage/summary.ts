import { TRIAGE_VOICE_TOP_N } from "@/lib/email-triage/constants";
import { attentionItems } from "@/lib/email-triage/rank";
import type { SuggestedAction, TriageItem } from "@/lib/email-triage/types";

/** "Ada Lovelace <ada@x.com>" -> "Ada Lovelace"; a bare address -> its local part. */
export function senderName(sender: string): string {
  const named = sender.match(/^\s*"?([^"<]+?)"?\s*<[^>]*>\s*$/);
  if (named?.[1]?.trim()) return named[1].trim();
  const address = sender.match(/<([^>]+)>/)?.[1] ?? sender;
  return address.split("@")[0]?.trim() || "an unknown sender";
}

/** Speech-safe phrase for an offered next step (no ISO dates; the structured action carries them). */
export function describeSuggestedAction(action: SuggestedAction): string {
  switch (action.kind) {
    case "deadline":
      return `add a deadline called ${action.title}`;
    case "event":
      return `add a calendar event called ${action.title}`;
    case "task":
      return action.reminders_enabled
        ? `add a task with a reminder called ${action.title}`
        : `add a task called ${action.title}`;
  }
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Speech for the stored attention list: counts, the top few with their
 * one-line reasons, and an offer for the first one that has a suggested next
 * step. Subjects and reasons are email-derived text relayed as data.
 */
export function buildAttentionSpeech(items: readonly TriageItem[], limit: number = TRIAGE_VOICE_TOP_N): string {
  const ranked = attentionItems(items);
  if (ranked.length === 0) {
    return "You have no important or action-needed emails waiting from the latest check. Say check my email and I'll look for new ones.";
  }

  const needsAction = ranked.filter((item) => item.bucket === "needs_action").length;
  const important = ranked.length - needsAction;
  const parts: string[] = [];
  if (needsAction > 0) parts.push(`${countPhrase(needsAction, "email needs", "emails need")} action`);
  if (important > 0) parts.push(`${countPhrase(important, "is", "are")} important`);
  const sentences = [`${parts.join(" and ")}.`.replace(/^./, (c) => c.toUpperCase())];

  const top = ranked.slice(0, limit);
  top.forEach((item, index) => {
    const lead = index === 0 ? "First" : index === 1 ? "Next" : "Then";
    sentences.push(`${lead}, ${item.subject}, from ${senderName(item.sender)}: ${item.reason}`.replace(/[.!?]*$/, "."));
  });
  if (ranked.length > top.length) {
    sentences.push(`${countPhrase(ranked.length - top.length, "more is", "more are")} on your dashboard.`);
  }

  const withAction = top.find((item) => item.suggestedAction);
  if (withAction?.suggestedAction) {
    sentences.push(`For "${withAction.subject}" I can ${describeSuggestedAction(withAction.suggestedAction)}. Want me to?`);
  }
  return sentences.join(" ");
}
