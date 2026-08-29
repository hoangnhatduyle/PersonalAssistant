import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { isDisallowedIp } from "@/lib/knowledge/ip-guard";
import {
  KNOWLEDGE_FETCH_ALLOWED_CONTENT_TYPES,
  KNOWLEDGE_FETCH_MAX_BYTES,
  KNOWLEDGE_FETCH_MAX_REDIRECTS,
  KNOWLEDGE_FETCH_TIMEOUT_MS,
} from "@/lib/knowledge/constants";

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  /** Every A/AAAA record the hostname resolved to (or the literal IP itself). */
  resolvedIps?: string[];
}

/**
 * Security-review finding: `URL.hostname` renders an IPv6 literal bracketed
 * (`"[::1]"`), which neither `net.isIP()` nor `dns.resolve4/6()` recognize
 * — every such URL was falling through to a failed DNS lookup and getting
 * rejected as "did not resolve." That happened to fail closed (safe), but
 * it silently made IPv6-literal URLs non-functional rather than correctly
 * validated. Strips the brackets before every place a hostname is checked
 * or connected to.
 */
function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * SPEC-CORE-008 NC-017 stage 1 / SPEC-API-008 NC-API-011 stage 1: synchronous,
 * no-network-call validation. Rejects a non-http(s) scheme, and rejects if
 * ANY resolved A/AAAA record (not just the first) is private/internal —
 * "must check every A/AAAA record a hostname resolves to."
 */
export async function validateUrlPreflight(rawUrl: string): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "Malformed URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "Only http(s) URLs are supported" };
  }

  const hostname = stripIpv6Brackets(parsed.hostname);
  let records: string[];
  if (net.isIP(hostname)) {
    records = [hostname];
  } else {
    const [v4, v6] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);
    records = [...v4, ...v6];
  }
  if (records.length === 0) {
    return { valid: false, reason: "Hostname did not resolve to any address" };
  }
  if (records.some((ip) => isDisallowedIp(ip))) {
    return { valid: false, reason: "URL resolves to a private, internal, or restricted address" };
  }
  return { valid: true, resolvedIps: records };
}

export interface PinnedFetchResult {
  body: string;
  finalUrl: string;
  contentType: string;
}

interface RawResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/**
 * Connects to the specific pre-validated IP directly (via a pinned `lookup`
 * override), never letting the HTTP client re-resolve DNS independently at
 * connect time — this is what actually defeats DNS-rebinding, which
 * survives a naive validate-then-fetch(url) pattern even when the
 * validation logic above is correct. TLS SNI/Host still use the real
 * hostname (only the socket's connect target is overridden).
 */
function requestPinned(url: URL, pinnedIp: string): Promise<RawResponse> {
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? https.request : http.request;
  const family = net.isIPv6(pinnedIp) ? 6 : 4;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn();
    };

    const req = requestFn(
      {
        protocol: url.protocol,
        hostname: stripIpv6Brackets(url.hostname),
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // Node's `timeout` option only resets on socket activity (an idle
        // timer, not a duration cap) — security-review finding: a remote
        // server trickling one byte every few seconds never trips it while
        // never accumulating enough bytes to trip KNOWLEDGE_FETCH_MAX_BYTES
        // either, holding the connection open far past the intended budget.
        // The `deadline` timer below is the actual wall-clock enforcement;
        // this option stays as a secondary guard against a fully idle peer.
        timeout: KNOWLEDGE_FETCH_TIMEOUT_MS,
        headers: {
          "User-Agent": "PersonalAssistant-KnowledgeImport/1.0",
          Accept: "text/html,text/plain",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedIp, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > KNOWLEDGE_FETCH_MAX_BYTES) {
            req.destroy();
            settle(() => reject(new Error("Response exceeded max size")));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          settle(() => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        res.on("error", (error) => settle(() => reject(error)));
      },
    );
    const deadline = setTimeout(() => {
      req.destroy();
      settle(() => reject(new Error("Request exceeded max duration")));
    }, KNOWLEDGE_FETCH_TIMEOUT_MS);
    req.on("timeout", () => req.destroy());
    req.on("error", (error) => settle(() => reject(error)));
    req.end();
  });
}

/**
 * SPEC-CORE-008 NC-017 stage 2 / SPEC-API-008 NC-API-011 stage 2, AC-003b:
 * re-validates and re-pins on every redirect hop up to
 * KNOWLEDGE_FETCH_MAX_REDIRECTS, enforces a max response size (streamed,
 * not post-hoc) and a max duration, and only accepts an allow-listed
 * content type.
 */
export async function fetchUrlPinned(initialUrl: string): Promise<PinnedFetchResult> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= KNOWLEDGE_FETCH_MAX_REDIRECTS; hop++) {
    const validation = await validateUrlPreflight(currentUrl);
    if (!validation.valid || !validation.resolvedIps?.length) {
      throw new Error(`URL failed validation at connection time: ${validation.reason ?? "unknown"}`);
    }

    const parsed = new URL(currentUrl);
    const response = await requestPinned(parsed, validation.resolvedIps[0]);

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers.location;
      if (!location) throw new Error(`Redirect status ${response.statusCode} with no Location header`);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Fetch failed with status ${response.statusCode}`);
    }

    const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!KNOWLEDGE_FETCH_ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }

    return { body: response.body.toString("utf-8"), finalUrl: currentUrl, contentType };
  }

  throw new Error("Too many redirects");
}
