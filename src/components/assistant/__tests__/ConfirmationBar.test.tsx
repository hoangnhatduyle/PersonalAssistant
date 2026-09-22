import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ConfirmationBar } from "@/components/assistant/ConfirmationBar";
import { CONFIRMATION_WINDOW_SECONDS } from "@/lib/voice/transitions";

const WINDOW_MS = CONFIRMATION_WINDOW_SECONDS * 1_000;
const countdownLabel = (secondsLeft: number) => `Expires in 0:${String(secondsLeft).padStart(2, "0")}`;

const applyTurnResult = vi.fn();
const reset = vi.fn();
vi.mock("@/components/assistant/VoiceCaptureProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/assistant/VoiceCaptureProvider")>();
  return { ...actual, useVoiceCapture: () => ({ state: { status: "idle" }, applyTurnResult, reset }) };
});

const confirmMutateAsync = vi.fn();
const declineMutateAsync = vi.fn();
const expireMutateAsync = vi.fn();
const armMutateAsync = vi.fn();
vi.mock("@/hooks/useVoiceTurn", () => ({
  useArmVoiceTurn: () => ({ mutateAsync: armMutateAsync, isPending: false }),
  useConfirmVoiceTurn: () => ({ mutateAsync: confirmMutateAsync, isPending: false }),
  useDeclineVoiceTurn: () => ({ mutateAsync: declineMutateAsync, isPending: false }),
  useExpireVoiceTurn: () => ({ mutateAsync: expireMutateAsync, isPending: false }),
}));

const { playStaticAudio } = vi.hoisted(() => ({ playStaticAudio: vi.fn().mockResolvedValue({ played: true }) }));
vi.mock("@/lib/voice/play-audio", () => ({ playStaticAudio }));

const onSpoken = vi.fn().mockResolvedValue(undefined);

function renderBar(origin: "voice" | "text" = "text", readyToListen = origin === "voice") {
  return renderWithProviders(
    <ConfirmationBar sessionId="session-1" message="Delete Calc 101?" origin={origin} onSpoken={onSpoken} readyToListen={readyToListen} />,
  );
}

