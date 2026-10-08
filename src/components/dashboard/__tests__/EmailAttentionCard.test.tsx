import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { TriageItem, TriageRunResponse } from "@/lib/email-triage/types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));

// The dialog hosts the real create forms (covered in EmailActionDialog.test.tsx); here it is a marker.
vi.mock("@/components/dashboard/EmailActionDialog", () => ({
  actionLabel: (action: { kind: string }) => `Add ${action.kind}`,
  EmailActionDialog: ({ item }: { item: TriageItem | null }) =>
    item ? <div data-testid="action-dialog">{item.suggestedAction?.title}</div> : null,
}));

import { ApiError } from "@/lib/http/client";
import { EmailAttentionCard } from "@/components/dashboard/EmailAttentionCard";

function item(id: string, overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id,
    provider: "google",
    messageId: `msg-${id}`,
    subject: `Subject ${id}`,
    sender: "Ada Lovelace <ada@example.com>",
    receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    webLink: `https://mail.google.com/mail/u/0/#inbox/msg-${id}`,
    bucket: "needs_action",
    reason: `Reason ${id}`,
    suggestedAction: null,
    status: "open",
    triagedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

interface Setup {
  items?: TriageItem[];
  accounts?: Array<{ provider: string; provider_email: string }>;
  run?: () => Promise<{ data: TriageRunResponse }>;
}

function setup({ items = [], accounts = [{ provider: "google", provider_email: "me@gmail.com" }], run }: Setup = {}) {
  apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/api/mail/triage") && init?.method === "POST") {
      return run ? run() : { data: { connected: true, needsReauth: false, items: [], stats: null } };
    }
    if (path.startsWith("/api/mail/triage/") && init?.method === "PATCH") return { data: { id: "x", status: "dismissed" } };
    if (path.startsWith("/api/mail/triage")) return { data: { items } };
    if (path === "/api/mail/accounts") return { data: accounts };
    throw new Error(`unexpected request ${path}`);
  });
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("EmailAttentionCard", () => {
  it("starts as a title and a small Check email button, with no mailbox request and no run", async () => {
    setup();
    renderWithProviders(<EmailAttentionCard />);

    expect(await screen.findByText(/no flagged emails/i)).toBeInTheDocument();
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check email" })).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("lists only open important / needs-action items, needs-action first, with reason and bucket badge", async () => {
    setup({
      items: [
        item("imp", { bucket: "important", receivedAt: "2026-10-11T10:00:00Z" }),
        item("fyi", { bucket: "fyi" }),
        item("act", { bucket: "needs_action", receivedAt: "2026-10-09T10:00:00Z" }),
        item("done", { status: "acted" }),
      ],
    });
    renderWithProviders(<EmailAttentionCard />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Subject act")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Needs action")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Reason act")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Important")).toBeInTheDocument();
    expect(screen.queryByText("Subject fyi")).not.toBeInTheDocument();
    expect(screen.queryByText("Subject done")).not.toBeInTheDocument();
  });

  it("offers each item's suggested action, an Open link, and dismisses an item", async () => {
    setup({ items: [item("a", { suggestedAction: { kind: "task", title: "Sign the lease" } })] });
    renderWithProviders(<EmailAttentionCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
    expect(screen.getByTestId("action-dialog")).toHaveTextContent("Sign the lease");
    expect(screen.getByText("Suggested: Sign the lease")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Gmail" })).toHaveAttribute("href", "https://mail.google.com/mail/u/0/#inbox/msg-a");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Subject a" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/mail/triage/a", { method: "PATCH", body: { status: "dismissed" } }),
    );
  });

  it("runs a manual check for the chosen account and range (default 7 days) and reports the result", async () => {
    setup({
      accounts: [
        { provider: "google", provider_email: "me@gmail.com" },
        { provider: "microsoft", provider_email: "me@outlook.com" },
      ],
      run: async () => ({
        data: {
          connected: true,
          needsReauth: false,
          items: [],
          stats: { considered: 4, classified: 4, stage2: 1, skippedAlreadyTriaged: 0, truncated: false },
        },
      }),
    });
    renderWithProviders(<EmailAttentionCard />);

    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    fireEvent.click(await screen.findByRole("button", { name: /Outlook/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/mail/triage", { method: "POST", body: { provider: "microsoft", days: 7 } }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Checked 4 new emails in Outlook.");
    expect(screen.queryByTestId("email-triage-panel")).not.toBeInTheDocument();
  });

  it("accepts a preset range and a custom number of days, and blocks an out-of-range custom value", async () => {
    setup();
    renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));

    fireEvent.click(await screen.findByRole("button", { name: "3d" }));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/mail/triage", { method: "POST", body: { provider: "google", days: 3 } }));

    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    const custom = await screen.findByLabelText("Custom number of days");
    fireEvent.change(custom, { target: { value: "45" } });
    expect(screen.getByText(/whole number of days from 1 to 30/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();

    fireEvent.change(custom, { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/mail/triage", { method: "POST", body: { provider: "google", days: 10 } }));
  });

  it("offers only connected accounts, and says to connect one when there are none", async () => {
    setup({ accounts: [{ provider: "microsoft", provider_email: "me@outlook.com" }] });
    const { unmount } = renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    expect(await screen.findByRole("button", { name: /Outlook/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gmail/ })).not.toBeInTheDocument();
    unmount();

    setup({ accounts: [] });
    renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    expect(await screen.findByText(/connect gmail or outlook in the mail card first/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });

  it("shows a Reconnect link when the token expired", async () => {
    setup({ run: async () => ({ data: { connected: true, needsReauth: true, items: [], stats: null } }) });
    renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));

    expect(await screen.findByText(/Gmail connection expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect" })).toHaveAttribute("href", "/api/mail/oauth/google/start");
  });

  it("explains a rate-limited run and a generic failure", async () => {
    setup({
      run: async () => {
        throw new ApiError("Too many email checks. Try again later.", 429);
      },
    });
    const { unmount } = renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/checked email a lot recently/i);
    unmount();

    setup({
      run: async () => {
        throw new ApiError("Internal server error", 500);
      },
    });
    renderWithProviders(<EmailAttentionCard />);
    fireEvent.click(screen.getByRole("button", { name: "Check email" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/could not check your email/i);
  });
});
