import type { LibraryPlatform } from "@/lib/library/constants";

const FACEBOOK_HOSTS = new Set(["facebook.com", "fb.com", "fb.watch", "fb.me"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "instagr.am"]);
const MOBILE_PREFIXES = /^(www|m|web|mbasic)\./;

/** Facebook query params that identify content (everything else is tracking). */
const FACEBOOK_KEEP_PARAMS = new Set(["story_fbid", "id", "fbid", "v", "set", "multi_permalinks", "comment_id"]);
const TRACKING_PARAM = /^(utm_|mc_)|^(fbclid|gclid|igshid|igsh)$/i;
const INSTAGRAM_PATH = /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

/** Parses http(s) URLs only; returns null for anything else (or unparsable input). */
export function parsePostUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(MOBILE_PREFIXES, "");
}

export function detectPlatform(input: string): LibraryPlatform {
  const url = parsePostUrl(input);
  if (!url) return "other";
  const host = bareHost(url.hostname);
  if (host === "l.facebook.com" || FACEBOOK_HOSTS.has(host)) return "facebook";
  if (INSTAGRAM_HOSTS.has(host)) return "instagram";
  return "other";
}

/**
 * Canonical form used for per-user dedupe. Best-effort: Facebook
 * `/share/...` short links can't be resolved offline, so two different
 * share links to the same post won't collide.
 */
export function normalizePostUrl(input: string): string | null {
  let url = parsePostUrl(input);
  if (!url) return null;

  // Unwrap Facebook's outbound-link redirector: l.facebook.com/l.php?u=<target>
  if (bareHost(url.hostname) === "l.facebook.com") {
    const target = url.searchParams.get("u");
    const unwrapped = target ? parsePostUrl(target) : null;
    if (unwrapped) url = unwrapped;
  }

  const host = bareHost(url.hostname);
  const path = url.pathname.replace(/\/+$/, "") || "";

  if (INSTAGRAM_HOSTS.has(host)) {
    const match = INSTAGRAM_PATH.exec(url.pathname);
    // Instagram: only the content code matters; every query param is tracking.
    return match ? `https://instagram.com/${match[1]}/${match[2]}` : `https://${host}${path}`;
  }

  return canonicalUrl(url, host, path, FACEBOOK_HOSTS.has(host) ? (key) => FACEBOOK_KEEP_PARAMS.has(key) : (key) => !TRACKING_PARAM.test(key));
}

function canonicalUrl(url: URL, host: string, path: string, keepParam: (key: string) => boolean): string {
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (keepParam(key)) params.append(key, value);
  }
  params.sort();
  const query = params.toString();
  return `${url.protocol}//${host}${path}${query ? `?${query}` : ""}`;
}

/** Extra tracking params that job boards / ATSs append (on top of TRACKING_PARAM). */
const JOB_TRACKING_PARAM = /^(trk|trackingid|refid|ref|src|source|gh_src|lever-source|lever-origin|origin)$/i;

/**
 * Canonical form of a job posting URL, used for per-user dedupe of
 * applications. Same host/hash/trailing-slash handling as normalizePostUrl,
 * but generic for every host (no Facebook/Instagram allow-lists) and with
 * the job-board tracking params stripped as well.
 */
export function normalizeJobUrl(input: string): string | null {
  const url = parsePostUrl(input);
  if (!url) return null;
  const path = url.pathname.replace(/\/+$/, "") || "";
  return canonicalUrl(url, bareHost(url.hostname), path, (key) => !TRACKING_PARAM.test(key) && !JOB_TRACKING_PARAM.test(key));
}

/**
 * Only http(s) URLs without embedded credentials may be rendered as an
 * outbound link. Returns the href to use, or null when unsafe.
 */
export function safeExternalHref(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parsePostUrl(input);
  if (!url || url.username || url.password) return null;
  return url.toString();
}

/** Hostname for display (mono eyebrow), e.g. "instagram.com". */
export function displayHost(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parsePostUrl(input);
  return url ? bareHost(url.hostname) : null;
}
