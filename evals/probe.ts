/**
 * Passive observer for the OpenAI calls a turn makes. Wraps globalThis.fetch
 * and records latency, token usage and tool calls per request without altering
 * anything on the wire -- the eval must exercise byte-identical shipped code.
 *
 * The cached-input share is the acceptance metric for the prompt-cache work:
 * a turn sends ~24k input tokens, and only the stable prefix of that is
 * cacheable, so `cachedInputTokens / inputTokens` is what should move when the
 * volatile block stops being concatenated into `instructions`.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface ModelCall {
  ms: number;
  status: number;
  model: string;
  effort: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolCalls: Array<{ name: string; arguments: string }>;
}

const store = new AsyncLocalStorage<ModelCall[]>();
let installed = false;

export function installProbe(): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sink = store.getStore();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!sink || !url.includes("/v1/responses")) return original(input, init);

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
    } catch {
      // A non-JSON body is not a turn we can attribute; fall through recording nothing.
    }

    const start = Date.now();
    const response = await original(input, init);
    // Read the body here so `ms` covers the full response, then hand the SDK a
    // fresh Response over the buffered text. content-encoding/length would
    // describe the original compressed stream, so they are dropped.
    const text = await response.text();
    const ms = Date.now() - start;

    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    let parsed: {
      usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
      output?: Array<{ type: string; name?: string; arguments?: string }>;
    } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Error envelopes are not JSON-shaped usage; the status below still records the failure.
    }

    sink.push({
      ms,
      status: response.status,
      model: String(body.model ?? ""),
      effort: (body.reasoning as { effort?: string } | undefined)?.effort ?? null,
      inputTokens: parsed.usage?.input_tokens ?? 0,
      cachedInputTokens: parsed.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      reasoningTokens: parsed.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      toolCalls: (parsed.output ?? [])
        .filter((item) => item.type === "function_call")
        .map((item) => ({ name: item.name ?? "", arguments: item.arguments ?? "" })),
    });

    return new Response(text, { status: response.status, statusText: response.statusText, headers });
  };
}

/** Runs `fn`, collecting every /v1/responses call it makes. */
export async function observe<T>(fn: () => Promise<T>): Promise<{ value: T; calls: ModelCall[] }> {
  const calls: ModelCall[] = [];
  const value = await store.run(calls, fn);
  return { value, calls };
}
