import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * public/sw.js is a plain script, not a module, so it is loaded the way a
 * browser would: evaluated against a stand-in `self` that records the event
 * listeners it registers. That lets these tests drive the push / click
 * handlers directly -- in particular the iOS rule that a push must always
 * produce a visible notification.
 */
type Listener = (event: Record<string, unknown>) => void;

const ORIGIN = "https://cadence.example";
const source = readFileSync(path.join(__dirname, "../../../../public/sw.js"), "utf8");

function loadWorker() {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn<(title: string, options: Record<string, unknown>) => Promise<void>>(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const matchAll = vi.fn(async () => [] as unknown[]);
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll, openWindow },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
  };
  vm.runInNewContext(source, { self, URL, fetch: vi.fn() });
  return { listeners, showNotification, openWindow, matchAll };
}

/** Dispatches an event and resolves whatever was passed to event.waitUntil. */
async function dispatch(worker: ReturnType<typeof loadWorker>, type: string, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  worker.listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

const pushEvent = (data: unknown) => ({ data: data === undefined ? null : { json: () => (typeof data === "function" ? (data as () => never)() : data) } });

describe("service worker push handler", () => {
  let worker: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    worker = loadWorker();
  });

  it("shows the notification described by the payload", async () => {
    await dispatch(worker, "push", pushEvent({ title: "Homework 5", body: "Algorithms · deadline · due in 30m", url: "/courses/deadlines/d-1", tag: "reminder-r-1" }));
    expect(worker.showNotification).toHaveBeenCalledWith("Homework 5", {
      body: "Algorithms · deadline · due in 30m",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/courses/deadlines/d-1" },
      tag: "reminder-r-1",
    });
  });

  it.each([
    ["no data at all", undefined],
    ["unparseable JSON", () => { throw new SyntaxError("bad json"); }],
    ["a JSON null", null],
    ["a JSON string", "just text"],
    ["an empty object", {}],
  ])("still shows a notification for %s (iOS revokes subscriptions that don't)", async (_label, data) => {
    await dispatch(worker, "push", pushEvent(data));
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toBe("Cadence");
    expect(options.body).toBe("You have a reminder.");
    expect(options.data).toEqual({ url: "/" });
  });

  it.each(["https://evil.example/phish", "//evil.example/phish", "javascript:alert(1)", 42, null])("refuses to carry the off-app url %j", async (url) => {
    await dispatch(worker, "push", pushEvent({ title: "T", url }));
    expect(worker.showNotification.mock.calls[0][1].data).toEqual({ url: "/" });
  });

  it("omits the tag when the payload has none, so unrelated notifications do not replace each other", async () => {
    await dispatch(worker, "push", pushEvent({ title: "T" }));
    expect(worker.showNotification.mock.calls[0][1]).not.toHaveProperty("tag");
  });
});

describe("service worker notificationclick handler", () => {
  const click = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

  it("closes the notification and opens a window at the item when the app is not open", async () => {
    const worker = loadWorker();
    const event = click("/board/t-9");
    await dispatch(worker, "notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/board/t-9`);
  });

  it("focuses and navigates an open app window instead of opening a second one", async () => {
    const worker = loadWorker();
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    worker.matchAll.mockResolvedValue([{ url: `${ORIGIN}/dashboard`, focus, navigate }]);
    await dispatch(worker, "notificationclick", click("/courses/deadlines/d-1"));
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/courses/deadlines/d-1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("still focuses the window when navigate() rejects", async () => {
    const worker = loadWorker();
    const focus = vi.fn(async () => undefined);
    worker.matchAll.mockResolvedValue([{ url: `${ORIGIN}/`, focus, navigate: vi.fn(async () => Promise.reject(new Error("not controlled"))) }]);
    await expect(dispatch(worker, "notificationclick", click("/board/t-1"))).resolves.toBeUndefined();
    expect(focus).toHaveBeenCalled();
  });

  it("ignores windows from other origins and falls back to the root for an off-app url", async () => {
    const worker = loadWorker();
    worker.matchAll.mockResolvedValue([{ url: "https://other.example/", focus: vi.fn(), navigate: vi.fn() }]);
    await dispatch(worker, "notificationclick", click("https://evil.example/x"));
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});
