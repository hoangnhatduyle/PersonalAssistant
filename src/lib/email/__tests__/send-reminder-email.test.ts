import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("@/lib/email/resend-client", () => ({
  getResendClient: () => ({ emails: { send: sendMock } }),
}));

vi.mock("@/lib/env", () => ({
  requireEnv: (name: string) => (name === "RESEND_FROM_EMAIL" ? "Personal Assistant <reminders@example.com>" : `fake-${name}`),
}));

// Imported after the mocks above so send-reminder-email.ts resolves the
// mocked getResendClient/requireEnv rather than the real implementations.
const { sendReminderEmail } = await import("../send-reminder-email");

describe("sendReminderEmail", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("calls Resend's emails.send with the right to/from/subject", async () => {
    sendMock.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendReminderEmail("student@example.com", {
      targetType: "task",
      title: "Submit assignment",
      dueAt: "2026-09-01T17:00:00.000Z",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("student@example.com");
    expect(call.from).toBe("Personal Assistant <reminders@example.com>");
    expect(call.subject).toContain("Submit assignment");
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "invalid domain" } });

    await expect(
      sendReminderEmail("student@example.com", { targetType: "task", title: "Submit assignment", dueAt: "2026-09-01T17:00:00.000Z" }),
    ).rejects.toThrow("invalid domain");
  });
});
