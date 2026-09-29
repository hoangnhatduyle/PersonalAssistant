import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ViewKnowledgeSourceDialog } from "@/components/knowledge/ViewKnowledgeSourceDialog";
import type { KnowledgeGraph, KnowledgeSource } from "@/lib/api/entity-types";

const source: KnowledgeSource = {
  id: "s1",
  source_type: "pasted_text",
  title: "Alpha",
  origin_url: null,
  status: "Ready",
  error_message: null,
  attempt_count: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const graph: KnowledgeGraph = {
  nodes: [
    { id: "s1", title: "Alpha", source_type: "pasted_text", origin_url: null, status: "Ready", snippet: "alpha text" },
    { id: "s2", title: "Beta", source_type: "pasted_text", origin_url: null, status: "Ready", snippet: null },
    { id: "s3", title: "Gamma", source_type: "url", origin_url: "https://example.com", status: "Ready", snippet: null },
    { id: "s4", title: "Delta", source_type: "pasted_text", origin_url: null, status: "Ready", snippet: null },
  ],
  edges: [
    { source: "s1", target: "s2", kind: "manual", linkId: "l1" },
    { source: "s1", target: "s3", kind: "similar", score: 0.62 },
  ],
};

const createLink = vi.fn();
const deleteLink = vi.fn();
vi.mock("@/hooks/useKnowledge", () => ({
  useKnowledgeSource: () => ({ data: source }),
  useKnowledgeSourceContent: () => ({ data: { id: "s1", raw_content: "Full alpha content" }, isLoading: false, isError: false }),
  useKnowledgeGraph: () => ({ data: graph }),
  useCreateKnowledgeLink: () => ({ mutateAsync: createLink, isPending: false }),
  useDeleteKnowledgeLink: () => ({ mutateAsync: deleteLink, isPending: false }),
  useRetryKnowledgeSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateKnowledgeSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteKnowledgeSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("ViewKnowledgeSourceDialog linked sources", () => {
  beforeEach(() => {
    createLink.mockReset().mockResolvedValue({ id: "new" });
    deleteLink.mockReset().mockResolvedValue({ id: "l1" });
  });

  it("shows full content, manual links, and suggested links with their similarity", () => {
    renderWithProviders(<ViewKnowledgeSourceDialog sourceId="s1" open onClose={() => {}} />);

    expect(screen.getByText("Full alpha content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove link to Beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Gamma" })).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("removes a manual link by its link id", async () => {
    renderWithProviders(<ViewKnowledgeSourceDialog sourceId="s1" open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove link to Beta" }));
    await waitFor(() => expect(deleteLink).toHaveBeenCalledWith("l1"));
  });

  it("promotes a suggested link to a manual one", async () => {
    renderWithProviders(<ViewKnowledgeSourceDialog sourceId="s1" open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Link Gamma" }));
    await waitFor(() => expect(createLink).toHaveBeenCalledWith({ source_id: "s1", target_id: "s3" }));
  });

  it("adds a link from the picker, excluding the source itself and already-linked sources", async () => {
    renderWithProviders(<ViewKnowledgeSourceDialog sourceId="s1" open onClose={() => {}} />);

    const picker = screen.getByLabelText("Link to another source") as HTMLSelectElement;
    const optionLabels = Array.from(picker.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(["Link to another source…", "Gamma", "Delta"]);

    fireEvent.change(picker, { target: { value: "s4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    await waitFor(() => expect(createLink).toHaveBeenCalledWith({ source_id: "s1", target_id: "s4" }));
  });
});
