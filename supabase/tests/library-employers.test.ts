// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createApplication, getApplication, listApplications, softDeleteApplication, transitionApplication, updateApplication } from "@/lib/library/server/applications";
import { addContact, removeContact, updateContact } from "@/lib/library/server/employer-contacts";
import { createEmployer, getEmployer, listEmployers, softDeleteEmployer, updateEmployer } from "@/lib/library/server/employers";
import { createInterview, getApplicationTimeline, listInterviews, softDeleteInterview, updateInterview } from "@/lib/library/server/interviews";
import {
  adminClient,
  createAuthenticatedUser,
  createLibraryApplication,
  createLibraryEmployer,
  createLibraryPost,
  createPerson,
  type TestUser,
} from "./helpers";

type Client = SupabaseClient<Database>;
const typed = (user: TestUser) => user.client as unknown as Client;
const now = () => new Date().toISOString();

// Traces: supabase/migrations/0040_library_employers.sql.
describe("library employers — schema, RLS and guards", () => {
  const admin = adminClient();
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createAuthenticatedUser();
    bob = await createAuthenticatedUser();
  });

  describe("library_employers", () => {
    it("isolates employers between users (RLS select)", async () => {
      const id = await createLibraryEmployer(admin, alice.userId);
      const { data: own } = await alice.client.from("library_employers").select("id").eq("id", id);
      expect(own).toHaveLength(1);
      const { data: other } = await bob.client.from("library_employers").select("id").eq("id", id);
      expect(other ?? []).toHaveLength(0);
    });

    it("rejects inserting an employer for another user", async () => {
      const { error } = await bob.client.from("library_employers").insert({ user_id: alice.userId, name: "spoof" });
      expect(error).not.toBeNull();
    });

    it("has no client hard delete (no DELETE policy)", async () => {
      const id = await createLibraryEmployer(admin, alice.userId);
      await alice.client.from("library_employers").delete().eq("id", id);
      const { data } = await admin.from("library_employers").select("id").eq("id", id);
      expect(data ?? []).toHaveLength(1);
    });

    it("active_library_employers excludes soft-deleted rows", async () => {
      const id = await createLibraryEmployer(admin, alice.userId);
      await admin.from("library_employers").update({ deleted_at: now() }).eq("id", id);
      const { data } = await admin.from("active_library_employers").select("id").eq("id", id);
      expect(data ?? []).toHaveLength(0);
    });

    it("enforces name length and http(s) url checks", async () => {
      const bad = async (row: Record<string, unknown>) =>
        (await admin.from("library_employers").insert({ user_id: alice.userId, name: `n-${crypto.randomUUID()}`, ...row })).error;
      expect(await bad({ name: "" })).not.toBeNull();
      expect(await bad({ name: "x".repeat(201) })).not.toBeNull();
      expect(await bad({ website: "javascript:alert(1)" })).not.toBeNull();
      expect(await bad({ careers_url: "ftp://x.com" })).not.toBeNull();
      expect(await bad({ website: "https://acme.com", careers_url: "http://acme.com/jobs" })).toBeNull();
    });

    it("enforces a unique live name per user, case-insensitively, freed by soft-delete", async () => {
      const name = `Acme ${crypto.randomUUID()}`;
      const first = await createLibraryEmployer(admin, alice.userId, { name });
      const dup = await admin.from("library_employers").insert({ user_id: alice.userId, name: name.toUpperCase() });
      expect(dup.error?.code).toBe("23505");

      expect((await admin.from("library_employers").insert({ user_id: bob.userId, name })).error).toBeNull();

      await admin.from("library_employers").update({ deleted_at: now() }).eq("id", first);
      expect((await admin.from("library_employers").insert({ user_id: alice.userId, name })).error).toBeNull();
    });
  });

  describe("library_applications", () => {
    it("guard rejects an application on another user's employer", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const { error } = await admin.from("library_applications").insert({ user_id: bob.userId, employer_id: employerId, title: "x" });
      expect(error?.message).toMatch(/library_employers row owned/);
    });

    it("guard rejects an application on a soft-deleted employer", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      await admin.from("library_employers").update({ deleted_at: now() }).eq("id", employerId);
      const { error } = await admin.from("library_applications").insert({ user_id: alice.userId, employer_id: employerId, title: "x" });
      expect(error?.message).toMatch(/library_employers row owned/);
    });

    it("isolates applications between users and has no client hard delete", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId);
      expect((await bob.client.from("library_applications").select("id").eq("id", id)).data ?? []).toHaveLength(0);
      await alice.client.from("library_applications").delete().eq("id", id);
      expect((await admin.from("library_applications").select("id").eq("id", id)).data).toHaveLength(1);
    });

    it("defaults to interested with a status_changed_at and date_found", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId);
      const { data } = await admin.from("library_applications").select("status, status_changed_at, date_found, tech_stack").eq("id", id).single();
      expect(data?.status).toBe("interested");
      expect(data?.status_changed_at).toBeTruthy();
      expect(data?.date_found).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data?.tech_stack).toEqual([]);
    });

    it("enforces status, work_mode, salary_period and currency checks", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const bad = async (row: Record<string, unknown>) =>
        (await admin.from("library_applications").insert({ user_id: alice.userId, employer_id: employerId, title: "t", ...row })).error;
      expect(await bad({ status: "hired" })).not.toBeNull();
      expect(await bad({ work_mode: "moon" })).not.toBeNull();
      expect(await bad({ salary_period: "week" })).not.toBeNull();
      expect(await bad({ salary_currency: "usd" })).not.toBeNull();
      expect(await bad({ title: "" })).not.toBeNull();
      expect(await bad({ work_mode: "hybrid", salary_period: "year", salary_currency: "USD" })).toBeNull();
    });

    it("enforces salary_max >= salary_min only when both are set", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const insert = async (row: Record<string, unknown>) =>
        (await admin.from("library_applications").insert({ user_id: alice.userId, employer_id: employerId, title: "t", ...row })).error;
      expect(await insert({ salary_min: 100, salary_max: 50 })).not.toBeNull();
      expect(await insert({ salary_min: -1 })).not.toBeNull();
      expect(await insert({ salary_min: 100 })).toBeNull();
      expect(await insert({ salary_max: 50 })).toBeNull();
      expect(await insert({ salary_min: 50, salary_max: 50 })).toBeNull();
    });

    it("pairs job_url with normalized_job_url and dedupes live ones per user", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const normalized = `https://acme.com/jobs/${crypto.randomUUID()}`;
      const insert = async (userId: string, empId: string, row: Record<string, unknown>) =>
        (await admin.from("library_applications").insert({ user_id: userId, employer_id: empId, title: "t", ...row })).error;

      expect(await insert(alice.userId, employerId, { job_url: normalized })).not.toBeNull(); // url without normalized
      expect(await insert(alice.userId, employerId, { normalized_job_url: normalized })).not.toBeNull();
      expect(await insert(alice.userId, employerId, { job_url: "javascript:1", normalized_job_url: "x" })).not.toBeNull();

      const firstId = await createLibraryApplication(admin, alice.userId, employerId, { job_url: normalized, normalized_job_url: normalized });
      expect((await insert(alice.userId, employerId, { job_url: normalized, normalized_job_url: normalized }))?.code).toBe("23505");

      const bobEmployer = await createLibraryEmployer(admin, bob.userId);
      expect(await insert(bob.userId, bobEmployer, { job_url: normalized, normalized_job_url: normalized })).toBeNull();

      await admin.from("library_applications").update({ deleted_at: now() }).eq("id", firstId);
      expect(await insert(alice.userId, employerId, { job_url: normalized, normalized_job_url: normalized })).toBeNull();
    });

    it("moves status_changed_at only when status changes", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId, { status_changed_at: "2020-06-15T12:00:00Z" });

      await admin.from("library_applications").update({ notes: "just a note" }).eq("id", id);
      let { data } = await admin.from("library_applications").select("status_changed_at").eq("id", id).single();
      expect(new Date(data!.status_changed_at).getUTCFullYear()).toBe(2020);

      // a client-supplied status_changed_at is ignored when the status is unchanged
      await admin.from("library_applications").update({ notes: "again", status_changed_at: "2019-06-15T12:00:00Z" }).eq("id", id);
      ({ data } = await admin.from("library_applications").select("status_changed_at").eq("id", id).single());
      expect(new Date(data!.status_changed_at).getUTCFullYear()).toBe(2020);

      await admin.from("library_applications").update({ status: "applied" }).eq("id", id);
      ({ data } = await admin.from("library_applications").select("status_changed_at").eq("id", id).single());
      expect(new Date(data!.status_changed_at).getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    });
  });

  describe("library_application_events", () => {
    it("records an insert event with a null from_status", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId, { status: "applied" });
      const { data } = await admin.from("library_application_events").select("from_status, to_status").eq("application_id", id);
      expect(data).toEqual([{ from_status: null, to_status: "applied" }]);
    });

    it("records every transition (any-to-any), and nothing for non-status updates", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId);
      for (const status of ["applied", "interviewing", "rejected", "interested"]) {
        await admin.from("library_applications").update({ status }).eq("id", id);
      }
      await admin.from("library_applications").update({ notes: "no event for this" }).eq("id", id);
      await admin.from("library_applications").update({ status: "interested" }).eq("id", id); // same status: no event

      const { data } = await admin
        .from("library_application_events")
        .select("from_status, to_status")
        .eq("application_id", id)
        .order("created_at", { ascending: true });
      expect(data).toEqual([
        { from_status: null, to_status: "interested" },
        { from_status: "interested", to_status: "applied" },
        { from_status: "applied", to_status: "interviewing" },
        { from_status: "interviewing", to_status: "rejected" },
        { from_status: "rejected", to_status: "interested" },
      ]);
    });

    it("is readable by the owner only and cannot be written or altered by clients", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const id = await createLibraryApplication(admin, alice.userId, employerId);

      expect((await alice.client.from("library_application_events").select("id").eq("application_id", id)).data).toHaveLength(1);
      expect((await bob.client.from("library_application_events").select("id").eq("application_id", id)).data ?? []).toHaveLength(0);

      const forged = await alice.client
        .from("library_application_events")
        .insert({ user_id: alice.userId, application_id: id, from_status: null, to_status: "offer" });
      expect(forged.error).not.toBeNull();

      await alice.client.from("library_application_events").update({ to_status: "offer" }).eq("application_id", id);
      await alice.client.from("library_application_events").delete().eq("application_id", id);
      const { data } = await admin.from("library_application_events").select("to_status").eq("application_id", id);
      expect(data).toEqual([{ to_status: "interested" }]);
    });
  });

  describe("library_interviews", () => {
    it("guard rejects an interview on another user's application and a foreign interviewer", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const applicationId = await createLibraryApplication(admin, alice.userId, employerId);
      const bobPerson = await createPerson(admin, bob.userId);

      const wrongOwner = await admin.from("library_interviews").insert({ user_id: bob.userId, application_id: applicationId, round_label: "x" });
      expect(wrongOwner.error?.message).toMatch(/library_applications row owned/);

      const foreignInterviewer = await admin
        .from("library_interviews")
        .insert({ user_id: alice.userId, application_id: applicationId, round_label: "x", interviewer_person_id: bobPerson });
      expect(foreignInterviewer.error?.message).toMatch(/people row owned/);
    });

    it("stores defaults, enforces kind/outcome, isolates by user, and has no client hard delete", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const applicationId = await createLibraryApplication(admin, alice.userId, employerId);
      const { data, error } = await admin
        .from("library_interviews")
        .insert({ user_id: alice.userId, application_id: applicationId, round_label: "Phone screen" })
        .select("id, kind, outcome")
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind: "other", outcome: "pending" });

      const bad = async (row: Record<string, unknown>) =>
        (await admin.from("library_interviews").insert({ user_id: alice.userId, application_id: applicationId, round_label: "r", ...row })).error;
      expect(await bad({ kind: "coffee" })).not.toBeNull();
      expect(await bad({ outcome: "maybe" })).not.toBeNull();
      expect(await bad({ round_label: "" })).not.toBeNull();

      expect((await bob.client.from("library_interviews").select("id").eq("id", data!.id)).data ?? []).toHaveLength(0);
      await alice.client.from("library_interviews").delete().eq("id", data!.id);
      expect((await admin.from("library_interviews").select("id").eq("id", data!.id)).data).toHaveLength(1);
    });

    it("nulls interviewer_person_id when the person row is hard-deleted", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const applicationId = await createLibraryApplication(admin, alice.userId, employerId);
      const personId = await createPerson(admin, alice.userId);
      const { data } = await admin
        .from("library_interviews")
        .insert({ user_id: alice.userId, application_id: applicationId, round_label: "r", interviewer_person_id: personId })
        .select("id")
        .single();
      await admin.from("people").delete().eq("id", personId);
      const { data: after } = await admin.from("library_interviews").select("interviewer_person_id").eq("id", data!.id).single();
      expect(after?.interviewer_person_id).toBeNull();
    });
  });

  describe("library_employer_contacts", () => {
    it("guard rejects another user's person or employer", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const bobPerson = await createPerson(admin, bob.userId);
      const bobEmployer = await createLibraryEmployer(admin, bob.userId);
      const alicePerson = await createPerson(admin, alice.userId);

      const foreignPerson = await admin.from("library_employer_contacts").insert({ employer_id: employerId, person_id: bobPerson, user_id: alice.userId });
      expect(foreignPerson.error?.message).toMatch(/people row owned/);
      const foreignEmployer = await admin.from("library_employer_contacts").insert({ employer_id: bobEmployer, person_id: alicePerson, user_id: alice.userId });
      expect(foreignEmployer.error?.message).toMatch(/library_employers row owned/);
    });

    it("supports insert / update / real delete for the owner, with kind checks and a composite key", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const personId = await createPerson(admin, alice.userId);

      const insert = await alice.client.from("library_employer_contacts").insert({ employer_id: employerId, person_id: personId, user_id: alice.userId, kind: "recruiter" });
      expect(insert.error).toBeNull();
      const dup = await alice.client.from("library_employer_contacts").insert({ employer_id: employerId, person_id: personId, user_id: alice.userId });
      expect(dup.error?.code).toBe("23505");
      expect((await alice.client.from("library_employer_contacts").insert({ employer_id: employerId, person_id: await createPerson(admin, alice.userId), user_id: alice.userId, kind: "boss" })).error).not.toBeNull();

      expect((await bob.client.from("library_employer_contacts").select("person_id").eq("employer_id", employerId)).data ?? []).toHaveLength(0);

      await alice.client.from("library_employer_contacts").update({ kind: "referral", note: "met at a meetup" }).eq("employer_id", employerId).eq("person_id", personId);
      const { data } = await alice.client.from("library_employer_contacts").select("kind, note").eq("employer_id", employerId).eq("person_id", personId).single();
      expect(data).toEqual({ kind: "referral", note: "met at a meetup" });

      await alice.client.from("library_employer_contacts").delete().eq("employer_id", employerId).eq("person_id", personId);
      expect((await admin.from("library_employer_contacts").select("person_id").eq("employer_id", employerId)).data ?? []).toHaveLength(0);
    });
  });

  describe("library_post_employers + sync_library_post_employers", () => {
    it("guard rejects linking another user's employer or post", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const bobEmployer = await createLibraryEmployer(admin, bob.userId);
      const foreignEmployer = await admin.from("library_post_employers").insert({ post_id: postId, employer_id: bobEmployer, user_id: alice.userId });
      expect(foreignEmployer.error?.message).toMatch(/library_employers row owned/);

      const bobPost = await createLibraryPost(admin, bob.userId);
      const aliceEmployer = await createLibraryEmployer(admin, alice.userId);
      const foreignPost = await admin.from("library_post_employers").insert({ post_id: bobPost, employer_id: aliceEmployer, user_id: alice.userId });
      expect(foreignPost.error?.message).toMatch(/library_posts row owned/);
    });

    it("sync replaces the set atomically and refuses another user's post", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const e1 = await createLibraryEmployer(admin, alice.userId);
      const e2 = await createLibraryEmployer(admin, alice.userId);

      expect((await alice.client.rpc("sync_library_post_employers", { p_post_id: postId, p_employer_ids: [e1, e2, e1] })).error).toBeNull();
      let { data } = await alice.client.from("library_post_employers").select("employer_id").eq("post_id", postId);
      expect(data?.map((r) => r.employer_id).sort()).toEqual([e1, e2].sort());

      await alice.client.rpc("sync_library_post_employers", { p_post_id: postId, p_employer_ids: [e2] });
      ({ data } = await alice.client.from("library_post_employers").select("employer_id").eq("post_id", postId));
      expect(data?.map((r) => r.employer_id)).toEqual([e2]);

      await alice.client.rpc("sync_library_post_employers", { p_post_id: postId, p_employer_ids: [] });
      ({ data } = await alice.client.from("library_post_employers").select("employer_id").eq("post_id", postId));
      expect(data ?? []).toHaveLength(0);

      const { error } = await bob.client.rpc("sync_library_post_employers", { p_post_id: postId, p_employer_ids: [] });
      expect(error?.message).toMatch(/not found/);
    });
  });

  describe("soft_delete_library_employer_cascade", () => {
    it("soft-deletes the employer, its applications and interviews; removes contacts and post links; keeps history", async () => {
      const employerId = await createLibraryEmployer(admin, alice.userId);
      const app1 = await createLibraryApplication(admin, alice.userId, employerId);
      const app2 = await createLibraryApplication(admin, alice.userId, employerId);
      const alreadyGone = await createLibraryApplication(admin, alice.userId, employerId);
      await admin.from("library_applications").update({ deleted_at: now() }).eq("id", alreadyGone);

      await admin.from("library_interviews").insert([
        { user_id: alice.userId, application_id: app1, round_label: "r1" },
        { user_id: alice.userId, application_id: app1, round_label: "r2" },
        { user_id: alice.userId, application_id: app2, round_label: "r3" },
      ]);
      const personId = await createPerson(admin, alice.userId);
      await admin.from("library_employer_contacts").insert({ employer_id: employerId, person_id: personId, user_id: alice.userId });
      const postId = await createLibraryPost(admin, alice.userId);
      await admin.from("library_post_employers").insert({ post_id: postId, employer_id: employerId, user_id: alice.userId });

      const { data, error } = await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: employerId });
      expect(error).toBeNull();
      expect(data).toEqual([{ applications_affected: 2, interviews_affected: 3, contacts_removed: 1, post_links_removed: 1 }]);

      const { data: employer } = await admin.from("library_employers").select("deleted_at").eq("id", employerId).single();
      expect(employer?.deleted_at).not.toBeNull();
      const { data: apps } = await admin.from("library_applications").select("deleted_at").eq("employer_id", employerId);
      expect(apps?.every((a) => a.deleted_at !== null)).toBe(true);
      const { data: interviews } = await admin.from("library_interviews").select("deleted_at").in("application_id", [app1, app2]);
      expect(interviews).toHaveLength(3);
      expect(interviews?.every((i) => i.deleted_at !== null)).toBe(true);
      expect((await admin.from("library_employer_contacts").select("person_id").eq("employer_id", employerId)).data ?? []).toHaveLength(0);
      expect((await admin.from("library_post_employers").select("post_id").eq("employer_id", employerId)).data ?? []).toHaveLength(0);
      // The post and the person themselves are untouched, and the status history survives.
      expect((await admin.from("library_posts").select("deleted_at").eq("id", postId).single()).data?.deleted_at).toBeNull();
      expect((await admin.from("people").select("deleted_at").eq("id", personId).single()).data?.deleted_at).toBeNull();
      expect((await admin.from("library_application_events").select("id").eq("application_id", app1)).data).toHaveLength(1);
    });

    it("returns zeros for a missing, already-deleted or foreign employer and leaves the foreign one alone", async () => {
      const bobEmployer = await createLibraryEmployer(admin, bob.userId);
      const bobApp = await createLibraryApplication(admin, bob.userId, bobEmployer);

      const foreign = await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: bobEmployer });
      expect(foreign.data).toEqual([{ applications_affected: 0, interviews_affected: 0, contacts_removed: 0, post_links_removed: 0 }]);
      expect((await admin.from("library_employers").select("deleted_at").eq("id", bobEmployer).single()).data?.deleted_at).toBeNull();
      expect((await admin.from("library_applications").select("deleted_at").eq("id", bobApp).single()).data?.deleted_at).toBeNull();

      const missing = await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: crypto.randomUUID() });
      expect(missing.data).toEqual([{ applications_affected: 0, interviews_affected: 0, contacts_removed: 0, post_links_removed: 0 }]);

      const employerId = await createLibraryEmployer(admin, alice.userId);
      await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: employerId });
      const again = await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: employerId });
      expect(again.data).toEqual([{ applications_affected: 0, interviews_affected: 0, contacts_removed: 0, post_links_removed: 0 }]);
    });

    it("frees the employer name after the cascade", async () => {
      const name = `Cascade ${crypto.randomUUID()}`;
      const employerId = await createLibraryEmployer(admin, alice.userId, { name });
      await alice.client.rpc("soft_delete_library_employer_cascade", { p_employer_id: employerId });
      expect((await admin.from("library_employers").insert({ user_id: alice.userId, name })).error).toBeNull();
    });
  });
});