describe("ConfirmationBar", () => {
  beforeEach(() => {
    applyTurnResult.mockClear();
    reset.mockClear();
    confirmMutateAsync.mockReset();
    declineMutateAsync.mockReset();
    expireMutateAsync.mockReset().mockResolvedValue({ session_id: "session-1", expired: true });
    armMutateAsync.mockReset().mockResolvedValue({ session_id: "session-1", armed: true });
    playStaticAudio.mockClear();
    onSpoken.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from the full confirmation window", () => {
    vi.useFakeTimers();
    renderBar();
    expect(screen.getByText(countdownLabel(CONFIRMATION_WINDOW_SECONDS))).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByText(countdownLabel(CONFIRMATION_WINDOW_SECONDS - 4))).toBeInTheDocument();
  });

  it("applies the confirm result, appending cascade counts the same way the REST delete flow does, and invites a next command", async () => {
    confirmMutateAsync.mockResolvedValue({
      session_id: "session-1",
      executed: true,
      result: {
        summary: "Deleted the course and 2 deadline(s).",
        data: null,
        cascade: { deadlinesDeleted: 2, remindersDismissed: 1, notesUnlinked: 3 },
      },
      next: null,
    });
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(confirmMutateAsync).toHaveBeenCalledWith("session-1"));
    expect(applyTurnResult).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        state: "Responding",
        message: "Deleted the course and 2 deadline(s). 2 deadline(s) deleted, 1 reminder(s) dismissed, 3 note(s) unlinked. Anything else?",
      },
      "text",
    );
  });

  it("applies the decline result, inviting a next command", async () => {
    declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(declineMutateAsync).toHaveBeenCalledWith("session-1"));
    expect(applyTurnResult).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        state: "Responding",
        message: "Okay, I won't do that. Anything else?",
      },
      "text",
    );
  });

  // General multi-step command queue (Workstream C): confirming a step that
  // has more queued must chain straight into the next AwaitingConfirmation
  // prompt instead of the "Anything else?" close-out -- the queue isn't
  // actually empty yet.
  it("applies the server's queued next step as a fresh AwaitingConfirmation turn instead of closing out", async () => {
    confirmMutateAsync.mockResolvedValue({
      session_id: "session-1",
      executed: true,
      result: { summary: "Added blink Cincinnati for Thursday.", data: null, cascade: null },
      next: { session_id: "session-2", message: "Also add blink Cincinnati for Friday, October 9th, 7 to 11 PM?" },
    });
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(confirmMutateAsync).toHaveBeenCalledWith("session-1"));
    expect(applyTurnResult).toHaveBeenCalledWith(
      {
        sessionId: "session-2",
        state: "AwaitingConfirmation",
        message: "Also add blink Cincinnati for Friday, October 9th, 7 to 11 PM?",
      },
      "text",
    );
    expect(applyTurnResult).toHaveBeenCalledTimes(1);
    expect(onSpoken).not.toHaveBeenCalled();
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

  describe("confirmation window start", () => {
    it("arms the window immediately for a text-origin session", () => {
      renderBar("text");
      expect(armMutateAsync).toHaveBeenCalledWith("session-1");
    });

    it("does not arm, count down, or expire a voice-origin session while its prompt is still being spoken", async () => {
      vi.useFakeTimers();
      renderBar("voice", false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(armMutateAsync).not.toHaveBeenCalled();
      expect(expireMutateAsync).not.toHaveBeenCalled();
      expect(playStaticAudio).not.toHaveBeenCalled();
      expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
      expect(screen.getByText("Reading that back…")).toBeInTheDocument();
    });

    it("arms and starts the full countdown only once the prompt has finished being spoken", async () => {
      vi.useFakeTimers();
      const { rerender } = renderBar("voice", false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000);
      });
      expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();

      rerender(<ConfirmationBar sessionId="session-1" message="Delete Calc 101?" origin="voice" onSpoken={onSpoken} readyToListen />);
      expect(armMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.getByText(countdownLabel(CONFIRMATION_WINDOW_SECONDS))).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      expect(screen.getByText(countdownLabel(CONFIRMATION_WINDOW_SECONDS - 4))).toBeInTheDocument();
      expect(expireMutateAsync).not.toHaveBeenCalled();
    });

    it("still starts the countdown when the arm call fails (the longer pre-arm expiry still bounds it server-side)", async () => {
      armMutateAsync.mockRejectedValue(new Error("network"));
      renderBar("text");
      expect(await screen.findByText(countdownLabel(CONFIRMATION_WINDOW_SECONDS))).toBeInTheDocument();
    });
  });

  describe("expiry with no reply", () => {
    it("plays the expiry audio and speaks a message for a voice-origin session that lapses unanswered", async () => {
      vi.useFakeTimers();
      renderBar("voice");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WINDOW_MS + 50);
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
        await vi.advanceTimersByTimeAsync(WINDOW_MS + 50);
      });
      expect(expireMutateAsync).not.toHaveBeenCalled();
      expect(playStaticAudio).not.toHaveBeenCalled();
    });

    it("does not speak or transition when the server reports the session was already resolved by something else", async () => {
      expireMutateAsync.mockResolvedValue({ session_id: "session-1", expired: false });
      vi.useFakeTimers();
      renderBar("voice");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WINDOW_MS + 50);
      });
      expect(expireMutateAsync).toHaveBeenCalledWith("session-1");
      expect(playStaticAudio).not.toHaveBeenCalled();
      expect(applyTurnResult).not.toHaveBeenCalled();
    });
  });

  // Traces: SPEC-API-010 AC-6, AC-7, NC-API-SPEAK-007.
  describe("voice-originated origin propagation", () => {
    it("propagates origin \"voice\" to applyTurnResult and calls onSpoken with the confirm result, resuming hands-free listening", async () => {
      confirmMutateAsync.mockResolvedValue({
        session_id: "session-1",
        executed: true,
        result: { summary: "Deleted the course.", data: null, cascade: null },
        next: null,
      });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-1", state: "Responding", message: "Deleted the course. Anything else?" },
        "voice",
      );
      // shouldResume: true -- fixes the "mic never re-arms after a
      // confirm/decline" bug (onSpoken previously always defaulted it to false).
      expect(onSpoken).toHaveBeenCalledWith("Deleted the course. Anything else?", true);
    });

    it("propagates origin \"voice\" to applyTurnResult and calls onSpoken with the decline result, resuming hands-free listening", async () => {
      declineMutateAsync.mockResolvedValue({ session_id: "session-1", executed: false, message: "Okay, I won't do that." });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Decline" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-1", state: "Responding", message: "Okay, I won't do that. Anything else?" },
        "voice",
      );
      expect(onSpoken).toHaveBeenCalledWith("Okay, I won't do that. Anything else?", true);
    });

    it("does not call onSpoken for a voice-origin confirm that chains into a next queued step", async () => {
      confirmMutateAsync.mockResolvedValue({
        session_id: "session-1",
        executed: true,
        result: { summary: "Added blink Cincinnati for Thursday.", data: null, cascade: null },
        next: { session_id: "session-2", message: "Also add blink Cincinnati for Friday?" },
      });
      renderBar("voice");

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(applyTurnResult).toHaveBeenCalled());
      expect(applyTurnResult).toHaveBeenCalledWith(
        { sessionId: "session-2", state: "AwaitingConfirmation", message: "Also add blink Cincinnati for Friday?" },
        "voice",
      );
      expect(onSpoken).not.toHaveBeenCalled();
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
