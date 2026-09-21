import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryEmployerContact } from "@/lib/api/entity-types";
import type { LibraryContactPatch, LibraryContactPayload } from "@/lib/api/library-schemas";
import type { ContactKind } from "@/lib/library/constants";
import { findMissingOwnedIds } from "@/lib/library/server/owned-ids";
import { UNIQUE_VIOLATION } from "@/lib/library/server/pg-errors";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type ContactResult =
  | { ok: true; contact: LibraryEmployerContact }
  | { ok: false; reason: "employer_not_found" | "person_not_found" | "not_found" | "conflict" };

const CONTACT_SELECT = "kind,note,person:people(id,name,deleted_at)";

interface ContactRow {
  kind: string;
  note: string;
  person: { id: string; name: string; deleted_at: string | null } | null;
}

function toContact(row: ContactRow): LibraryEmployerContact | null {
  if (!row.person || row.person.deleted_at !== null) return null;
  return { person: { id: row.person.id, name: row.person.name }, kind: row.kind as ContactKind, note: row.note };
}

async function employerIsLive(supabase: Client, userId: string, employerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_employers")
    .select("id")
    .eq("id", employerId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function readContact(supabase: Client, userId: string, employerId: string, personId: string): Promise<LibraryEmployerContact | null> {
  const { data, error } = await supabase
    .from("library_employer_contacts")
    .select(CONTACT_SELECT)
    .eq("user_id", userId)
    .eq("employer_id", employerId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data ? toContact(data as unknown as ContactRow) : null;
}

/** Links a Person to an employer (recruiter, referral, ...). Ownership is checked here; the guard trigger backstops it. */
export async function addContact(supabase: Client, userId: string, employerId: string, input: LibraryContactPayload): Promise<ContactResult> {
  if (!(await employerIsLive(supabase, userId, employerId))) return { ok: false, reason: "employer_not_found" };
  if ((await findMissingOwnedIds(supabase, userId, "people", [input.person_id])).length > 0) return { ok: false, reason: "person_not_found" };

  const { error } = await supabase.from("library_employer_contacts").insert({
    user_id: userId,
    employer_id: employerId,
    person_id: input.person_id,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
    throw error;
  }

  const contact = await readContact(supabase, userId, employerId, input.person_id);
  if (!contact) throw new Error("created employer contact could not be re-read");
  return { ok: true, contact };
}

export async function updateContact(
  supabase: Client,
  userId: string,
  employerId: string,
  personId: string,
  patch: LibraryContactPatch,
): Promise<ContactResult> {
  const existing = await readContact(supabase, userId, employerId, personId);
  if (!existing) return { ok: false, reason: "not_found" };

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("library_employer_contacts")
      .update(patch)
      .eq("user_id", userId)
      .eq("employer_id", employerId)
      .eq("person_id", personId);
    if (error) throw error;
  }

  const contact = await readContact(supabase, userId, employerId, personId);
  return contact ? { ok: true, contact } : { ok: false, reason: "not_found" };
}

/** Real delete (unlinking has no history worth keeping). False when there was no such link. */
export async function removeContact(supabase: Client, userId: string, employerId: string, personId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("library_employer_contacts")
    .delete()
    .eq("user_id", userId)
    .eq("employer_id", employerId)
    .eq("person_id", personId)
    .select("person_id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
