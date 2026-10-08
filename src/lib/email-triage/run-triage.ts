import { MailReauthRequiredError } from "@/lib/mail/errors";
import type { MailMessage, MailProvider } from "@/lib/mail/types";
import {
  TRIAGE_MAX_MESSAGES,
  TRIAGE_MAX_STAGE2,
  TRIAGE_STAGE2_CONCURRENCY,
} from "@/lib/email-triage/constants";
import { normalizeSuggestedAction } from "@/lib/email-triage/normalize-action";
import { clampTriageDays, triageSince } from "@/lib/email-triage/range";
import { bucketRank } from "@/lib/email-triage/rank";
import { buildStage1Inputs, type Stage1Input, type Stage1Result } from "@/lib/email-triage/stage1";
import {
  prepareBodyForModel,
  type RawSuggestedAction,
  type Stage2Input,
  type TriageCourse,
} from "@/lib/email-triage/stage2";
import {
  ACTIONABLE_BUCKETS,
  type SuggestedAction,
  type TriageBucket,
  type TriageItem,
  type TriageRunOutcome,
} from "@/lib/email-triage/types";

export interface TriageAccount {
  id: string;
  refreshToken: string;
}

/** A non-expired stored row for a message in range (any status). */
export interface ExistingTriageRow {
  id: string;
  messageId: string;
  bucket: TriageBucket;
  status: string;
  stage2At: string | null;
  receivedAt: string;
}

export interface NewTriageRow {
  accountId: string;
  message: MailMessage;
  bucket: TriageBucket;
  reason: string;
  suggestedAction: SuggestedAction | null;
  /** Set when stage 2 ran to completion for this row (even with no action). */
  stage2At: string | null;
}

export interface Stage2Update {
  id: string;
  suggestedAction: SuggestedAction | null;
  stage2At: string;
}

/** Everything the run touches outside pure logic. Production wiring is deps.ts; tests inject fakes. */
export interface TriageDeps {
  now(): Date;
  /** Throws MailReauthRequiredError when the stored token can't be decrypted. */
  getAccount(): Promise<TriageAccount | null>;
  /** Records a run and returns false when the per-user run cap is hit. */
  checkRateLimit(): Promise<boolean>;
  /** Throws MailReauthRequiredError on a revoked grant. */
  refreshAccessToken(refreshToken: string): Promise<string>;
  searchUnread(accessToken: string, since: Date, max: number): Promise<{ messages: MailMessage[]; truncated: boolean }>;
  fetchBody(accessToken: string, messageId: string): Promise<{ html: string | null; text: string | null }>;
  loadExisting(accountId: string, messageIds: string[]): Promise<ExistingTriageRow[]>;
  loadCourses(): Promise<TriageCourse[]>;
  getTimeZone(): Promise<string>;
  classify(inputs: Stage1Input[]): Promise<Stage1Result[]>;
  extract(input: Stage2Input): Promise<RawSuggestedAction | null>;
  saveNew(rows: NewTriageRow[]): Promise<void>;
  saveStage2(updates: Stage2Update[]): Promise<void>;
  loadOpenItems(): Promise<TriageItem[]>;
}

export interface RunTriageInput {
  provider: MailProvider;
  days?: number | null;
}

interface Stage2Candidate {
  messageId: string;
  bucket: TriageBucket;
  receivedAt: string;
  subject: string;
  from: string;
  /** Set for stage-2 retries of an already-stored row; absent for rows classified this run. */
  existingId?: string;
}

function localDateKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Runs items through `worker` with at most `limit` in flight. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * One manual triage run for one account: list unread inbox mail in range,
 * classify new messages from subject + sender + snippet only (stage 1), then
 * fetch bodies for the top Important / Needs-action ones only to extract a
 * suggested next step (stage 2). Stage 1 failures throw (nothing stored,
 * nothing defaults to a bucket); stage 2 failures are per-message and
 * non-fatal. Message bodies are never stored or logged.
 */
