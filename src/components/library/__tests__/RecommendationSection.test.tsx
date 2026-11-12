import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { RecommendationSection, formatLetterDate } from "@/components/library/RecommendationSection";
import type { LibraryRecommender } from "@/lib/api/entity-types";

const { useLibraryRecommenders, mutation } = vi.hoisted(() => ({
  useLibraryRecommenders: vi.fn(),
  mutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useLibraryRecommenders", () => ({
  useLibraryRecommenders: () => useLibraryRecommenders(),
  useCreateRecommender: mutation,
  useUpdateRecommender: mutation,
  useDeleteRecommender: mutation,
  useCreateRecommenderLetter: mutation,
  useUpdateRecommenderLetter: mutation,
  useDeleteRecommenderLetter: mutation,
}));

const recommender: LibraryRecommender = {
  id: "r1",
  user_id: "u1",
  name: "Dr. Mohsen",
  affiliation: "Professor",
  email: "mohsen@example.edu",
  relationship: "Advisor",
  status: "agreed",
  notes: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  letters: [
    {
      id: "l1",
      user_id: "u1",
      recommender_id: "r1",
      purpose: "Siemens",
      status: "received",
      requested_on: "2026-02-01",
      received_on: "2026-03-04",
      notes: "",
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

describe("RecommendationSection", () => {
  beforeEach(() => useLibraryRecommenders.mockReset());

  it("shows the empty state with an add action", () => {
    useLibraryRecommenders.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderWithProviders(<RecommendationSection />);
    expect(screen.getByRole("heading", { name: "Recommendation" })).toBeInTheDocument();
    expect(screen.getByText("No recommenders yet")).toBeInTheDocument();
  });

  it("lists a recommender with an already-received letter and its dates", () => {
    useLibraryRecommenders.mockReturnValue({ data: [recommender], isLoading: false, isError: false });
    renderWithProviders(<RecommendationSection />);
    expect(screen.getByText("Dr. Mohsen")).toBeInTheDocument();
    expect(screen.getByText("Siemens")).toBeInTheDocument();
    expect(screen.getAllByText("Received").length).toBeGreaterThan(0);
    expect(screen.getByText(/received Mar 4, 2026/i)).toBeInTheDocument();
  });

  it("formats plain dates without a timezone shift", () => {
    expect(formatLetterDate("2026-03-01")).toBe("Mar 1, 2026");
  });
});
