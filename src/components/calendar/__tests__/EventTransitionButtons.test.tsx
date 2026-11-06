import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { EventTransitionButtons } from "@/components/calendar/EventTransitionButtons";

const mutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useAppointments", () => ({
  useTransitionAppointment: () => ({ mutateAsync, isPending: false }),
}));

describe("EventTransitionButtons", () => {
  it("planned offers Mark Done and Mark Missed but not Reopen", () => {
    renderWithProviders(<EventTransitionButtons appointmentId="a-1" status="planned" />);
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Missed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
  });

  it.each(["done", "missed"] as const)("%s offers only Reopen", (status) => {
    renderWithProviders(<EventTransitionButtons appointmentId="a-1" status={status} />);
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("sends user_reopens_event with the occurrence date for a recurring occurrence", async () => {
    mutateAsync.mockClear();
    renderWithProviders(
      <EventTransitionButtons appointmentId="a-1" status="done" occurrenceDate="2026-11-05" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ event: "user_reopens_event", occurrenceDate: "2026-11-05" }),
    );
  });
});
