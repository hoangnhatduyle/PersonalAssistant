import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallController, type CallControllerDeps } from "../call-controller";
import { REALTIME_HIDDEN_GRACE_SECONDS, REALTIME_IDLE_TIMEOUT_SECONDS } from "../constants";

const CALL_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const SESSION_ID = "bbbbbbbb-2222-4222-8222-222222222222";

// ------------------------------------------------------------------ fakes

class FakeDataChannel {
  readyState: "open" | "closed" = "open";
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = (raw: string) => void this.sent.push(JSON.parse(raw));
  close = () => {
    this.readyState = "closed";
  };
  receive(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  sentOfType(type: string) {
    return this.sent.filter((event) => event.type === type);
  }
}

class FakePeerConnection {
  dc = new FakeDataChannel();
  connectionState = "new";
  iceConnectionState = "new";
  closed = false;
  tracks: unknown[] = [];
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  addTrack = (track: unknown) => void this.tracks.push(track);
  createDataChannel = () => this.dc;
  createOffer = async () => ({ type: "offer", sdp: "offer-sdp" });
  setLocalDescription = async () => undefined;
  setRemoteDescription = async () => {
    queueMicrotask(() => this.dc.onopen?.());
  };
  close = () => {
    this.closed = true;
  };
}

function fakeStream() {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; }, getSettings: () => ({ sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }) };
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
}

type ToolHandler = (body: Record<string, unknown>) => { status?: number; data?: unknown };

interface Rig {
  controller: CallController;
  pc: FakePeerConnection;
  dc: FakeDataChannel;
  track: ReturnType<typeof fakeStream>["track"];
  calls: Array<{ url: string; init?: RequestInit; body: unknown }>;
  callsTo: (url: string) => Array<{ url: string; init?: RequestInit; body: unknown }>;
  order: string[];
  deps: CallControllerDeps;
  sendBeacon: ReturnType<typeof vi.fn>;
  setToolHandler: (handler: ToolHandler) => void;
}

function rig(options: { sessionStatus?: number; sessionError?: string; maxSeconds?: number; mic?: () => Promise<MediaStream>; greet?: boolean; endOnHidden?: boolean } = {}): Rig {
  const pc = new FakePeerConnection();
  const { track, stream } = fakeStream();
  const calls: Rig["calls"] = [];
  const order: string[] = [];
  let toolHandler: ToolHandler = () => ({ data: { output: { ok: true } } });
  const sendBeacon = vi.fn(() => true);

  const json = (status: number, payload: unknown) => ({ ok: status < 400, status, json: async () => payload, text: async () => "answer-sdp" }) as unknown as Response;

  const fetchFake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
    calls.push({ url: href, init, body });
    if (href === "/api/voice/realtime/session") {
      order.push("session");
      if (options.sessionStatus && options.sessionStatus >= 400) return json(options.sessionStatus, { success: false, data: null, error: options.sessionError ?? "nope" });
      return json(201, { success: true, data: { clientSecret: "ek_secret", callId: CALL_ID, maxSeconds: options.maxSeconds ?? 300 }, error: null });
    }
    if (href === "https://api.openai.com/v1/realtime/calls") return { ok: true, status: 200, text: async () => "answer-sdp", json: async () => ({}) } as unknown as Response;
    if (href === "/api/voice/realtime/tool") {
      const result = toolHandler(body as Record<string, unknown>);
      return json(result.status ?? 200, { success: (result.status ?? 200) < 400, data: result.data ?? null, error: null });
    }
    if (href === "/api/voice/realtime/context") return json(200, { success: true, data: { instructions: "fresh instructions" }, error: null });
    return json(200, { success: true, data: {}, error: null });
  });

  const deps: CallControllerDeps = {
    fetch: fetchFake as unknown as typeof fetch,
    getUserMedia: vi.fn(async () => {
      order.push("mic");
      return options.mic ? options.mic() : stream;
    }),
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
    createAudioElement: () => ({ autoplay: false, srcObject: null, play: async () => undefined }) as unknown as HTMLAudioElement,
    unlockAudio: vi.fn(() => void order.push("unlock")),
    requestWakeLock: vi.fn(async () => ({ release: async () => undefined })),
    sendBeacon,
  };

  return {
    controller: new CallController(deps, { greet: options.greet, endOnHidden: options.endOnHidden }),
    pc,
    dc: pc.dc,
    track,
    calls,
    callsTo: (url) => calls.filter((call) => call.url === url),
    order,
    deps,
    sendBeacon,
    setToolHandler: (handler) => {
      toolHandler = handler;
    },
  };
}

