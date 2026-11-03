import { REALTIME_HIDDEN_GRACE_SECONDS, REALTIME_IDLE_TIMEOUT_SECONDS } from "@/lib/voice/realtime/constants";
import type { CallToolResult, CallToolUi } from "@/lib/voice/realtime/tool-executor";

/**
 * The state machine behind a Realtime voice call, with no React and no direct
 * browser globals: every outside dependency is injected (CallControllerDeps),
 * so the event handling that matters -- tool round trips, confirmation timing,
 * the time cap, idle and background hang-ups -- is tested with fakes.
 * useRealtimeCall is a thin wrapper that supplies the real ones.
 *
 * Wire protocol, in brief: the browser opens a WebRTC connection to OpenAI
 * using a short-lived secret the server minted (POST /api/voice/realtime/
 * session), with audio on the media track and JSON events on a data channel
 * named "oai-events". When the model calls a tool, the call is relayed to our
 * server (POST /api/voice/realtime/tool), which runs it as the signed-in user,
 * and the result goes back over the data channel.
 */

export type CallPhase = "idle" | "connecting" | "live" | "ending" | "ended";
export type CallActivity = "listening" | "thinking" | "speaking";
export type CallEndReason = "user" | "cap" | "idle" | "hidden" | "error";

export interface PendingCard {
  sessionId: string;
  summary: string;
  requiresTap: boolean;
}

export interface CallDebug {
  connectionState: string;
  iceConnectionState: string;
  micSettings: { sampleRate?: number; echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean } | null;
  wakeLockActive: boolean;
  /** Speech-stopped to first audio out, ms, most recent last. The number that decides whether it feels human. */
  responseLatenciesMs: number[];
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
}

export interface CallSnapshot {
  phase: CallPhase;
  activity: CallActivity;
  muted: boolean;
  maxSeconds: number;
  secondsLeft: number;
  userLine: string;
  assistantLine: string;
  pending: PendingCard | null;
  citations: NonNullable<CallToolUi["citations"]>;
  extractionLabel: CallToolUi["extractionLabel"] | null;
  endReason: CallEndReason | null;
  error: string | null;
  debug: CallDebug;
}

export interface CallControllerDeps {
  fetch: typeof fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection: () => RTCPeerConnection;
  createAudioElement: () => HTMLAudioElement;
  /** Unlocks audio playback; must be called synchronously inside the tap that starts the call (iOS). */
  unlockAudio: () => void;
  requestWakeLock?: () => Promise<{ release(): Promise<void> } | null>;
  sendBeacon?: (url: string, data: string) => boolean;
  now?: () => number;
}

export interface CallControllerOptions {
  /** Say a one-line hello when the call connects. */
  greet?: boolean;
}

interface SessionResponse {
  clientSecret: string;
  callId: string;
  maxSeconds: number;
}

interface FunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const WARNING_BEFORE_END_SECONDS = 30;
/** Give the farewell time to finish playing before hanging up on end_call. */
const END_CALL_PLAYBACK_WAIT_MS = 4000;
/** How long a confirm/decline waits for the user's last words to be transcribed. */
const TRANSCRIPT_WAIT_MS = 2500;
const MAX_LATENCY_SAMPLES = 20;

const GREETING_INSTRUCTIONS = "Greet the user in one very short sentence, as if answering a call -- for example \"Hi, I'm here.\" Do not ask a long question.";

export class CallController {
  private snapshot: CallSnapshot;
  private listeners = new Set<() => void>();

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  private callId: string | null = null;
  private startedAt = 0;
  private lastActivityAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private endCallTimer: ReturnType<typeof setTimeout> | null = null;
  private warned = false;

  private lastUserTranscript: string | null = null;
  /** Committed user audio whose transcript has not arrived yet. */
  private untranscribed = new Set<string>();
  private transcriptWaiters: Array<() => void> = [];

  private toolsInFlight = 0;
  private toolQueue: Promise<void> = Promise.resolve();
  private endCallRequested = false;

  private armWanted: string[] = [];
  private armWaitingForSpeech = false;
  private speechStoppedAt: number | null = null;

