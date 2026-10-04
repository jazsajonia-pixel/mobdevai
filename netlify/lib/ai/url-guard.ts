import { isProduction } from "../env";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "../http";

/**
 * SSRF guard for user-supplied provider base URLs. The server calls these URLs with the user's
 * key, so they must not reach the function's own network (metadata endpoints, localhost, VPCs).
 * `AI_ALLOW_PRIVATE_BASE_URLS=true` relaxes this for local development only.
 */

function bad(message: string): never {
  throw new HttpError(422, "AI_BAD_BASE_URL", message);
}

function ipv4Private(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return ipv4Private(mapped[1]!);
    return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb");
  }
  return true;
}

// Local development only — never honoured in production deploys.
const allowPrivate = () => process.env.AI_ALLOW_PRIVATE_BASE_URLS === "true" && !isProduction();

/** Normalise + validate syntax (no DNS). Returns the URL without a trailing slash. */
export function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    bad("Base URL must be a full URL like https://api.example.com/v1.");
  }
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) bad("Base URL must use https://.");
  if (url.username || url.password) bad("Base URL can't contain credentials.");
  if (url.search || url.hash) bad("Base URL can't contain a query string or fragment.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowPrivate()) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIP(host)) {
      bad("Local and internal hostnames aren't allowed.");
    }
    if (isIP(host) && isPrivateAddress(host)) bad("Private network addresses aren't allowed.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Resolve DNS and reject hosts that point into private ranges (best effort vs. rebinding). */
export async function assertPublicHost(baseUrl: string): Promise<void> {
  if (allowPrivate()) return;
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // already checked in normalizeBaseUrl
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    bad("That host name doesn't resolve.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) bad("That host resolves to a private network address.");
}