/** Starts a call and lets it connect. */
async function live(options: Parameters<typeof rig>[0] = {}) {
  const r = rig(options);
  await r.controller.start();
  return r;
}

const functionCall = (name: string, args: unknown = {}, id = `call_${name}`) => ({ type: "function_call", call_id: id, name, arguments: JSON.stringify(args) });
const responseDone = (output: unknown[], usage?: unknown) => ({ type: "response.done", response: { output, usage } });
/** Lets the controller's promise chains settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);
/** Advances time in 10s steps with someone talking in each, so the idle hang-up never applies. */
async function advanceWhileActive(r: { dc: FakeDataChannel }, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 10_000) {
    r.dc.receive({ type: "input_audio_buffer.speech_started" });
    await vi.advanceTimersByTimeAsync(Math.min(10_000, ms - elapsed));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T15:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// ------------------------------------------------------------------ tests

describe("starting a call", () => {
  it("unlocks audio and asks for the microphone before anything is awaited, then connects", async () => {
    const r = await live();
    expect(r.order.slice(0, 3)).toEqual(["unlock", "mic", "session"]);
    const sdp = r.callsTo("https://api.openai.com/v1/realtime/calls")[0];
    expect(sdp.init?.method).toBe("POST");
    expect(sdp.body).toBe("offer-sdp");
    expect(sdp.init?.headers).toMatchObject({ Authorization: "Bearer ek_secret", "Content-Type": "application/sdp" });
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "live", maxSeconds: 300, secondsLeft: 300 });
    expect(r.pc.tracks).toHaveLength(1);
  });

  it("opens the call with a one-line greeting unless told not to", async () => {
    const greeted = await live();
    expect(greeted.dc.sentOfType("response.create")).toHaveLength(1);
    const silent = await live({ greet: false });
    expect(silent.dc.sentOfType("response.create")).toHaveLength(0);
  });

  it("records what the browser actually gave it, for the diagnostics overlay", async () => {
    const r = await live();
    expect(r.controller.getSnapshot().debug).toMatchObject({ micSettings: { sampleRate: 48000, echoCancellation: true }, wakeLockActive: true });
  });

  it("never asks the server for a call when the microphone is refused", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const r = rig({ mic: () => Promise.reject(denied) });
    await r.controller.start();
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "error" });
    expect(r.controller.getSnapshot().error).toMatch(/Microphone access is blocked/);
    expect(r.callsTo("/api/voice/realtime/session")).toHaveLength(0);
  });

  it("releases the microphone and explains when the daily limit is reached", async () => {
    const r = rig({ sessionStatus: 429, sessionError: "You've used today's voice call time. It resets at midnight." });
    await r.controller.start();
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", error: "You've used today's voice call time. It resets at midnight." });
    expect(r.track.stopped).toBe(true);
    expect(r.callsTo("/api/voice/realtime/session")).toHaveLength(1);
  });

  it("ignores a second start", async () => {
    const r = await live();
    await r.controller.start();
    expect(r.callsTo("/api/voice/realtime/session")).toHaveLength(1);
  });

  it("starts a fresh call after the last one ended, so 'Call again' does something", async () => {
    const r = await live();
    r.controller.end("user");
    expect(r.controller.getSnapshot().phase).toBe("ended");

    await r.controller.start();

    expect(r.callsTo("/api/voice/realtime/session")).toHaveLength(2);
    expect(r.controller.getSnapshot().phase).toBe("live");
    expect(r.controller.getSnapshot().endReason).toBeNull();
    expect(r.controller.getSnapshot().error).toBeNull();
  });
});

