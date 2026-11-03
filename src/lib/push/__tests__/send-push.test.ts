import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotificationMock = vi.fn();

vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
}));

vi.mock("@/lib/env", () => ({
  requireEnv: (name: string) => `fake-${name}`,
}));

// Imported after the mocks above so send-push.ts resolves the mocked
// web-push / requireEnv rather than the real implementations.
const { sendPush } = await import("../send-push");

const subscription = { endpoint: "https://push.example.com/abc", p256dh: "p256dh-key", auth: "auth-secret" };
const payload = { title: "Submit assignment", body: "Task · due in 1h", url: "/board/t-1", tag: "reminder-r-1" };

class FakeWebPushError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

describe("sendPush", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
  });

  it("encrypts to the subscription's keys and signs with the configured VAPID details", async () => {
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    await expect(sendPush(subscription, payload)).resolves.toEqual({ status: "sent" });

    const [sub, body, options] = sendNotificationMock.mock.calls[0];
    expect(sub).toEqual({ endpoint: subscription.endpoint, keys: { p256dh: "p256dh-key", auth: "auth-secret" } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options.vapidDetails).toEqual({
      subject: "fake-VAPID_SUBJECT",
      publicKey: "fake-NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      privateKey: "fake-VAPID_PRIVATE_KEY",
    });
    expect(options.TTL).toBe(3600);
    expect(options.urgency).toBe("high");
  });

  it.each([404, 410])("reports a %i from the push service as a gone subscription", async (statusCode) => {
    sendNotificationMock.mockRejectedValue(new FakeWebPushError("Received unexpected response code", statusCode));
    await expect(sendPush(subscription, payload)).resolves.toEqual({ status: "gone" });
  });

  it("reports other HTTP failures as retryable, naming only the status", async () => {
    sendNotificationMock.mockRejectedValue(new FakeWebPushError(`failed for ${subscription.endpoint}`, 503));
    const result = await sendPush(subscription, payload);
    expect(result).toEqual({ status: "failed", reason: "push service responded 503" });
    // The endpoint (a per-device capability URL) must not leak into logs via the reason.
    expect(JSON.stringify(result)).not.toContain(subscription.endpoint);
  });

  it("reports a network error as retryable", async () => {
    sendNotificationMock.mockRejectedValue(new Error("socket hang up"));
    await expect(sendPush(subscription, payload)).resolves.toEqual({ status: "failed", reason: "socket hang up" });
  });
});
