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
const expireMutateAsync = vi.fn();
vi.mock("@/hooks/useVoiceTurn", () => ({
  useConfirmVoiceTurn: () => ({ mutateAsync: confirmMutateAsync, isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: declineMutateAsync, isPending: false }),
  useExpireVoiceTurn: () => ({ mutateAsync: expireMutateAsync, isPending: false }),
}));

const { playStaticAudio } = vi.hoisted(() => ({ playStaticAudio: vi.fn().mockResolvedValue({ played: true }) }));
vi.mock("@/lib/voice/play-audio", () => ({ playStaticAudio }));

const onSpoken = vi.fn().mockResolvedValue(undefined);

function renderBar(origin: "voice" | "text" = "text") {
  return renderWithProviders(
    <ConfirmationBar
      sessionId="session-1"
      message="Delete Calc 101?"
      receivedAt={Date.now()}
      origin={origin}
      onSpoken={onSpoken}
      readyToListen={false}
    />,
  );
}

describe("ConfirmationBar", () => {
  beforeEach(() => {
    applyTurnResult.mockClear();
    reset.mockClear();
    confirmMutateAsync.mockReset();
    declineMutateAsync.mockReset();
    expireMutateAsync.mockReset().mockResolvedValue({ session_id: "session-1", expired: true });
    playStaticAudio.mockClear();
    onSpoken.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from the full confirmation window", () => {
    vi.useFakeTimers();
    renderBar();
    expect(screen.getByText("Expires in 0:10")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByText("Expires in 0:06")).toBeInTheDocument();
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

  describe("expiry with no reply", () => {
    it("plays the expiry audio and speaks a message for a voice-origin session that lapses unanswered", async () => {
      vi.useFakeTimers();
      renderBar("voice");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_050);
      });
      expect(expireMutateAsync).toHaveBeenCalledWith("session-1");
      expect(playStaticAudio).toHaveBeenCalledWith("/sounds/confirmation-expired.mp3");
      expect(applyTurnResult).toHaveBeenCalledWith(
        {
          sessionId: "session-1",
          state: "Responding",
          message: "I didn't hear back, so I didn't make that change. Let me know if you'd like anything else.",
        },
        "voice",
      );
    });

    it("never contacts the server or plays anything for a text-origin session that lapses unanswered", async () => {
      vi.useFakeTimers();
      renderBar("text");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_050);
      });
      expect(expireMutateAsync).not.toHaveBeenCalled();
      expect(playStaticAudio).not.toHaveBeenCalled();
    });

    it("does not speak or transition when the server reports the session was already resolved by something else", async () => {
      expireMutateAsync.mockResolvedValue({ session_id: "session-1", expired: false });
      vi.useFakeTimers();
      renderBar("voice");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_050);
      });
      expect(expireMutateAsync).toHaveBeenCalledWith("session-1");
      expect(playStaticAudio).not.toHaveBeenCalled();
      expect(applyTurnResult).not.toHaveBeenCalled();
    });
  });

  // Traces: SPEC-API-010 AC-6, AC-7, NC-API-SPEAK-007.
  describe("voice-originated origin propagation", () => {
    it("propagates origin \"voice\" to applyTurnResult and calls onSpoken with the confirm result", async () => {
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
      expect(onSpoken).toHaveBeenCalledWith("Deleted the course.");
    });

    it("propagates origin \"voice\" to applyTurnResult and calls onSpoken with the decline result", async () => {
      declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Decline" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-1", state: "Responding", message: "Okay, I won't do that." },
        "voice",
      );
      expect(onSpoken).toHaveBeenCalledWith("Okay, I won't do that.");
    });
  });

  it("does not call onSpoken when origin is \"text\"", async () => {
    declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
    renderBar("text");

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
    expect(onSpoken).not.toHaveBeenCalled();
  });
});