describe("tool calls", () => {
  it("relays a function call to the server with the call id, the user's last words and the whole batch, then answers the model", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: { rankedSchedule: [] } } }));
    r.dc.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "  what's due today " });
    r.dc.receive(responseDone([functionCall("get_schedule", { window: "date", date: null })]));
    await settle();

    const tool = r.callsTo("/api/voice/realtime/tool")[0];
    expect(tool.body).toEqual({ callId: CALL_ID, name: "get_schedule", arguments: JSON.stringify({ window: "date", date: null }), lastUserTranscript: "what's due today", batch: ["get_schedule"] });
    expect(r.dc.sent.map((event) => event.type)).toEqual(["conversation.item.create", "response.create"]);
    expect(r.dc.sent[0]).toMatchObject({ item: { type: "function_call_output", call_id: "call_get_schedule", output: JSON.stringify({ rankedSchedule: [] }) } });
  });

  it("runs several calls from one response in order, and answers once after all of them", async () => {
    const r = await live({ greet: false });
    r.dc.receive(responseDone([functionCall("get_schedule", {}, "c1"), functionCall("get_weekly_review", {}, "c2")]));
    await settle();
    const tools = r.callsTo("/api/voice/realtime/tool");
    expect(tools.map((call) => (call.body as { name: string }).name)).toEqual(["get_schedule", "get_weekly_review"]);
    expect((tools[0].body as { batch: string[] }).batch).toEqual(["get_schedule", "get_weekly_review"]);
    expect(r.dc.sentOfType("response.create")).toHaveLength(1);
    expect(r.dc.sentOfType("conversation.item.create").map((e) => (e.item as { call_id: string }).call_id)).toEqual(["c1", "c2"]);
  });

  it("tells the model a tool failed instead of leaving it waiting", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ status: 500 }));
    r.dc.receive(responseDone([functionCall("get_schedule")]));
    await settle();
    expect(r.dc.sentOfType("conversation.item.create")[0]).toMatchObject({ item: { output: expect.stringContaining("couldn't do it right now") } });
    expect(r.dc.sentOfType("response.create")).toHaveLength(1);
  });

  it("ends the call when the server says it is over", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ status: 409 }));
    r.dc.receive(responseDone([functionCall("get_schedule")]));
    await settle();
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "cap" });
  });

  it("shows a lookup's citations on the screen", async () => {
    const r = await live({ greet: false });
    const citations = [{ sourceId: "s1", title: "Bucket list" }];
    r.setToolHandler(() => ({ data: { output: { answer: "Cherry blossoms." }, ui: { citations, extractionLabel: "machine_extracted" } } }));
    r.dc.receive(responseDone([functionCall("lookup_knowledge", { query: "bucket list" })]));
    await settle();
    expect(r.controller.getSnapshot()).toMatchObject({ citations, extractionLabel: "machine_extracted" });
  });

  it("accumulates token usage across responses for the diagnostics overlay", async () => {
    const r = await live({ greet: false });
    r.dc.receive(responseDone([], { input_tokens: 1000, output_tokens: 50, input_token_details: { cached_tokens: 800 } }));
    r.dc.receive(responseDone([], { input_tokens: 1200, output_tokens: 70, input_token_details: { cached_tokens: 1000 } }));
    expect(r.controller.getSnapshot().debug.usage).toEqual({ inputTokens: 2200, outputTokens: 120, cachedInputTokens: 1800 });
  });
});

