/**
 * Authenticated encryption for cookies (AES-256-GCM, keys derived from SESSION_SECRET via HKDF).
 * A sealed value is confidential (the GitHub token inside can't be read) and tamper-proof.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
  const cacheKey = `${purpose}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: enc.encode("mobile-development-ai"), info: enc.encode(purpose) },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
    keyCache.set(cacheKey, key);
  }
  return key;
}

interface Envelope<T> {
  d: T;
  exp: number;
}

/** Encrypt `data` so it can only be opened with the same secret+purpose before `ttlSeconds` elapse. */
export async function seal<T>(data: T, secret: string, purpose: string, ttlSeconds: number): Promise<string> {
  const key = await deriveKey(secret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body: Envelope<T> = { d: data, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(body))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64url(out);
}

/** Returns the data, or null if tampered, wrong key/purpose, malformed, or expired. */
export async function unseal<T>(token: string | undefined, secret: string, purpose: string): Promise<T | null> {
  if (!token || token.length > 4096) return null;
  try {
    const raw = fromB64url(token);
    if (raw.length < 13) return null;
    const key = await deriveKey(secret, purpose);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    const env = JSON.parse(dec.decode(pt)) as Envelope<T>;
    if (typeof env.exp !== "number" || env.exp < Math.floor(Date.now() / 1000)) return null;
    return env.d;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return toB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
