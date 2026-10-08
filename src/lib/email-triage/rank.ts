import { ACTIONABLE_BUCKETS, type TriageBucket, type TriageItem } from "@/lib/email-triage/types";

const BUCKET_ORDER: Record<TriageBucket, number> = { needs_action: 0, important: 1, fyi: 2, ignore: 3 };

export function bucketRank(bucket: TriageBucket): number {
  return BUCKET_ORDER[bucket];
}

/** Needs action first, then important, fyi, ignore; newest first within a bucket. Returns a new array. */
export function rankTriageItems<T extends { bucket: TriageBucket; receivedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || b.receivedAt.localeCompare(a.receivedAt),
  );
}

/** Open Important / Needs-action items, ranked: the "needs your attention" set. */
export function attentionItems(items: readonly TriageItem[]): TriageItem[] {
  return rankTriageItems(items.filter((item) => item.status === "open" && ACTIONABLE_BUCKETS.includes(item.bucket)));
}