describe("confirming a change by voice", () => {
  it("waits for the transcript of the user's answer before relaying a confirm", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i0", transcript: "delete my rent task" });
    r.dc.receive({ type: "input_audio_buffer.committed", item_id: "i1" }); // the user said "yes"; its transcript is still in flight
    r.dc.receive(responseDone([functionCall("confirm_pending_mutation", { session_id: SESSION_ID })]));
    await settle();
    expect(r.callsTo("/api/voice/realtime/tool")).toHaveLength(0);

    r.dc.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "yes" });
    await settle();
    const tool = r.callsTo("/api/voice/realtime/tool")[0];
    expect((tool.body as { lastUserTranscript: string }).lastUserTranscript).toBe("yes");
  });

  it("stops waiting after a short timeout if the transcript never arrives", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "input_audio_buffer.committed", item_id: "i1" });
    r.dc.receive(responseDone([functionCall("decline_pending_mutation", { session_id: SESSION_ID })]));
    await settle();
    expect(r.callsTo("/api/voice/realtime/tool")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2600);
    expect(r.callsTo("/api/voice/realtime/tool")).toHaveLength(1);
  });

  it("does not wait for transcripts before an ordinary lookup", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "input_audio_buffer.committed", item_id: "i1" });
    r.dc.receive(responseDone([functionCall("get_schedule")]));
    await settle();
    expect(r.callsTo("/api/voice/realtime/tool")).toHaveLength(1);
  });

  it("shows a pending change and arms its window only once the assistant has finished reading it out", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: { status: "awaiting_confirmation", session_id: SESSION_ID }, ui: { pending: { sessionId: SESSION_ID, summary: "Delete the task Pay rent", requiresTap: false } } } }));
    r.dc.receive(responseDone([functionCall("propose_mutation")]));
    await settle();

    expect(r.controller.getSnapshot().pending).toEqual({ sessionId: SESSION_ID, summary: "Delete the task Pay rent", requiresTap: false });
    // A stray end-of-playback from before the summary response must not arm it.
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    await settle();
    expect(r.callsTo(`/api/voice/${SESSION_ID}/arm`)).toHaveLength(0);

    r.dc.receive({ type: "response.created" });
    r.dc.receive({ type: "output_audio_buffer.started" });
    expect(r.callsTo(`/api/voice/${SESSION_ID}/arm`)).toHaveLength(0);
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    await settle();
    expect(r.callsTo(`/api/voice/${SESSION_ID}/arm`)).toHaveLength(1);

    r.dc.receive({ type: "response.created" });
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    await settle();
    expect(r.callsTo(`/api/voice/${SESSION_ID}/arm`)).toHaveLength(1);
  });

  it("never arms a tap-only change, and refreshes the model's data once a change is carried out", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: { status: "awaiting_confirmation" }, ui: { pending: { sessionId: SESSION_ID, summary: "Delete the course", requiresTap: true } } } }));
    r.dc.receive(responseDone([functionCall("propose_mutation")]));
    await settle();
    r.dc.receive({ type: "response.created" });
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    await settle();
    expect(r.callsTo(`/api/voice/${SESSION_ID}/arm`)).toHaveLength(0);

    r.setToolHandler(() => ({ data: { output: { status: "executed" }, ui: { resolved: { sessionId: SESSION_ID, outcome: "executed", summary: "Done" } }, contextChanged: true } }));
    r.dc.receive(responseDone([functionCall("confirm_pending_mutation", { session_id: SESSION_ID })]));
    await settle();
    expect(r.controller.getSnapshot().pending).toBeNull();
    expect(r.callsTo("/api/voice/realtime/context")).toHaveLength(1);
    expect(r.dc.sentOfType("session.update")[0]).toMatchObject({ session: { type: "realtime", instructions: "fresh instructions" } });
  });

  it("tells the model when the user answered with a tap, and clears the card", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: {}, ui: { pending: { sessionId: SESSION_ID, summary: "Delete the course", requiresTap: true } } } }));
    r.dc.receive(responseDone([functionCall("propose_mutation")]));
    await settle();

    r.controller.reportScreenDecision({ outcome: "executed", summary: "Deleted the course Algorithms." });
    expect(r.controller.getSnapshot().pending).toBeNull();
    const note = r.dc.sentOfType("conversation.item.create").at(-1) as { item: { role: string; content: Array<{ text: string }> } };
    expect(note.item.role).toBe("system");
    expect(note.item.content[0].text).toMatch(/tapped Confirm.*Deleted the course Algorithms/);
    expect(r.dc.sentOfType("response.create").length).toBeGreaterThan(0);

    r.controller.reportScreenDecision({ outcome: "declined", summary: "" });
    const cancel = r.dc.sentOfType("conversation.item.create").at(-1) as { item: { content: Array<{ text: string }> } };
    expect(cancel.item.content[0].text).toMatch(/tapped Cancel.*Nothing was changed/);
  });
});

describe("ending a call", () => {
  it("hangs up after the goodbye has played when the model calls end_call", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: { status: "ending" }, endCall: true } }));
    r.dc.receive(responseDone([functionCall("end_call")]));
    await settle();
    expect(r.controller.getSnapshot().phase).toBe("live");
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "user" });
  });

  it("hangs up anyway if the goodbye never reports finishing", async () => {
    const r = await live({ greet: false });
    r.setToolHandler(() => ({ data: { output: { status: "ending" }, endCall: true } }));
    r.dc.receive(responseDone([functionCall("end_call")]));
    await settle();
    await vi.advanceTimersByTimeAsync(4100);
    expect(r.controller.getSnapshot().phase).toBe("ended");
  });

  it("stops the microphone, closes the connection and tells the server why", async () => {
    const r = await live({ greet: false });
    r.controller.end("user");
    expect(r.track.stopped).toBe(true);
    expect(r.pc.closed).toBe(true);
    expect(r.dc.readyState).toBe("closed");
    const end = r.callsTo(`/api/voice/realtime/${CALL_ID}/end`)[0];
    expect(end.body).toEqual({ reason: "user" });
    expect(end.init?.keepalive).toBe(true);
  });

  it("only ends once", async () => {
    const r = await live({ greet: false });
    r.controller.end("user");
    r.controller.end("cap");
    expect(r.callsTo(`/api/voice/realtime/${CALL_ID}/end`)).toHaveLength(1);
    expect(r.controller.getSnapshot().endReason).toBe("user");
  });

  it("uses sendBeacon when the page is being closed", async () => {
    const r = await live({ greet: false });
    r.controller.end("hidden", undefined, { beacon: true });
    expect(r.sendBeacon).toHaveBeenCalledWith(`/api/voice/realtime/${CALL_ID}/end`, JSON.stringify({ reason: "hidden" }));
    expect(r.callsTo(`/api/voice/realtime/${CALL_ID}/end`)).toHaveLength(0);
  });

  it("ends the call when the connection fails", async () => {
    const r = await live({ greet: false });
    r.pc.connectionState = "failed";
    r.pc.onconnectionstatechange?.();
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "error" });
  });
});

