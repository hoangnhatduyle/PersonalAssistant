import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();
vi.mock("@/lib/http/client", () => ({ apiFetch: apiFetchMock }));

const { describePushSupport, unsubscribeThisDevice, urlBase64ToUint8Array } = await import("../client");
type PushEnvironment = import("../client").PushEnvironment;

const supported: PushEnvironment = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  isStandalone: false,
  vapidPublicKey: "BAqi",
  permission: "default",
};

describe("describePushSupport", () => {
  it("is ok when every API and the VAPID key are present", () => {
    expect(describePushSupport(supported)).toBe("ok");
    expect(describePushSupport({ ...supported, permission: "granted" })).toBe("ok");
  });

  it("tells an iPhone user in a Safari tab to install the app first", () => {
    expect(describePushSupport({ ...supported, hasPushManager: false, isIOS: true, isStandalone: false })).toBe("not-installed");
  });

  it("reports unsupported for a browser with no push, and for an installed iOS app that still lacks it", () => {
    expect(describePushSupport({ ...supported, hasPushManager: false })).toBe("unsupported");
    expect(describePushSupport({ ...supported, hasNotification: false, isIOS: true, isStandalone: true })).toBe("unsupported");
  });

  it("reports an unset VAPID key before asking for permission", () => {
    expect(describePushSupport({ ...supported, vapidPublicKey: null })).toBe("unconfigured");
  });

  it("reports denied permission", () => {
    expect(describePushSupport({ ...supported, permission: "denied" })).toBe("denied");
  });

  it("prefers the install hint over an unset key when the push APIs are absent", () => {
    expect(describePushSupport({ ...supported, hasPushManager: false, isIOS: true, vapidPublicKey: null })).toBe("not-installed");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes padded and unpadded input", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array("AQI")]).toEqual([1, 2]);
  });

  it("decodes the URL-safe alphabet (- and _ for + and /)", () => {
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([0xfb, 0xff]);
  });

  it("decodes a VAPID public key to a 65-byte uncompressed P-256 point", () => {
    const bytes = urlBase64ToUint8Array("BAqi_AoM7UacU8E5M7v5_JXOaXdH1Msj6foeroWpugHKD1Cqy8cwufWb7jceJVNQe7RLHHFV5rEaKHDgtgumn94");
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});

describe("unsubscribeThisDevice", () => {
  const unsubscribe = vi.fn();
  const getSubscription = vi.fn();
  const getRegistration = vi.fn();

  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ data: {} });
    unsubscribe.mockReset().mockResolvedValue(true);
    getSubscription.mockReset();
    getRegistration.mockReset().mockResolvedValue({ pushManager: { getSubscription } });
    Object.defineProperty(navigator, "serviceWorker", { value: { getRegistration }, configurable: true });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("deletes the server row, then drops the browser subscription", async () => {
    getSubscription.mockResolvedValue({ endpoint: "https://push.example.com/abc", unsubscribe });
    await unsubscribeThisDevice();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/push/subscribe", { method: "DELETE", body: { endpoint: "https://push.example.com/abc" } });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("does nothing when this device has no subscription", async () => {
    getSubscription.mockResolvedValue(null);
    await unsubscribeThisDevice();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("never throws, and still unsubscribes the browser, when the server call fails", async () => {
    getSubscription.mockResolvedValue({ endpoint: "https://push.example.com/abc", unsubscribe });
    apiFetchMock.mockRejectedValue(new Error("network down"));
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("gives up after the timeout instead of blocking sign-out on a hung request", async () => {
    getSubscription.mockResolvedValue({ endpoint: "https://push.example.com/abc", unsubscribe });
    apiFetchMock.mockReturnValue(new Promise(() => undefined));
    const started = Date.now();
    await unsubscribeThisDevice(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("is a no-op where service workers do not exist", async () => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
