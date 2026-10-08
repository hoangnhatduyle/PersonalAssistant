import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { MailMessage } from "@/lib/mail/types";
import type { TriageItem } from "@/lib/email-triage/types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));

import { MailInboxCard } from "@/components/dashboard/MailInboxCard";

function message(id: string, overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id,
    provider: "google",
    subject: `Subject ${id}`,
    from: "Ada <ada@example.com>",
    snippet: "",
    receivedAt: new Date(Date.now() - 3_600_000).toISOString(),
    isRead: false,
    ...overrides,
  };
}

function triage(messageId: string, bucket: TriageItem["bucket"], overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id: `t-${messageId}`,
    provider: "google",
    messageId,
    subject: "",
    sender: "",
    receivedAt: new Date().toISOString(),
    webLink: null,
    bucket,
    reason: `Why ${messageId}`,
    suggestedAction: null,
    status: "open",
    triagedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

function setup(messages: MailMessage[], triageItems: TriageItem[]) {
  apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/mail/accounts") return { data: [{ provider: "google", provider_email: "me@gmail.com" }] };
    if (path.startsWith("/api/mail/messages")) return { data: { connected: true, needsReauth: false, messages } };
    if (path.startsWith("/api/mail/triage")) return { data: { items: triageItems } };
    throw new Error(`unexpected request ${path}`);
  });
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("MailInboxCard triage badges and filters", () => {
  it("shows no badges or filter chips until a triage run has classified something", async () => {
    setup([message("a"), message("b")], []);
    renderWithProviders(<MailInboxCard />);

    expect(await screen.findByText("Subject a")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by triage bucket" })).not.toBeInTheDocument();
    expect(screen.queryByText("Needs action")).not.toBeInTheDocument();
  });

  it("badges classified rows (including dismissed/acted items) and leaves unclassified rows alone", async () => {
    setup(
      [message("a"), message("b"), message("c")],
      [triage("a", "needs_action"), triage("b", "ignore", { status: "dismissed" })],
    );
    renderWithProviders(<MailInboxCard />);

    const rowA = (await screen.findByText("Subject a")).closest("li") as HTMLElement;
    expect(within(rowA).getByText("Needs action")).toBeInTheDocument();
    expect(within(rowA).getByText("Why a")).toBeInTheDocument();
    const rowB = screen.getByText("Subject b").closest("li") as HTMLElement;
    expect(within(rowB).getByText("Ignore")).toBeInTheDocument();
    const rowC = screen.getByText("Subject c").closest("li") as HTMLElement;
    expect(within(rowC).queryByText(/needs action|important|fyi|ignore/i)).not.toBeInTheDocument();
  });

  it("filters the list by bucket, with counts, and returns to All", async () => {
    setup(
      [message("a"), message("b"), message("c"), message("d")],
      [triage("a", "needs_action"), triage("b", "important"), triage("c", "important")],
    );
    renderWithProviders(<MailInboxCard />);

    const group = await screen.findByRole("group", { name: "Filter by triage bucket" });
    expect(within(group).getByRole("button", { name: /^All 4$/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: /^Needs action 1$/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /^Important 2$/ })).toBeInTheDocument();
    // Buckets with no messages in view get no chip.
    expect(within(group).queryByRole("button", { name: /FYI/ })).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /^Important 2$/ }));
    expect(screen.getByText("Subject b")).toBeInTheDocument();
    expect(screen.getByText("Subject c")).toBeInTheDocument();
    expect(screen.queryByText("Subject a")).not.toBeInTheDocument();
    expect(screen.queryByText("Subject d")).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /^All 4$/ }));
    expect(screen.getByText("Subject d")).toBeInTheDocument();
  });

  it("only joins triage results for the account being viewed", async () => {
    setup([message("a")], [triage("a", "needs_action", { provider: "microsoft" })]);
    renderWithProviders(<MailInboxCard />);

    expect(await screen.findByText("Subject a")).toBeInTheDocument();
    expect(screen.queryByText("Needs action")).not.toBeInTheDocument();
  });
});