describe("time limits", () => {
  it("counts down, then hangs up at the cap", async () => {
    const r = await live({ greet: false, maxSeconds: 120 });
    await advanceWhileActive(r, 10_000);
    expect(r.controller.getSnapshot().secondsLeft).toBe(110);
    await advanceWhileActive(r, 110_000);
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "cap" });
    expect(r.callsTo(`/api/voice/realtime/${CALL_ID}/end`)[0].body).toEqual({ reason: "cap" });
  });

  it("asks the assistant to wrap up 30 seconds before the end, once", async () => {
    const r = await live({ greet: false, maxSeconds: 120 });
    await advanceWhileActive(r, 85_000);
    expect(r.dc.sentOfType("conversation.item.create")).toHaveLength(0);
    await advanceWhileActive(r, 10_000);
    const warnings = r.dc.sentOfType("conversation.item.create");
    expect(warnings).toHaveLength(1);
    expect((warnings[0].item as { content: Array<{ text: string }> }).content[0].text).toMatch(/end in 30 seconds/);
    await advanceWhileActive(r, 20_000);
    expect(r.dc.sentOfType("conversation.item.create")).toHaveLength(1);
  });

  it("hangs up after a minute of nobody speaking", async () => {
    const r = await live({ greet: false });
    await vi.advanceTimersByTimeAsync((REALTIME_IDLE_TIMEOUT_SECONDS - 1) * 1000);
    expect(r.controller.getSnapshot().phase).toBe("live");
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "idle" });
  });

  it("does not count the user speaking, or the assistant answering, as idle", async () => {
    const r = await live({ greet: false });
    await vi.advanceTimersByTimeAsync(50_000);
    r.dc.receive({ type: "input_audio_buffer.speech_started" });
    await vi.advanceTimersByTimeAsync(50_000);
    expect(r.controller.getSnapshot().phase).toBe("live");
    r.dc.receive({ type: "output_audio_buffer.started" });
    await vi.advanceTimersByTimeAsync(120_000); // a long answer
    expect(r.controller.getSnapshot().phase).toBe("live");
  });

  it("does not hang up on idle while a tool is still running", async () => {
    const r = await live({ greet: false });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = r.deps.fetch;
    (r.deps as { fetch: typeof fetch }).fetch = (async (url: string, init?: RequestInit) => {
      if (url === "/api/voice/realtime/tool") await gate;
      return original(url, init);
    }) as typeof fetch;
    r.dc.receive(responseDone([functionCall("triage_email")]));
    await vi.advanceTimersByTimeAsync((REALTIME_IDLE_TIMEOUT_SECONDS + 10) * 1000);
    expect(r.controller.getSnapshot().phase).toBe("live");
    release();
  });

  it("hangs up when the app stays in the background, but not if it comes back in time", async () => {
    const r = await live({ greet: false });
    r.controller.setHidden(true);
    await vi.advanceTimersByTimeAsync((REALTIME_HIDDEN_GRACE_SECONDS - 5) * 1000);
    r.controller.setHidden(false);
    await advanceWhileActive(r, 60_000);
    expect(r.controller.getSnapshot().phase).toBe("live");

    r.controller.setHidden(true);
    await vi.advanceTimersByTimeAsync((REALTIME_HIDDEN_GRACE_SECONDS + 1) * 1000);
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "hidden" });
  });

  it("keeps a desktop call running when its tab is in the background, bounded by the call cap", async () => {
    const r = await live({ greet: false, endOnHidden: false });
    r.controller.setHidden(true);
    await advanceWhileActive(r, (REALTIME_HIDDEN_GRACE_SECONDS + 60) * 1000);
    expect(r.controller.getSnapshot().phase).toBe("live");
  });

  it("still takes the wake lock back when a desktop call's tab returns", async () => {
    const r = await live({ greet: false, endOnHidden: false });
    await settle();
    const before = (r.deps.requestWakeLock as ReturnType<typeof vi.fn>).mock.calls.length;
    r.controller.setHidden(true);
    r.controller.setHidden(false);
    await settle();
    expect((r.deps.requestWakeLock as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1);
  });

  it("an explicit endOnHidden of true behaves like the default", async () => {
    const r = await live({ greet: false, endOnHidden: true });
    r.controller.setHidden(true);
    await vi.advanceTimersByTimeAsync((REALTIME_HIDDEN_GRACE_SECONDS + 1) * 1000);
    expect(r.controller.getSnapshot()).toMatchObject({ phase: "ended", endReason: "hidden" });
  });
});

