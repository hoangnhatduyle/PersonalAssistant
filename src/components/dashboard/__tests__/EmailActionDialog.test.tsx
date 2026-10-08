import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { SuggestedAction, TriageItem } from "@/lib/email-triage/types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));

import { EmailActionDialog, actionLabel } from "@/components/dashboard/EmailActionDialog";

const COURSE_ID = "7d0c9d3e-4f5a-4b7c-8a1e-2b3c4d5e6f70";

function item(action: SuggestedAction): TriageItem {
  return {
    id: "triage-1",
    provider: "google",
    messageId: "msg-1",
    subject: "Lease renewal",
    sender: "Ada Lovelace <ada@example.com>",
    receivedAt: "2026-10-10T12:00:00.000Z",
    webLink: null,
    bucket: "needs_action",
    reason: "Asks you to sign",
    suggestedAction: action,
    status: "open",
    triagedAt: "2026-10-11T12:00:00.000Z",
    expiresAt: "2026-10-25T12:00:00.000Z",
  };
}

function route(extra: Record<string, unknown> = {}) {
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === "POST" && path in extra) return { data: extra[path] };
    if (init?.method === "PATCH" && path === "/api/mail/triage/triage-1") return { data: { id: "triage-1", status: "acted" } };
    // Paged list endpoints: the envelope's data is the row array, with meta alongside.
    if (path.startsWith("/api/courses")) {
      return {
        data: [{ id: COURSE_ID, name: "Intro to CS", code: "CS 101", person_id: null, deleted_at: null }],
        meta: { total: 1, page: 1, limit: 100 },
      };
    }
    return { data: [], meta: { total: 0, page: 1, limit: 100 } };
  });
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("actionLabel", () => {
  it("names each kind of suggested action", () => {
    expect(actionLabel({ kind: "task", title: "x" })).toBe("Add task");
    expect(actionLabel({ kind: "task", title: "x", reminders_enabled: true })).toBe("Add task + reminder");
    expect(actionLabel({ kind: "deadline", title: "x" })).toBe("Add deadline");
    expect(actionLabel({ kind: "event", title: "x" })).toBe("Add event");
  });
});

describe("EmailActionDialog", () => {
  it("renders nothing when closed or when the item has no suggested action", () => {
    route();
    const { container, rerender } = renderWithProviders(<EmailActionDialog item={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const noAction = { ...item({ kind: "task", title: "x" }), suggestedAction: null };
    rerender(<EmailActionDialog item={noAction} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the task form prefilled with the suggested title and names the source email; nothing is created until submit", async () => {
    route();
    renderWithProviders(
      <EmailActionDialog item={item({ kind: "task", title: "Sign the lease", due_at: "2026-10-16T21:00:00.000Z" })} onClose={() => {}} />,
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/From email: Lease renewal · Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sign the lease")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "PATCH")).toBe(false);
  });

  it("creates the task on submit, then marks the triage item acted and closes", async () => {
    route({ "/api/tasks": { id: "task-1", title: "Sign the lease" } });
    const onClose = vi.fn();
    renderWithProviders(<EmailActionDialog item={item({ kind: "task", title: "Sign the lease" })} onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST", body: expect.objectContaining({ title: "Sign the lease" }) })),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/mail/triage/triage-1", { method: "PATCH", body: { status: "acted" } }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not mark the item acted when creating the entity fails", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "POST" && path === "/api/tasks") throw new Error("boom");
      return { data: [], meta: { total: 0, page: 1, limit: 100 } };
    });
    const onClose = vi.fn();
    renderWithProviders(<EmailActionDialog item={item({ kind: "task", title: "Sign the lease" })} onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "Create task" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/tasks", expect.anything()));
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the deadline form with title and course prefilled", async () => {
    route();
    renderWithProviders(
      <EmailActionDialog
        item={item({ kind: "deadline", title: "Essay 2", due_at: "2026-10-16T21:00:00.000Z", course_id: COURSE_ID })}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByDisplayValue("Essay 2")).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById("course_id")).toHaveValue(COURSE_ID));
    expect(screen.getByRole("button", { name: "Create deadline" })).toBeInTheDocument();
  });

  it("opens the event form with title, date, time and duration prefilled", async () => {
    route();
    renderWithProviders(
      <EmailActionDialog
        item={item({ kind: "event", title: "Interview with Acme", date: "2026-10-20", time: "14:30", duration_minutes: 45 })}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByDisplayValue("Interview with Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("14:30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
  });
});