  constructor(
    private readonly deps: CallControllerDeps,
    private readonly options: CallControllerOptions = {},
  ) {
    this.snapshot = this.initialSnapshot();
  }

  private initialSnapshot(): CallSnapshot {
    return {
      phase: "idle",
      activity: "listening",
      muted: false,
      maxSeconds: 0,
      secondsLeft: 0,
      userLine: "",
      assistantLine: "",
      pending: null,
      citations: [],
      extractionLabel: null,
      endReason: null,
      error: null,
      debug: {
        connectionState: "new",
        iceConnectionState: "new",
        micSettings: null,
        wakeLockActive: false,
        responseLatenciesMs: [],
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      },
    };
  }

  // ---------------------------------------------------------------- store

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CallSnapshot => this.snapshot;

  private update(patch: Partial<CallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private updateDebug(patch: Partial<CallDebug>): void {
    this.update({ debug: { ...this.snapshot.debug, ...patch } });
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  // ---------------------------------------------------------------- start

  /**
   * Starts the call. Call it straight from the tap handler: the audio unlock
   * and the microphone request both have to happen inside the user gesture on
   * iOS, so they are issued before anything is awaited.
   */
  async start(): Promise<void> {
    // A call that has ended leaves its last state on screen (the end note, the diagnostics);
    // "Call again" starts a fresh one from a clean slate. A call in progress is left alone.
    if (this.snapshot.phase === "ended") this.resetForNewCall();
    if (this.snapshot.phase !== "idle") return;
    this.update({ phase: "connecting", error: null });

    this.deps.unlockAudio();
    const audio = this.deps.createAudioElement();
    audio.autoplay = true;
    this.audio = audio;
    const micRequest = this.deps.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

    try {
      // Mic first, so a refused permission never starts (or bills) a call.
      this.stream = await micRequest;
      const session = await this.postJson<SessionResponse>("/api/voice/realtime/session", {});
      this.callId = session.callId;
      this.update({ maxSeconds: session.maxSeconds, secondsLeft: session.maxSeconds });
      await this.connect(session.clientSecret);
    } catch (error) {
      this.end("error", error instanceof Error ? friendlyStartError(error) : "Couldn't start the call.");
    }
  }

  /** Back to the state of a controller that has never made a call. Only ever called once the last call has fully ended. */
  private resetForNewCall(): void {
    // The old connection is closed, but detach its handlers so a late event from it
    // cannot touch the next call's state.
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
    }
    if (this.dc) this.dc.onmessage = null;
    this.pc = this.dc = this.stream = this.audio = this.wakeLock = null;
    this.callId = null;
    this.startedAt = this.lastActivityAt = 0;
    this.warned = false;
    this.lastUserTranscript = null;
    this.untranscribed = new Set();
    this.transcriptWaiters = [];
    this.toolsInFlight = 0;
    this.toolQueue = Promise.resolve();
    this.endCallRequested = false;
    this.armWanted = [];
    this.armWaitingForSpeech = false;
    this.speechStoppedAt = null;
    this.update(this.initialSnapshot());
  }

  private async connect(clientSecret: string): Promise<void> {
    const pc = this.deps.createPeerConnection();
    this.pc = pc;

    pc.ontrack = (event) => {
      if (this.audio) this.audio.srcObject = event.streams[0] ?? null;
      void this.audio?.play?.().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      this.updateDebug({ connectionState: pc.connectionState });
      if (pc.connectionState === "failed") this.end("error", "The connection dropped.");
    };
    pc.oniceconnectionstatechange = () => this.updateDebug({ iceConnectionState: pc.iceConnectionState });

    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream!);
    const micTrack = this.stream?.getAudioTracks()[0];
    if (micTrack?.getSettings) {
      const { sampleRate, echoCancellation, noiseSuppression, autoGainControl } = micTrack.getSettings();
      this.updateDebug({ micSettings: { sampleRate, echoCancellation, noiseSuppression, autoGainControl } });
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (message) => this.handleMessage(String(message.data));
    const opened = new Promise<void>((resolve, reject) => {
      dc.onopen = () => resolve();
      dc.onerror = () => reject(new Error("The call's data channel failed."));
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answer = await this.deps.fetch(REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!answer.ok) throw new Error(`The voice service refused the connection (${answer.status}).`);
    await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
    await opened;

    this.startedAt = this.now();
    this.lastActivityAt = this.startedAt;
    this.update({ phase: "live", activity: "listening" });
    this.tickTimer = setInterval(() => this.tick(), 1000);
    void this.acquireWakeLock();
    if (this.options.greet !== false) this.send({ type: "response.create", response: { instructions: GREETING_INSTRUCTIONS } });
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      this.wakeLock = (await this.deps.requestWakeLock?.()) ?? null;
    } catch {
      this.wakeLock = null;
    }
    this.updateDebug({ wakeLockActive: this.wakeLock !== null });
  }

  // --------------------------------------------------------------- timers

  private tick(): void {
    if (this.snapshot.phase !== "live") return;
    const elapsed = (this.now() - this.startedAt) / 1000;
    const secondsLeft = Math.max(0, Math.ceil(this.snapshot.maxSeconds - elapsed));
    this.update({ secondsLeft });

    if (elapsed >= this.snapshot.maxSeconds) return this.end("cap");

    if (!this.warned && this.snapshot.maxSeconds > WARNING_BEFORE_END_SECONDS * 2 && secondsLeft <= WARNING_BEFORE_END_SECONDS) {
      this.warned = true;
      this.send({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: `The call will end in ${WARNING_BEFORE_END_SECONDS} seconds. Wrap up in one short sentence.` }] },
      });
      this.send({ type: "response.create" });
    }