export async function runEmailTriage(deps: TriageDeps, input: RunTriageInput): Promise<TriageRunOutcome> {
  const now = deps.now();
  let accessToken: string;
  let account: TriageAccount;
  try {
    const found = await deps.getAccount();
    if (!found) return { status: "not_connected" };
    account = found;

    // Only runs that would reach the provider spend rate-limit budget.
    if (!(await deps.checkRateLimit())) return { status: "rate_limited" };

    accessToken = await deps.refreshAccessToken(account.refreshToken);
  } catch (error) {
    if (error instanceof MailReauthRequiredError) return { status: "needs_reauth" };
    throw error;
  }

  const days = clampTriageDays(input.days);
  const since = triageSince(now, days);

  let listed: { messages: MailMessage[]; truncated: boolean };
  try {
    listed = await deps.searchUnread(accessToken, since, TRIAGE_MAX_MESSAGES);
  } catch (error) {
    if (error instanceof MailReauthRequiredError) return { status: "needs_reauth" };
    throw error;
  }
  const messages = listed.messages.slice(0, TRIAGE_MAX_MESSAGES);

  const existing = await deps.loadExisting(
    account.id,
    messages.map((message) => message.id),
  );
  const existingById = new Map(existing.map((row) => [row.messageId, row]));
  const fresh = messages.filter((message) => !existingById.has(message.id));

  // Stage 1: one batched call over everything not already triaged.
  const classified: Array<{ message: MailMessage; bucket: TriageBucket; reason: string }> = [];
  if (fresh.length > 0) {
    const { inputs, byRef } = buildStage1Inputs(fresh);
    const results = await deps.classify(inputs);
    for (const result of results) {
      const message = byRef.get(result.ref);
      if (message) classified.push({ message, bucket: result.bucket, reason: result.reason });
    }
  }

  // Stage 2 candidates: newly classified actionable mail + earlier rows whose stage 2 never completed.
  const candidates: Stage2Candidate[] = [
    ...classified
      .filter((row) => ACTIONABLE_BUCKETS.includes(row.bucket))
      .map(
        (row): Stage2Candidate => ({
          messageId: row.message.id,
          bucket: row.bucket,
          receivedAt: row.message.receivedAt,
          subject: row.message.subject,
          from: row.message.from,
        }),
      ),
    ...existing
      .filter((row) => row.status === "open" && ACTIONABLE_BUCKETS.includes(row.bucket) && row.stage2At === null)
      .map((row): Stage2Candidate | null => {
        const message = messages.find((candidate) => candidate.id === row.messageId);
        if (!message) return null;
        return {
          messageId: row.messageId,
          bucket: row.bucket,
          receivedAt: row.receivedAt,
          subject: message.subject,
          from: message.from,
          existingId: row.id,
        };
      })
      .filter((candidate): candidate is Stage2Candidate => candidate !== null),
  ]
    .sort((a, b) => bucketRank(a.bucket) - bucketRank(b.bucket) || b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, TRIAGE_MAX_STAGE2);

  const stage2Done = new Map<string, { action: SuggestedAction | null; at: string }>();
  if (candidates.length > 0) {
    const [courses, timeZone] = await Promise.all([deps.loadCourses(), deps.getTimeZone()]);
    const courseIds = new Set(courses.map((course) => course.id));
    const today = localDateKey(now, timeZone);

    await mapWithConcurrency(candidates, TRIAGE_STAGE2_CONCURRENCY, async (candidate) => {
      try {
        const body = prepareBodyForModel(await deps.fetchBody(accessToken, candidate.messageId));
        const raw = await deps.extract({
          subject: candidate.subject,
          from: candidate.from,
          receivedAt: candidate.receivedAt,
          body,
          now: now.toISOString(),
          timeZone,
          today,
          courses,
        });
        const action = normalizeSuggestedAction(raw, { now, today, courseIds });
        stage2Done.set(candidate.messageId, { action, at: deps.now().toISOString() });
      } catch (error) {
        // Non-fatal: the row is kept without an action and retried next run. Log the failure kind only, never content.
        console.error(`email triage stage 2 failed (${error instanceof Error ? error.name : "unknown"})`);
      }
    });
  }

  if (classified.length > 0) {
    await deps.saveNew(
      classified.map((row) => {
        const done = stage2Done.get(row.message.id);
        return {
          accountId: account.id,
          message: row.message,
          bucket: row.bucket,
          reason: row.reason,
          suggestedAction: done?.action ?? null,
          stage2At: done?.at ?? null,
        };
      }),
    );
  }

  const retryUpdates: Stage2Update[] = [];
  for (const candidate of candidates) {
    const done = stage2Done.get(candidate.messageId);
    if (candidate.existingId && done) {
      retryUpdates.push({ id: candidate.existingId, suggestedAction: done.action, stage2At: done.at });
    }
  }
  if (retryUpdates.length > 0) await deps.saveStage2(retryUpdates);

  return {
    status: "ok",
    items: await deps.loadOpenItems(),
    stats: {
      considered: messages.length,
      classified: classified.length,
      stage2: stage2Done.size,
      skippedAlreadyTriaged: existing.length,
      truncated: listed.truncated || listed.messages.length > TRIAGE_MAX_MESSAGES,
    },
  };
}
