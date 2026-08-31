import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ConfirmationBar } from "@/components/assistant/ConfirmationBar";

const applyTurnResult = vi.fn();
const reset = vi.fn();
vi.mock("@/components/assistant/VoiceCaptureProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/assistant/VoiceCaptureProvider")>();
  return { ...actual, useVoiceCapture: () => ({ state: { status: "idle" }, applyTurnResult, reset }) };
});

const confirmMutateAsync = vi.fn();
const declineMutateAsync = vi.fn();
vi.mock("@/hooks/useVoiceTurn", () => ({
  useConfirmVoiceTurn: () => ({ mutateAsync: confirmMutateAsync, isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: declineMutateAsync, isPending: false }),
}));

const onSpeak = vi.fn();

function renderBar(origin: "voice" | "text" = "text") {
  return renderWithProviders(
    <ConfirmationBar sessionId="session-1" message="Delete Calc 101?" receivedAt={Date.now()} origin={origin} onSpeak={onSpeak} />,
  );
}

describe("ConfirmationBar", () => {
  beforeEach(() => {
    applyTurnResult.mockClear();
    reset.mockClear();
    confirmMutateAsync.mockReset();
    declineMutateAsync.mockReset();
    onSpeak.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from the full confirmation window", () => {
    vi.useFakeTimers();
    renderBar();
    expect(screen.getByText("Expires in 5:00")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("Expires in 3:59")).toBeInTheDocument();
  });

  it("applies the confirm result, appending cascade counts the same way the REST delete flow does", async () => {
    confirmMutateAsync.mockResolvedValue({
      session_id: "session-1",
      executed: true,
      result: {
        summary: "Deleted the course and 2 deadline(s).",
        data: null,
        cascade: { deadlinesDeleted: 2, remindersDismissed: 1, notesUnlinked: 3 },
      },
    });
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(confirmMutateAsync).toHaveBeenCalledWith("session-1"));
    expect(applyTurnResult).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        state: "Responding",
        message: "Deleted the course and 2 deadline(s). 2 deadline(s) deleted, 1 reminder(s) dismissed, 3 note(s) unlinked.",
      },
      "text",
    );
  });

  it("applies the decline result", async () => {
    declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(declineMutateAsync).toHaveBeenCalledWith("session-1"));
    expect(applyTurnResult).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        state: "Responding",
        message: "Okay, I won't do that.",
      },
      "text",
    );
  });

  it("toasts and resets to idle when the server reports the window already expired", async () => {
    confirmMutateAsync.mockRejectedValue(new Error("Confirmation window has expired"));
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(reset).toHaveBeenCalled());
    expect(await screen.findByText("Confirmation window has expired")).toBeInTheDocument();
  });

  it("disables Confirm once the countdown reaches zero, without disabling Decline", () => {
    vi.useFakeTimers();
    renderBar();
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(screen.getByText("Confirmation window expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  // Traces: SPEC-API-010 AC-6, AC-7, NC-API-SPEAK-007.
  describe("voice-originated origin propagation", () => {
    it("propagates origin \"voice\" to applyTurnResult and calls onSpeak with the confirm result", async () => {
      confirmMutateAsync.mockResolvedValue({
        session_id: "session-1",
        executed: true,
        result: { summary: "Deleted the course.", data: null, cascade: null },
      });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-1", state: "Responding", message: "Deleted the course." },
        "voice",
      );
      expect(onSpeak).toHaveBeenCalledWith("Deleted the course.");
    });

    it("propagates origin \"voice\" to applyTurnResult and calls onSpeak with the decline result", async () => {
      declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Decline" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-1", state: "Responding", message: "Okay, I won't do that." },
        "voice",
      );
      expect(onSpeak).toHaveBeenCalledWith("Okay, I won't do that.");
    });
  });

  it("does not call onSpeak when origin is \"text\"", async () => {
    declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
    renderBar("text");

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
    expect(onSpeak).not.toHaveBeenCalled();
  });
});
