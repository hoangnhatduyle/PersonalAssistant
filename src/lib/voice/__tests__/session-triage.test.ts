import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const store = vi.hoisted(() => ({ setTriageItemStatus: vi.fn() }));
vi.mock("@/lib/email-triage/store", () => store);

import { markTriageItemActed } from "@/lib/voice/session";
import type { PendingMutation } from "@/lib/voice/mutations";

const fakeSupabase = {} as SupabaseClient<Database>;
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

describe("markTriageItemActed (confirmVoiceSession's post-create hook)", () => {
  beforeEach(() => {
    store.setTriageItemStatus.mockReset();
    store.setTriageItemStatus.mockResolvedValue(true);
  });

  it("marks the originating triage item acted for the confirming user", async () => {
    const mutation: PendingMutation = {
      targetType: "task",
      operation: "create",
      payload: { title: "Sign the lease", due_at: null },
      triageItemId: ITEM_ID,
    };

    await markTriageItemActed(fakeSupabase, "user-1", mutation);

    expect(store.setTriageItemStatus).toHaveBeenCalledWith(fakeSupabase, "user-1", ITEM_ID, "acted");
  });

  it("does nothing for a mutation that didn't come from a triage item", async () => {
    await markTriageItemActed(fakeSupabase, "user-1", { targetType: "task", operation: "create", payload: { title: "x", due_at: null } });
    await markTriageItemActed(fakeSupabase, "user-1", { targetType: "task", operation: "delete", targetId: ITEM_ID });
    expect(store.setTriageItemStatus).not.toHaveBeenCalled();
  });

  it("swallows a failure so the already-executed create is never reported as failed", async () => {
    store.setTriageItemStatus.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      markTriageItemActed(fakeSupabase, "user-1", {
        targetType: "task",
        operation: "create",
        payload: { title: "x", due_at: null },
        triageItemId: ITEM_ID,
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