describe("conversation state", () => {
  it("follows who is talking", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "input_audio_buffer.speech_started" });
    expect(r.controller.getSnapshot().activity).toBe("listening");
    r.dc.receive({ type: "input_audio_buffer.speech_stopped" });
    expect(r.controller.getSnapshot().activity).toBe("thinking");
    r.dc.receive({ type: "output_audio_buffer.started" });
    expect(r.controller.getSnapshot().activity).toBe("speaking");
    r.dc.receive({ type: "output_audio_buffer.stopped" });
    expect(r.controller.getSnapshot().activity).toBe("listening");
  });

  it("measures the gap between the user finishing and the assistant's first audio", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "input_audio_buffer.speech_stopped" });
    await vi.advanceTimersByTimeAsync(640);
    r.dc.receive({ type: "output_audio_buffer.started" });
    r.dc.receive({ type: "output_audio_buffer.started" }); // a second chunk must not log a second sample
    expect(r.controller.getSnapshot().debug.responseLatenciesMs).toEqual([640]);
  });

  it("shows both sides' latest words", async () => {
    const r = await live({ greet: false });
    r.dc.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "what's due today" });
    r.dc.receive({ type: "response.output_audio_transcript.done", transcript: "You have two things due." });
    expect(r.controller.getSnapshot()).toMatchObject({ userLine: "what's due today", assistantLine: "You have two things due." });
  });

  it("mutes and unmutes the microphone without releasing it", async () => {
    const r = await live({ greet: false });
    r.controller.setMuted(true);
    expect(r.track.enabled).toBe(false);
    expect(r.controller.getSnapshot().muted).toBe(true);
    r.controller.setMuted(false);
    expect(r.track.enabled).toBe(true);
    expect(r.track.stopped).toBe(false);
  });

  it("notifies subscribers of changes and lets them unsubscribe", async () => {
    const r = rig({ greet: false });
    const listener = vi.fn();
    const unsubscribe = r.controller.subscribe(listener);
    await r.controller.start();
    expect(listener).toHaveBeenCalled();
    const count = listener.mock.calls.length;
    unsubscribe();
    r.controller.setMuted(true);
    expect(listener.mock.calls.length).toBe(count);
  });
});

describe("sending a request from a button (sendUserText)", () => {
  const TODAY = "What's on my plate today?";

  it("sends the words as a user message, asks for a reply, and shows them as what the user said", async () => {
    const r = await live();
    r.dc.sent.length = 0;
    r.controller.sendUserText(TODAY);

    const items = r.dc.sentOfType("conversation.item.create");
    expect(items).toHaveLength(1);
    expect(items[0].item).toMatchObject({ type: "message", role: "user", content: [{ type: "input_text", text: TODAY }] });
    expect(r.dc.sent.map((event) => event.type)).toEqual(["conversation.item.create", "response.create"]);
    expect(r.controller.getSnapshot()).toMatchObject({ userLine: TODAY, activity: "thinking" });
  });

  it("does nothing before the call is live", () => {
    const r = rig();
    r.controller.sendUserText(TODAY);
    expect(r.dc.sent).toEqual([]);
  });

  it("does nothing while the assistant is speaking, so two replies are never asked for at once", async () => {
    const r = await live();
    r.dc.receive({ type: "output_audio_buffer.started" });
    r.dc.sent.length = 0;
    r.controller.sendUserText(TODAY);
    expect(r.dc.sent).toEqual([]);
  });

  it("ignores blank text", async () => {
    const r = await live();
    r.dc.sent.length = 0;
    r.controller.sendUserText("   ");
    expect(r.dc.sent).toEqual([]);
  });
});
