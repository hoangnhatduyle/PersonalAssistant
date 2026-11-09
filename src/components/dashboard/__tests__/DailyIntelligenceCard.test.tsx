import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: { hands_free_voice_enabled: false } }) }));
vi.mock("@/hooks/useSpeakVoiceResponse", () => ({ useSpeakVoiceResponse: () => ({ speak: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useCourses", () => ({ useCourses: () => ({ data: { rows: [] } }) }));
vi.mock("@/hooks/useTasks", () => ({ useTasks: () => ({ data: { rows: [] } }) }));
vi.mock("@/hooks/usePersonalizationSuggestions", () => ({
  usePersonalizationSuggestions: () => ({ data: { rows: [] }, refetch: async () => ({ data: { rows: [] } }) }),
}));
vi.mock("@/hooks/useReviewSuggestionsAloud", () => ({ useReviewSuggestionsAloud: () => ({ start: vi.fn(), isActive: false }) }));

import { DailyIntelligenceCard } from "@/components/dashboard/DailyIntelligenceCard";
import { resetPersistedCollapseMemory } from "@/hooks/usePersistedCollapse";
import { localDateKey } from "@/lib/local-date-key";

const CACHE = { narrative: "Cached briefing text.", workload: { tone: "ok", message: "Light day." } };

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
  resetPersistedCollapseMemory();
  vi.useRealTimers();
});

describe("DailyIntelligenceCard cache", () => {
  it("shows a briefing cached earlier on the same local day", () => {
    localStorage.setItem("cadence.intelligence", JSON.stringify({ ...CACHE, cachedOn: localDateKey(new Date()) }));
    renderWithProviders(<DailyIntelligenceCard />);
    expect(screen.getByText("Cached briefing text.")).toBeInTheDocument();
  });

  it("ignores a briefing cached on a previous local day", () => {
    localStorage.setItem("cadence.intelligence", JSON.stringify({ ...CACHE, cachedOn: "2000-01-01" }));
    renderWithProviders(<DailyIntelligenceCard />);
    expect(screen.queryByText("Cached briefing text.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("keeps the cache past UTC midnight while the local date is unchanged", () => {
    // 23:30 local on the 9th is already the 10th in UTC for any zone west of UTC; the cache must follow the local date.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 9, 23, 30));
    localStorage.setItem("cadence.intelligence", JSON.stringify({ ...CACHE, cachedOn: "2026-11-09" }));
    renderWithProviders(<DailyIntelligenceCard />);
    expect(screen.getByText("Cached briefing text.")).toBeInTheDocument();
  });
});

describe("DailyIntelligenceCard collapse", () => {
  it("collapses to a one-line summary and expands back", () => {
    localStorage.setItem("cadence.intelligence", JSON.stringify({ ...CACHE, cachedOn: localDateKey(new Date()) }));
    renderWithProviders(<DailyIntelligenceCard />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse daily intelligence" }));
    expect(screen.queryByText("Cached briefing text.")).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-collapsed-summary")).toHaveTextContent("Generated today");
    expect(localStorage.getItem("cadence.intelligence.collapsed")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Expand daily intelligence" }));
    expect(screen.getByText("Cached briefing text.")).toBeInTheDocument();
  });
});