describe("library employers — server services", () => {
  const admin = adminClient();
  let user: TestUser;
  let other: TestUser;
  let client: Client;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    other = await createAuthenticatedUser();
    client = typed(user);
  });

  const mustEmployer = async (name: string, extra: Record<string, unknown> = {}) => {
    const result = await createEmployer(client, user.userId, { name, ...extra });
    if (!result.ok) throw new Error(`setup: ${result.reason}`);
    return result.employer;
  };

  describe("employers", () => {
    it("createEmployer returns the detail shape; a duplicate name (any case) conflicts with the existing id", async () => {
      const name = `Initech ${crypto.randomUUID()}`;
      const created = await createEmployer(client, user.userId, { name, website: "https://initech.com", notes: "n" });
      expect(created.ok && created.employer).toMatchObject({ name, website: "https://initech.com", applications: [], contacts: [], posts: [] });

      const dup = await createEmployer(client, user.userId, { name: name.toUpperCase() });
      expect(dup).toEqual({ ok: false, reason: "conflict", existingId: created.ok ? created.employer.id : null });
    });

    it("updateEmployer edits fields, toggles archive, conflicts on a taken name, and is not_found for another user's employer", async () => {
      const a = await mustEmployer(`A ${crypto.randomUUID()}`);
      const b = await mustEmployer(`B ${crypto.randomUUID()}`);

      const renamed = await updateEmployer(client, user.userId, a.id, { notes: "hello", website: null });
      expect(renamed.ok && renamed.employer.notes).toBe("hello");

      const archived = await updateEmployer(client, user.userId, a.id, { archived: true });
      expect(archived.ok && archived.employer.archived_at).not.toBeNull();
      const restored = await updateEmployer(client, user.userId, a.id, { archived: false });
      expect(restored.ok && restored.employer.archived_at).toBeNull();

      const clash = await updateEmployer(client, user.userId, a.id, { name: b.name });
      expect(clash).toEqual({ ok: false, reason: "conflict", existingId: b.id });

      expect(await updateEmployer(typed(other), other.userId, a.id, { notes: "hijack" })).toEqual({ ok: false, reason: "not_found" });
    });

    it("softDeleteEmployer runs the cascade, reports counts, and is null for foreign / missing / already-deleted employers", async () => {
      const employer = await mustEmployer(`Doomed ${crypto.randomUUID()}`);
      const app = await createApplication(client, user.userId, { employer_id: employer.id, title: "r" });
      if (!app.ok) throw new Error("setup");
      await createInterview(client, user.userId, app.application.id, { round_label: "r1" });
      const person = await createPerson(admin, user.userId);
      await addContact(client, user.userId, employer.id, { person_id: person });

      expect(await softDeleteEmployer(typed(other), other.userId, employer.id)).toBeNull();
      expect(await softDeleteEmployer(client, user.userId, employer.id)).toEqual({ applications: 1, interviews: 1, contacts: 1, postLinks: 0 });
      expect(await softDeleteEmployer(client, user.userId, employer.id)).toBeNull();
      expect(await getEmployer(client, user.userId, employer.id)).toBeNull();
      expect((await getEmployer(client, user.userId, employer.id, { includeDeleted: true }))?.deleted_at).not.toBeNull();
    });

    it("getEmployer is scoped to the owner and embeds live applications, contacts (live people only) and linked posts", async () => {
      const employer = await mustEmployer(`Detail ${crypto.randomUUID()}`);
      const live = await createApplication(client, user.userId, { employer_id: employer.id, title: "Live role", status: "applied" });
      const gone = await createApplication(client, user.userId, { employer_id: employer.id, title: "Gone role" });
      if (!live.ok || !gone.ok) throw new Error("setup");
      await softDeleteApplication(client, user.userId, gone.application.id);

      const keep = await createPerson(admin, user.userId, { name: "Keeper" });
      const drop = await createPerson(admin, user.userId, { name: "Dropped" });
      await addContact(client, user.userId, employer.id, { person_id: keep, kind: "recruiter" });
      await addContact(client, user.userId, employer.id, { person_id: drop });
      await admin.from("people").update({ deleted_at: now() }).eq("id", drop);

      const postId = await createLibraryPost(admin, user.userId, { title: "About them" });
      await admin.from("library_post_employers").insert({ post_id: postId, employer_id: employer.id, user_id: user.userId });

      const detail = await getEmployer(client, user.userId, employer.id);
      expect(detail?.applications.map((a) => a.title)).toEqual(["Live role"]);
      expect(detail?.contacts).toEqual([{ person: { id: keep, name: "Keeper" }, kind: "recruiter", note: "" }]);
      expect(detail?.posts).toEqual([{ id: postId, title: "About them", platform: "other" }]);

      expect(await getEmployer(typed(other), other.userId, employer.id)).toBeNull();
    });
  });

  describe("listEmployers", () => {
    let u: TestUser;
    let c: Client;
    let acme: string;
    let globex: string;

    beforeAll(async () => {
      u = await createAuthenticatedUser();
      c = typed(u);
      const make = async (name: string, extra: Record<string, unknown> = {}) => {
        const r = await createEmployer(c, u.userId, { name, ...extra });
        if (!r.ok) throw new Error("setup");
        return r.employer.id;
      };
      acme = await make("Acme Corp", { notes: "100% remote, (great)" });
      globex = await make("Globex", { website: "https://globex.io" });
      const archived = await make("Old Co");
      await updateEmployer(c, u.userId, archived, { archived: true });

      const apply = async (employerId: string, title: string, status: "interested" | "applied" | "interviewing" | "rejected") => {
        const r = await createApplication(c, u.userId, { employer_id: employerId, title, status });
        if (!r.ok) throw new Error("setup");
      };
      await apply(acme, "Frontend", "applied");
      await apply(acme, "Backend", "interviewing");
      await apply(globex, "SRE", "rejected");

      const person = await createPerson(admin, u.userId, { name: "Recruiter Rae" });
      await addContact(c, u.userId, acme, { person_id: person, kind: "recruiter" });
    });

    it("excludes archived by default; archived=only / all switch it", async () => {
      const names = async (archived?: "only" | "all") => (await listEmployers(c, u.userId, { archived })).rows.map((r) => r.name).sort();
      expect(await names()).toEqual(["Acme Corp", "Globex"]);
      expect(await names("only")).toEqual(["Old Co"]);
      expect(await names("all")).toEqual(["Acme Corp", "Globex", "Old Co"]);
    });

    it("embeds live applications (newest stage first) and live contacts, without leaking embed keys", async () => {
      const { rows } = await listEmployers(c, u.userId, {});
      const row = rows.find((r) => r.id === acme)!;
      expect(row.applications.map((a) => a.title).sort()).toEqual(["Backend", "Frontend"]);
      expect(row.contacts).toEqual([{ person: expect.objectContaining({ name: "Recruiter Rae" }), kind: "recruiter", note: "" }]);
      expect(row).not.toHaveProperty("library_applications");
      expect(row).not.toHaveProperty("match");
    });

    it("status filter keeps only employers with a live application in that status, yet still embeds ALL their applications", async () => {
      const applied = await listEmployers(c, u.userId, { status: "applied" });
      expect(applied.rows.map((r) => r.id)).toEqual([acme]);
      expect(applied.total).toBe(1);
      expect(applied.rows[0].applications).toHaveLength(2); // not narrowed to the matching one
      expect((await listEmployers(c, u.userId, { status: "rejected" })).rows.map((r) => r.id)).toEqual([globex]);
      expect((await listEmployers(c, u.userId, { status: "offer" })).rows).toEqual([]);
    });

    it("search: every token must match across name/notes/website; wildcards, commas and parentheses are literal", async () => {
      const names = async (q: string) => (await listEmployers(c, u.userId, { q })).rows.map((r) => r.name);
      expect(await names("acme")).toEqual(["Acme Corp"]);
      expect(await names("globex.io")).toEqual(["Globex"]);
      expect(await names("acme globex")).toEqual([]);
      expect(await names("100%")).toEqual(["Acme Corp"]);
      expect(await names("(great)")).toEqual(["Acme Corp"]);
      expect(await names("remote,")).toEqual(["Acme Corp"]);
      expect(await names("%")).toEqual(["Acme Corp"]); // literal percent sign, not a wildcard
      expect(await names("_")).toEqual([]);
    });

    it("paginates with an exact total", async () => {
      const page1 = await listEmployers(c, u.userId, { limit: 1 });
      const page2 = await listEmployers(c, u.userId, { limit: 1, page: 2 });
      expect(page1).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(page1.rows).toHaveLength(1);
      expect(page2.rows).toHaveLength(1);
      expect(page1.rows[0].id).not.toBe(page2.rows[0].id);
    });

    it("never returns another user's employers", async () => {
      expect((await listEmployers(typed(other), other.userId, {})).rows.map((r) => r.id)).not.toContain(acme);
    });
  });

  describe("contacts", () => {
    it("adds, updates and removes a contact; duplicates conflict; foreign people/employers are refused", async () => {
      const employer = await mustEmployer(`Contacts ${crypto.randomUUID()}`);
      const person = await createPerson(admin, user.userId, { name: "Pat" });

      const added = await addContact(client, user.userId, employer.id, { person_id: person, kind: "referral", note: "friend of a friend" });
      expect(added).toEqual({ ok: true, contact: { person: { id: person, name: "Pat" }, kind: "referral", note: "friend of a friend" } });
      expect(await addContact(client, user.userId, employer.id, { person_id: person })).toEqual({ ok: false, reason: "conflict" });

      const foreignPerson = await createPerson(admin, other.userId);
      expect(await addContact(client, user.userId, employer.id, { person_id: foreignPerson })).toEqual({ ok: false, reason: "person_not_found" });
      const foreignEmployer = await createLibraryEmployer(admin, other.userId);
      expect(await addContact(client, user.userId, foreignEmployer, { person_id: person })).toEqual({ ok: false, reason: "employer_not_found" });

      const updated = await updateContact(client, user.userId, employer.id, person, { kind: "hiring_manager", note: "" });
      expect(updated.ok && updated.contact).toMatchObject({ kind: "hiring_manager", note: "" });
      expect(await updateContact(client, user.userId, employer.id, crypto.randomUUID(), { kind: "other" })).toEqual({ ok: false, reason: "not_found" });

      expect(await removeContact(typed(other), other.userId, employer.id, person)).toBe(false);
      expect(await removeContact(client, user.userId, employer.id, person)).toBe(true);
      expect(await removeContact(client, user.userId, employer.id, person)).toBe(false);
    });
  });

  describe("applications", () => {
    it("createApplication normalizes the job url, defaults status, refuses a foreign/deleted employer, and conflicts on a duplicate url", async () => {
      const employer = await mustEmployer(`Jobs ${crypto.randomUUID()}`);
      const slug = crypto.randomUUID();
      const first = await createApplication(client, user.userId, {
        employer_id: employer.id,
        title: "Engineer",
        job_url: `https://www.jobs.example.com/roles/${slug}/?utm_source=x&gh_src=y#apply`,
        tech_stack: ["TypeScript"],
        salary_min: 90000,
        salary_max: 120000,
        salary_currency: "USD",
        salary_period: "year",
      });
      expect(first.ok && first.application).toMatchObject({
        status: "interested",
        normalized_job_url: `https://jobs.example.com/roles/${slug}`,
        tech_stack: ["TypeScript"],
        salary_min: 90000,
        employer: { id: employer.id, name: employer.name },
      });

      const dup = await createApplication(client, user.userId, { employer_id: employer.id, title: "Again", job_url: `https://jobs.example.com/roles/${slug}` });
      expect(dup).toEqual({ ok: false, reason: "conflict", existingId: first.ok ? first.application.id : null });

      const foreign = await createLibraryEmployer(admin, other.userId);
      expect(await createApplication(client, user.userId, { employer_id: foreign, title: "x" })).toEqual({ ok: false, reason: "employer_not_found" });
      const gone = await mustEmployer(`Gone ${crypto.randomUUID()}`);
      await softDeleteEmployer(client, user.userId, gone.id);
      expect(await createApplication(client, user.userId, { employer_id: gone.id, title: "x" })).toEqual({ ok: false, reason: "employer_not_found" });
    });

    it("an initial non-default status is recorded as the first history event", async () => {
      const employer = await mustEmployer(`Initial ${crypto.randomUUID()}`);
      const created = await createApplication(client, user.userId, { employer_id: employer.id, title: "r", status: "applied" });
      if (!created.ok) throw new Error("setup");
      const timeline = await getApplicationTimeline(client, user.userId, created.application.id);
      expect(timeline).toEqual([expect.objectContaining({ type: "status", from_status: null, to_status: "applied" })]);
    });

    it("updateApplication edits fields, recomputes/clears the job url, validates the merged salary range, and cannot change status", async () => {
      const employer = await mustEmployer(`Update ${crypto.randomUUID()}`);
      const created = await createApplication(client, user.userId, { employer_id: employer.id, title: "r", salary_min: 100, salary_max: 200 });
      if (!created.ok) throw new Error("setup");
      const id = created.application.id;

      const edited = await updateApplication(client, user.userId, id, { title: "Senior r", work_mode: "remote", location: "Lisbon", job_url: "https://x.example.com/j/1?utm_campaign=z" });
      expect(edited.ok && edited.application).toMatchObject({ title: "Senior r", work_mode: "remote", location: "Lisbon", normalized_job_url: "https://x.example.com/j/1" });

      const cleared = await updateApplication(client, user.userId, id, { job_url: null });
      expect(cleared.ok && cleared.application).toMatchObject({ job_url: null, normalized_job_url: null });

      // one side only, but the merged range is inverted
      expect(await updateApplication(client, user.userId, id, { salary_min: 500 })).toEqual({ ok: false, reason: "invalid_salary" });
      expect(await updateApplication(client, user.userId, id, { salary_max: 50 })).toEqual({ ok: false, reason: "invalid_salary" });
      const widened = await updateApplication(client, user.userId, id, { salary_max: 900 });
      expect(widened.ok && widened.application.salary_max).toBe(900);

      // status is not part of the patch type; even if smuggled in at runtime it must not apply
      await updateApplication(client, user.userId, id, { notes: "hi", status: "offer" } as never);
      expect((await getApplication(client, user.userId, id))?.status).toBe("interested");

      expect(await updateApplication(typed(other), other.userId, id, { title: "hijack" })).toEqual({ ok: false, reason: "not_found" });
    });

    it("transitionApplication moves any-to-any, stamps status_changed_at, records history, and rejects a no-op / foreign application", async () => {
      const employer = await mustEmployer(`Transition ${crypto.randomUUID()}`);
      const created = await createApplication(client, user.userId, { employer_id: employer.id, title: "r" });
      if (!created.ok) throw new Error("setup");
      const id = created.application.id;
      await admin.from("library_applications").update({ status_changed_at: "2020-06-15T12:00:00Z" }).eq("id", id);

      const offer = await transitionApplication(client, user.userId, id, "offer"); // skipping stages is allowed
      expect(offer.ok && offer.application.status).toBe("offer");
      expect(new Date(offer.ok ? offer.application.status_changed_at : 0).getUTCFullYear()).toBeGreaterThanOrEqual(2026);

      expect(await transitionApplication(client, user.userId, id, "offer")).toEqual({ ok: false, reason: "unchanged" });
      const back = await transitionApplication(client, user.userId, id, "interested"); // and going back
      expect(back.ok && back.application.status).toBe("interested");
      expect(await transitionApplication(typed(other), other.userId, id, "applied")).toEqual({ ok: false, reason: "not_found" });

      const timeline = await getApplicationTimeline(client, user.userId, id);
      expect(timeline?.map((e) => (e.type === "status" ? `${e.from_status}>${e.to_status}` : e.type))).toEqual([
        "null>interested",
        "interested>offer",
        "offer>interested",
      ]);
    });

    it("listApplications filters by status and employer, sorts by stage change, drops rows of a deleted employer, and is per-user", async () => {
      const u = await createAuthenticatedUser();
      const c = typed(u);
      const e1 = await createEmployer(c, u.userId, { name: "One" });
      const e2 = await createEmployer(c, u.userId, { name: "Two" });
      if (!e1.ok || !e2.ok) throw new Error("setup");
      const mk = async (employer_id: string, title: string, status?: "applied" | "offer") => {
        const r = await createApplication(c, u.userId, { employer_id, title, status });
        if (!r.ok) throw new Error("setup");
        return r.application.id;
      };
      const a1 = await mk(e1.employer.id, "A1", "applied");
      await mk(e1.employer.id, "A2");
      await mk(e2.employer.id, "B1", "applied");
      await admin.from("library_applications").update({ status_changed_at: "2020-06-15T12:00:00Z" }).eq("id", a1);

      const all = await listApplications(c, u.userId, { limit: 100 });
      expect(all.total).toBe(3);
      expect(all.rows.at(-1)?.id).toBe(a1); // oldest stage change last
      expect(all.rows.every((r) => r.employer.name)).toBe(true);
      expect((await listApplications(c, u.userId, { status: "applied" })).rows.map((r) => r.title).sort()).toEqual(["A1", "B1"]);
      expect((await listApplications(c, u.userId, { employerId: e2.employer.id })).rows.map((r) => r.title)).toEqual(["B1"]);

      await softDeleteEmployer(c, u.userId, e2.employer.id);
      expect((await listApplications(c, u.userId, {})).rows.map((r) => r.title).sort()).toEqual(["A1", "A2"]);
      expect((await listApplications(typed(other), other.userId, {})).rows.map((r) => r.id)).not.toContain(a1);
    });

    it("softDeleteApplication frees the job url, hides the row, and is false for foreign / already-deleted", async () => {
      const employer = await mustEmployer(`Delete ${crypto.randomUUID()}`);
      const url = `https://x.example.com/d/${crypto.randomUUID()}`;
      const created = await createApplication(client, user.userId, { employer_id: employer.id, title: "r", job_url: url });
      if (!created.ok) throw new Error("setup");
      const id = created.application.id;

      expect(await softDeleteApplication(typed(other), other.userId, id)).toBe(false);
      expect(await softDeleteApplication(client, user.userId, id)).toBe(true);
      expect(await softDeleteApplication(client, user.userId, id)).toBe(false);
      expect(await getApplication(client, user.userId, id)).toBeNull();
      expect((await createApplication(client, user.userId, { employer_id: employer.id, title: "again", job_url: url })).ok).toBe(true);
    });
  });

  describe("interviews + timeline", () => {
    it("creates, lists in schedule order (unscheduled last), updates and soft-deletes; foreign application/interviewer refused", async () => {
      const employer = await mustEmployer(`Interviews ${crypto.randomUUID()}`);
      const app = await createApplication(client, user.userId, { employer_id: employer.id, title: "r" });
      if (!app.ok) throw new Error("setup");
      const applicationId = app.application.id;
      const sam = await createPerson(admin, user.userId, { name: "Sam" });

      const later = await createInterview(client, user.userId, applicationId, { round_label: "Onsite", kind: "onsite", scheduled_at: "2026-10-10T09:00:00.000Z", interviewer_person_id: sam });
      await createInterview(client, user.userId, applicationId, { round_label: "Unscheduled" });
      await createInterview(client, user.userId, applicationId, { round_label: "Screen", kind: "screen", scheduled_at: "2026-10-01T09:00:00.000Z" });
      expect(later.ok && later.interview).toMatchObject({ kind: "onsite", outcome: "pending", interviewer: { id: sam, name: "Sam" } });

      expect((await listInterviews(client, user.userId, applicationId))?.map((i) => i.round_label)).toEqual(["Screen", "Onsite", "Unscheduled"]);

      const id = later.ok ? later.interview.id : "";
      const passed = await updateInterview(client, user.userId, id, { outcome: "passed", notes: "went well", interviewer_person_id: null });
      expect(passed.ok && passed.interview).toMatchObject({ outcome: "passed", notes: "went well", interviewer: null });

      const foreignPerson = await createPerson(admin, other.userId);
      expect(await updateInterview(client, user.userId, id, { interviewer_person_id: foreignPerson })).toEqual({ ok: false, reason: "interviewer_not_found" });
      expect(await createInterview(client, user.userId, applicationId, { round_label: "x", interviewer_person_id: foreignPerson })).toEqual({ ok: false, reason: "interviewer_not_found" });
      expect(await updateInterview(typed(other), other.userId, id, { notes: "hijack" })).toEqual({ ok: false, reason: "not_found" });
      expect(await createInterview(typed(other), other.userId, applicationId, { round_label: "x" })).toEqual({ ok: false, reason: "application_not_found" });
      expect(await listInterviews(typed(other), other.userId, applicationId)).toBeNull();

      expect(await softDeleteInterview(typed(other), other.userId, id)).toBe(false);
      expect(await softDeleteInterview(client, user.userId, id)).toBe(true);
      expect(await softDeleteInterview(client, user.userId, id)).toBe(false);
      expect((await listInterviews(client, user.userId, applicationId))?.map((i) => i.round_label)).toEqual(["Screen", "Unscheduled"]);
    });

    it("hides an interviewer who was soft-deleted", async () => {
      const employer = await mustEmployer(`Ghost ${crypto.randomUUID()}`);
      const app = await createApplication(client, user.userId, { employer_id: employer.id, title: "r" });
      if (!app.ok) throw new Error("setup");
      const person = await createPerson(admin, user.userId, { name: "Vanishing" });
      const created = await createInterview(client, user.userId, app.application.id, { round_label: "r", interviewer_person_id: person });
      expect(created.ok && created.interview.interviewer?.name).toBe("Vanishing");
      await admin.from("people").update({ deleted_at: now() }).eq("id", person);
      expect((await listInterviews(client, user.userId, app.application.id))?.[0].interviewer).toBeNull();
    });

    it("timeline merges status history and interviews chronologically, and is null for a foreign application", async () => {
      const employer = await mustEmployer(`Timeline ${crypto.randomUUID()}`);
      const app = await createApplication(client, user.userId, { employer_id: employer.id, title: "r" });
      if (!app.ok) throw new Error("setup");
      const id = app.application.id;
      await admin.from("library_application_events").update({ created_at: "2026-03-01T09:00:00Z" }).eq("application_id", id);
      await transitionApplication(client, user.userId, id, "applied");
      await admin.from("library_application_events").update({ created_at: "2026-03-05T09:00:00Z" }).eq("application_id", id).eq("to_status", "applied");
      await createInterview(client, user.userId, id, { round_label: "Screen", scheduled_at: "2026-03-03T10:00:00.000Z" });

      const timeline = await getApplicationTimeline(client, user.userId, id);
      expect(timeline?.map((entry) => (entry.type === "status" ? entry.to_status : entry.interview.round_label))).toEqual(["interested", "Screen", "applied"]);
      expect(await getApplicationTimeline(typed(other), other.userId, id)).toBeNull();
    });
  });
});