    const quiet = this.snapshot.activity === "listening" && this.toolsInFlight === 0;
    if (quiet && (this.now() - this.lastActivityAt) / 1000 >= REALTIME_IDLE_TIMEOUT_SECONDS) this.end("idle");
  }

  private touch(): void {
    this.lastActivityAt = this.now();
  }

  /** The app went to the background (or came back). A call nobody can hear is just cost. */
  setHidden(hidden: boolean): void {
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    if (this.snapshot.phase !== "live" && this.snapshot.phase !== "connecting") return;
    if (hidden) {
      this.hiddenTimer = setTimeout(() => this.end("hidden"), REALTIME_HIDDEN_GRACE_SECONDS * 1000);
    } else if (this.snapshot.phase === "live") {
      void this.acquireWakeLock(); // the browser drops the lock when the page is hidden
    }
  }

  // --------------------------------------------------------------- events

  private send(event: Record<string, unknown>): void {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private handleMessage(raw: string): void {
    let event: { type?: string; [key: string]: unknown };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.touch();
        this.speechStoppedAt = null;
        this.update({ activity: "listening" });
        break;
      case "input_audio_buffer.speech_stopped":
        this.touch();
        this.speechStoppedAt = this.now();
        this.update({ activity: "thinking" });
        break;
      case "input_audio_buffer.committed":
        if (typeof event.item_id === "string") this.untranscribed.add(event.item_id);
        break;
      case "conversation.item.input_audio_transcription.completed": {
        this.touch();
        const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
        if (transcript) {
          this.lastUserTranscript = transcript;
          this.update({ userLine: transcript });
        }
        this.settleTranscript(event.item_id);
        break;
      }
      case "conversation.item.input_audio_transcription.failed":
        this.settleTranscript(event.item_id);
        break;
      case "response.output_audio_transcript.done":
        if (typeof event.transcript === "string") this.update({ assistantLine: event.transcript });
        break;
      case "response.created":
        if (this.armWaitingForSpeech === false && this.armWanted.length > 0) this.armWaitingForSpeech = true;
        break;
      case "output_audio_buffer.started": {
        this.touch();
        if (this.speechStoppedAt !== null) {
          const latency = this.now() - this.speechStoppedAt;
          this.speechStoppedAt = null;
          this.updateDebug({ responseLatenciesMs: [...this.snapshot.debug.responseLatenciesMs, latency].slice(-MAX_LATENCY_SAMPLES) });
        }
        this.update({ activity: "speaking" });
        break;
      }
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.touch();
        this.update({ activity: this.toolsInFlight > 0 ? "thinking" : "listening" });
        void this.armPendingConfirmations();
        if (this.endCallRequested) this.end("user");
        break;
      case "response.done":
        this.handleResponseDone(event as { response?: { output?: unknown[]; usage?: Record<string, unknown> } });
        break;
      case "error":
        console.error("[voice call] realtime error event", event.error);
        break;
      default:
        break;
    }
  }

  private settleTranscript(itemId: unknown): void {
    if (typeof itemId === "string") this.untranscribed.delete(itemId);
    if (this.untranscribed.size === 0) {
      const waiters = this.transcriptWaiters;
      this.transcriptWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  /** Resolves once every committed utterance has its transcript, or after a short timeout. */
  private async waitForTranscripts(): Promise<void> {
    if (this.untranscribed.size === 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, TRANSCRIPT_WAIT_MS);
      this.transcriptWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private handleResponseDone(event: { response?: { output?: unknown[]; usage?: Record<string, unknown> } }): void {
    const usage = event.response?.usage as { input_tokens?: number; output_tokens?: number; input_token_details?: { cached_tokens?: number } } | undefined;
    if (usage) {
      const total = this.snapshot.debug.usage;
      this.updateDebug({
        usage: {
          inputTokens: total.inputTokens + (usage.input_tokens ?? 0),
          outputTokens: total.outputTokens + (usage.output_tokens ?? 0),
          cachedInputTokens: total.cachedInputTokens + (usage.input_token_details?.cached_tokens ?? 0),
        },
      });
    }

    const calls = (event.response?.output ?? []).filter((item): item is FunctionCallItem => typeof item === "object" && item !== null && (item as { type?: unknown }).type === "function_call");
    if (calls.length === 0) return;
    // Batches run strictly in order: a confirm must not overtake the proposal it follows.
    this.toolQueue = this.toolQueue.then(() => this.runToolBatch(calls)).catch((error) => console.error("[voice call] tool batch failed", error));
  }

  // ---------------------------------------------------------------- tools

  private async runToolBatch(calls: FunctionCallItem[]): Promise<void> {
    if (this.snapshot.phase !== "live") return;
    const names = calls.map((call) => call.name);
    this.toolsInFlight += 1;
    this.update({ activity: "thinking" });
    this.touch();

    try {
      for (const call of calls) {
        // The model can emit a confirm before the transcript of the user's "yes" arrives; the server
        // checks those words, so wait for them rather than reject a real yes as unanswered.
        if (call.name === "confirm_pending_mutation" || call.name === "decline_pending_mutation") await this.waitForTranscripts();

        const result = await this.callTool(call, names);
        this.applyUi(result.ui);
        if (result.endCall) this.endCallRequested = true;
        if (result.contextChanged) void this.refreshContext();
        this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result.output) } });
      }
    } finally {
      this.toolsInFlight -= 1;
      this.touch();
    }

    if (this.snapshot.phase !== "live") return;
    this.send({ type: "response.create" });
    // After end_call the model speaks its goodbye; hang up when it has finished (or after a cap on the wait).
    if (this.endCallRequested) this.endCallTimer = setTimeout(() => this.end("user"), END_CALL_PLAYBACK_WAIT_MS);
  }

  private async callTool(call: FunctionCallItem, batch: string[]): Promise<CallToolResult> {
    try {
      const response = await this.deps.fetch("/api/voice/realtime/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: this.callId, name: call.name, arguments: call.arguments, lastUserTranscript: this.lastUserTranscript, batch }),
      });
      if (response.status === 409) {
        this.end("cap");
        return { output: { error: "The call has ended." } };
      }
      const body = (await response.json()) as { success: boolean; data: CallToolResult | null; error: string | null };
      if (!response.ok || !body.success || !body.data) return { output: { error: "That didn't work. Tell the user you couldn't do it right now." } };
      return body.data;
    } catch {
      return { output: { error: "That didn't work. Tell the user you couldn't do it right now." } };
    }
  }

  private applyUi(ui: CallToolUi | undefined): void {
    if (!ui) return;
    const patch: Partial<CallSnapshot> = {};
    if (ui.citations) patch.citations = ui.citations;
    if (ui.extractionLabel) patch.extractionLabel = ui.extractionLabel;
    if (ui.resolved) patch.pending = null;
    if (ui.pending) {
      patch.pending = ui.pending;
      // Arm the confirmation window once the assistant has finished reading the summary, not before.
      if (!ui.pending.requiresTap) this.armWanted.push(ui.pending.sessionId);
    }
    this.update(patch);
  }

  private async armPendingConfirmations(): Promise<void> {
    if (!this.armWaitingForSpeech || this.armWanted.length === 0) return;
    const sessionIds = this.armWanted;
    this.armWanted = [];
    this.armWaitingForSpeech = false;
    await Promise.all(sessionIds.map((id) => this.deps.fetch(`/api/voice/${id}/arm`, { method: "POST" }).catch(() => undefined)));
  }

  private async refreshContext(): Promise<void> {
    try {
      const response = await this.deps.fetch("/api/voice/realtime/context");
      const body = (await response.json()) as { success: boolean; data: { instructions: string } | null };
      if (response.ok && body.success && body.data) this.send({ type: "session.update", session: { type: "realtime", instructions: body.data.instructions } });
    } catch {
      // The model keeps its earlier snapshot; the next confirmed change tries again.
    }
  }

  /**
   * The user answered a pending change with the on-screen button instead of
   * their voice. The model heard nothing, so tell it what happened.
   */
  reportScreenDecision(decision: { outcome: "executed" | "declined"; summary: string }): void {
    if (this.snapshot.phase !== "live") return;
    this.update({ pending: null });
    const text =
      decision.outcome === "executed"
        ? `The user tapped Confirm on the screen. The change was carried out: ${decision.summary} Tell them briefly that it is done.`
        : "The user tapped Cancel on the screen. Nothing was changed. Acknowledge briefly.";
    this.send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
    this.send({ type: "response.create" });
    if (decision.outcome === "executed") void this.refreshContext();
  }

  // -------------------------------------------------------------- control

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.update({ muted });
  }

  /** `beacon` is for page hide/close, where a normal fetch may be cancelled. */
  end(reason: CallEndReason, message?: string, options: { beacon?: boolean } = {}): void {
    if (this.snapshot.phase === "ending" || this.snapshot.phase === "ended") return;
    this.update({ phase: "ending" });

    for (const timer of [this.tickTimer, this.hiddenTimer, this.endCallTimer]) {
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
      }
    }
    this.tickTimer = this.hiddenTimer = this.endCallTimer = null;

    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      // Already closed.
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    if (this.audio) this.audio.srcObject = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;

    if (this.callId) {
      const url = `/api/voice/realtime/${this.callId}/end`;
      const body = JSON.stringify({ reason });
      if (options.beacon && this.deps.sendBeacon) this.deps.sendBeacon(url, body);
      else void this.deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    }

    this.update({
      phase: "ended",
      activity: "listening",
      endReason: reason,
      error: message ?? null,
      pending: null,
      secondsLeft: 0,
      debug: { ...this.snapshot.debug, wakeLockActive: false },
    });
  }

  private async postJson<T>(url: string, payload: unknown): Promise<T> {
    const response = await this.deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
    if (!response.ok || !body?.success || !body.data) {
      const error = new Error(body?.error ?? `Request failed (${response.status})`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return body.data;
  }
}

/** Turns the failures a person can actually cause or fix into something they can act on. */
function friendlyStartError(error: Error): string {
  const status = (error as Error & { status?: number }).status;
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Microphone access is blocked. Allow it in your device's settings and try again.";
  if (error.name === "NotFoundError") return "No microphone was found.";
  if (status === 429) return error.message;
  return error.message || "Couldn't start the call.";
}
