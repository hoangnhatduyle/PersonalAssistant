import net from "node:net";

/**
 * SPEC-CORE-008 NC-017: the address-range denylist backing both stages of
 * URL-fetch SSRF defense (src/lib/knowledge/ssrf-fetch.ts). Deliberately a
 * denylist of address classes, not a hostname allowlist — this feature's
 * whole point is fetching arbitrary user-supplied URLs.
 */

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

// RFC 1918 private ranges, loopback, link-local (includes the 169.254.169.254
// cloud metadata endpoint), CGNAT, "this network", broadcast.
const IPV4_DENYLIST: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10], // CGNAT
  ["0.0.0.0", 8],
  ["255.255.255.255", 32],
];

function isDisallowedIpv4(ip: string): boolean {
  return IPV4_DENYLIST.some(([base, prefix]) => ipv4InCidr(ip, base, prefix));
}

/**
 * Expands a (possibly `::`-compressed) IPv6 address into its 8 16-bit
 * groups. Bug found via test failure: the WHATWG URL parser (which
 * ssrf-fetch.ts's `new URL()` call runs every hostname through) canonicalizes
 * `::ffff:127.0.0.1` into hex-group form `::ffff:7f00:1`, not the
 * dotted-decimal tail a naive `::ffff:(\d+\.\d+\.\d+\.\d+)` regex expects —
 * that regex silently never matched anything real, letting an IPv4-mapped
 * literal through unrecognized. Group-expansion works on the form the URL
 * parser actually produces.
 */
function expandIpv6Groups(address: string): number[] | null {
  const parts = address.split("::");
  if (parts.length > 2) return null;

  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];

  if (parts.length === 1) {
    if (head.length !== 8) return null;
    return head.map((g) => Number.parseInt(g, 16));
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array(missing).fill("0"), ...tail].map((g) => Number.parseInt(g || "0", 16));
}

function isDisallowedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique-local

  // IPv4-mapped (::ffff:a.b.c.d, groups 0-4 = 0, group 5 = 0xffff) and
  // IPv4-compatible (::a.b.c.d, deprecated, group 5 = 0) — unwrap the last
  // two groups (32 bits) back into an IPv4 address and re-check it against
  // the IPv4 denylist, rather than letting an embedded private/metadata
  // address slip through as "just an unrecognized IPv6 literal".
  const groups = expandIpv6Groups(normalized);
  if (groups && (groups[5] === 0xffff || groups[5] === 0) && groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0) {
    const embeddedIpv4 = [(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff].join(".");
    return isDisallowedIpv4(embeddedIpv4);
  }
  return false;
}

export function isDisallowedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isDisallowedIpv4(ip);
  if (family === 6) return isDisallowedIpv6(ip);
  return true; // not a recognizable literal IP at all — reject rather than guess
}
