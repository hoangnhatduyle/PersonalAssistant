import type { EntityContext, RawMutation } from "@/lib/voice/intent";
import type { DraftMutationRecord } from "@/lib/voice/conversation-memory";

/**
 * Deterministic handling for reopening a closed Board card by voice.
 *
 * "Duplicate" and "reopen" mean the same thing to the user: a Done card is
 * terminal (guard_task_status), so reopening it means copying it into a fresh
 * Open card (duplicate_task, 0052_duplicate_task.sql). The model proposes
 * operation "duplicate"; everything that can go wrong with *which card* is
 * decided here in code rather than trusted to the prompt, for the same reason
 * transition-legality-gate.ts exists -- a soft instruction is not a reliable
 * way to enforce a rule:
 *
 * - Open cards win. Titles repeat (a card that was duplicated and finished
 *   again leaves several Done cards plus the Open copy), so a spoken name can
 *   match many rows. A card that is still Open is what the user means by
 *   "mark X done" / "cancel X", so a task transition aimed at a non-Open
 *   duplicate-titled row is retargeted to the Open one.
 * - A reopen only ever copies a Done card. If none matches the name, the user
 *   is asked whether they meant a brand-new card (and the saved draft is that
 *   create, so "yes" completes it). If the matching card is still Open there
 *   is nothing to reopen -- say so.
 * - If an Open card with that name already exists alongside the Done one,
 *   ask once before making another copy.
 * - The copy never inherits the original's due date, so ask for one once.
 *
 * Questions are generated deterministically and double as the loop guard:
 * the open draft's saved `question` for the same card says it was already
 * put to the user (the idiom deadline-recurrence-gate.ts uses), after which
 * the gate proceeds with whatever the user answered -- no due date included.
 */
export type TaskDuplicateGateResult =
  | { kind: "ask"; question: string; mutation: RawMutation }
  | { kind: "proceed"; mutation: RawMutation };

type TaskRow = EntityContext["tasks"][number];
type RawTaskMutation = Extract<RawMutation, { target_type: "task" }>;

const normalizeTitle = (title: string | null | undefined) => (title ?? "").trim().toLowerCase();

function sameTitle(a: TaskRow, name: string): boolean {
  return normalizeTitle(a.title) === normalizeTitle(name);
}

/** "a, b, or c" -- spoken aloud, so no Oxford-free tricks. */
function speakList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;
}

function listLabel(task: TaskRow, context: Pick<EntityContext, "todoLists">): string {
  const list = task.list_id ? context.todoLists.find((row) => row.id === task.list_id) : undefined;
  return list ? list.name : "Miscellaneous";
}

/** Most recently finished first; a Done row with no completed_at (pre-0036 backfill gap) sorts last. */
function byMostRecentlyCompleted(a: TaskRow, b: TaskRow): number {
  return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
}

/** Same card as the one a previous turn already asked about -- by title, so an unrelated follow-up isn't silently defaulted but an equally-named older copy doesn't re-trigger the question. */
function alreadyAsked(draft: DraftMutationRecord | null, question: string, target: TaskRow): boolean {
  const asked = draft?.mutation;
  return (
    draft?.question === question &&
    asked?.target_type === "task" &&
    asked.operation === "duplicate" &&
    normalizeTitle(asked.title) === normalizeTitle(target.title)
  );
}

/** The draft saved when nothing matched: a plain task create, so the user's "yes" lets the model propose it. */
function createInstead(raw: RawTaskMutation, name: string): RawTaskMutation {
  return { ...raw, operation: "create", target_id: null, title: name, event: null };
}

function gateDuplicate(
  raw: RawTaskMutation,
  openDraft: DraftMutationRecord | null,
  context: EntityContext,
): TaskDuplicateGateResult {
  const picked = raw.target_id ? context.tasks.find((task) => task.id === raw.target_id) : undefined;
  const name = (picked?.title ?? raw.title ?? "").trim();
  if (!name) return { kind: "proceed", mutation: raw };

  const sameName = context.tasks.filter((task) => sameTitle(task, name));
  const openMatches = sameName.filter((task) => task.status === "Open");
  const doneMatches = sameName.filter((task) => task.status === "Done");

  let source: TaskRow | undefined = picked?.status === "Done" ? picked : undefined;
  if (!source) {
    if (doneMatches.length === 0) {
      if (openMatches.length > 0) {
        return {
          kind: "ask",
          question: `"${name}" is already open, so there's nothing to reopen. Anything else?`,
          mutation: raw,
        };
      }
      return {
        kind: "ask",
        question: `I don't see a completed card called "${name}". Did you mean to create a brand-new card with that name?`,
        mutation: createInstead(raw, name),
      };
    }
    const lists = [...new Set(doneMatches.map((task) => task.list_id))];
    if (lists.length > 1) {
      const labels = lists.map((listId) => listLabel(doneMatches.find((task) => task.list_id === listId)!, context));
      return {
        kind: "ask",
        question: `You have completed cards called "${name}" in ${speakList(labels)}. Which one should I reopen?`,
        mutation: { ...raw, target_id: null, title: name },
      };
    }
    source = [...doneMatches].sort(byMostRecentlyCompleted)[0];
  }

  const resolved: RawTaskMutation = { ...raw, target_id: source.id, title: source.title };
  const hasOpenTwin = openMatches.length > 0;
  const needsDueDate = raw.due_at === null;
  if (!hasOpenTwin && !needsDueDate) return { kind: "proceed", mutation: resolved };

  const dueQuestion = 'what due date should the new card have? You can say "no due date" too.';
  const question = hasOpenTwin
    ? `You already have an open card called "${source.title}". Do you still want another copy? If so, ${dueQuestion}`
    : `Reopening "${source.title}" as a new card — ${dueQuestion}`;
  if (alreadyAsked(openDraft, question, source)) return { kind: "proceed", mutation: resolved };
  return { kind: "ask", question, mutation: resolved };
}

/** "Mark X done" / "cancel X" on a non-Open row while an Open card of that name exists: the Open one is meant. */
function preferOpenTransitionTarget(raw: RawTaskMutation, context: EntityContext): RawTaskMutation {
  const target = context.tasks.find((task) => task.id === raw.target_id);
  if (!target || target.status === "Open") return raw;

  const openTwins = context.tasks.filter((task) => task.status === "Open" && sameTitle(task, target.title));
  const sameList = openTwins.filter((task) => task.list_id === target.list_id);
  const open = sameList.length === 1 ? sameList[0] : openTwins.length === 1 ? openTwins[0] : undefined;
  return open ? { ...raw, target_id: open.id } : raw;
}

export function gateTaskDuplicate(
  raw: RawMutation,
  openDraft: DraftMutationRecord | null,
  context: EntityContext,
): TaskDuplicateGateResult {
  if (raw.target_type !== "task") return { kind: "proceed", mutation: raw };
  if (raw.operation === "duplicate") return gateDuplicate(raw, openDraft, context);
  if (raw.operation === "transition") return { kind: "proceed", mutation: preferOpenTransitionTarget(raw, context) };
  return { kind: "proceed", mutation: raw };
}
