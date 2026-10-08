import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { WeeklyReviewResponse } from "@/lib/weekly-review/types";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));

const settings = vi.hoisted(() => ({ value: { timezone: "UTC", voice_capture_enabled: false } as Record<string, unknown> }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: settings.value }) }));
const speak = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSpeakVoiceResponse", () => ({ useSpeakVoiceResponse: () => ({ speak, isPending: false }) }));

import { WeeklyReviewCard } from "@/components/dashboard/WeeklyReviewCard";

function day(weekday: string, total: number, index: number) {
  return { dateKey: `2026-10-${12 + index}`, weekday, deadlineCount: total, taskCount: 0, sessionCount: 0, total, titles: total ? ["Thing"] : [] };
}

function makeReview(overrides: Partial<WeeklyReviewResponse> = {}): WeeklyReviewResponse {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name, index) => day(name, index === 1 ? 3 : 0, index));
  return {
    generatedAt: "2026-10-11T20:00:00.000Z",
    weekKey: "2026-10-11",
    narrative: "You finished 5 items last week.",
    recommendations: ["Clear or reschedule 2 past-due items, starting with \"Homework 3\"."],
    data: {
      timezone: "UTC",
      weekKey: "2026-10-11",
      lastWeek: { completedCount: 5, dueCount: 6, completedOnTime: 4, completedLate: 1, stillOpen: 1, onTimeRate: 80, sessions: { done: 2, skipped: 0, planned: 0 } },
      pending: { pastDueCount: 2, pastDueItems: [], dueTodayCount: 1 },
      nextWeek: { days, total: 3, busiestDay: days[1], collisionDays: [days[1]], items: [], deadlinesWithoutSessions: [] },
    },
    ...overrides,
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  speak.mockReset();
  localStorage.clear();
  settings.value = { timezone: "UTC", voice_capture_enabled: false };
  vi.useRealTimers();
});

describe("WeeklyReviewCard", () => {
  it("starts empty with a Generate button and no request", () => {
    renderWithProviders(<WeeklyReviewCard />);
    expect(screen.getByText(/how last week went/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("generates a review, shows stats, narrative, next-week strip and recommendations, and caches it", async () => {
    apiFetch.mockResolvedValueOnce({ data: makeReview() });
    renderWithProviders(<WeeklyReviewCard />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("You finished 5 items last week.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/weekly-review", { method: "POST" });
    expect(screen.getByText("5/6 due items done")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("4 on time · 1 late")).toBeInTheDocument();
    expect(screen.getByText("1 due today")).toBeInTheDocument();
    expect(screen.getByText(/Clear or reschedule 2 past-due items/)).toBeInTheDocument();
    expect(screen.getByTestId("next-week-strip").children).toHaveLength(7);
    expect(localStorage.getItem("cadence.weeklyReview")).toContain("You finished 5 items last week.");
  });

  it("restores today's cached review without a request, but ignores a cache from another day", () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    localStorage.setItem("cadence.weeklyReview", JSON.stringify({ review: makeReview(), cachedOn: key }));
    const { unmount } = renderWithProviders(<WeeklyReviewCard />);
    expect(screen.getByText("You finished 5 items last week.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    unmount();

    localStorage.setItem("cadence.weeklyReview", JSON.stringify({ review: makeReview(), cachedOn: "2020-01-01" }));
    renderWithProviders(<WeeklyReviewCard />);
    expect(screen.queryByText("You finished 5 items last week.")).not.toBeInTheDocument();
  });

  it("shows an error with Retry, then recovers", async () => {
    apiFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ data: makeReview() });
    renderWithProviders(<WeeklyReviewCard />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Could not generate your weekly review.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("You finished 5 items last week.")).toBeInTheDocument();
  });

  it("offers Read aloud only when voice is enabled and speaks the narrative plus recommendations", async () => {
    settings.value = { timezone: "UTC", voice_capture_enabled: true };
    apiFetch.mockResolvedValueOnce({ data: makeReview() });
    renderWithProviders(<WeeklyReviewCard />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    fireEvent.click(await screen.findByRole("button", { name: "Read aloud" }));
    expect(speak).toHaveBeenCalledWith(expect.stringContaining("You finished 5 items last week. Clear or reschedule"));
  });

  it("highlights itself as ready on Sunday evening", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T20:00:00Z")); // Sunday 8pm UTC
    renderWithProviders(<WeeklyReviewCard />);
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
  });

  it("does not show the ready badge midweek", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T20:00:00Z"));
    renderWithProviders(<WeeklyReviewCard />);
    expect(screen.queryByText("Ready for review")).not.toBeInTheDocument();
  });

  it("dismisses itself and tells the page", () => {
    const onDismiss = vi.fn();
    renderWithProviders(<WeeklyReviewCard onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss weekly review" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Weekly Review")).not.toBeInTheDocument();
  });
});
