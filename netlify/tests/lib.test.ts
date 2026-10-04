import { describe, expect, it } from "vitest";
import { randomToken, safeEqual, seal, unseal } from "../lib/crypto";
import { parseCookies, serializeCookie } from "../lib/cookies";
import { looksBinary, mapTree, MAX_TREE_ENTRIES } from "../lib/github";
import { postgresStore, rateLimit, setRateStore } from "../lib/security";
import { HttpError } from "../lib/http";

const SECRET = "s".repeat(16) + "t".repeat(16);

describe("seal / unseal", () => {
  it("round-trips and hides plaintext", async () => {
    const sealed = await seal({ token: "gho_secret" }, SECRET, "session", 60);
    expect(sealed).not.toContain("gho_secret");
    expect(await unseal(sealed, SECRET, "session")).toEqual({ token: "gho_secret" });
  });

  it("rejects wrong secret, wrong purpose, tampering, and expiry", async () => {
    const sealed = await seal({ a: 1 }, SECRET, "session", 60);
    expect(await unseal(sealed, SECRET + "x", "session")).toBeNull();
    expect(await unseal(sealed, SECRET, "oauth-state")).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(await unseal(flipped, SECRET, "session")).toBeNull();
    expect(await unseal(await seal({ a: 1 }, SECRET, "session", -1), SECRET, "session")).toBeNull();
    expect(await unseal(undefined, SECRET, "session")).toBeNull();
  });

  it("random tokens are unique", () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("cookies", () => {
  it("parses and serializes", () => {
    expect(parseCookies("a=1; b=hello%20world; a=2")).toEqual({ a: "1", b: "hello world" });
    expect(serializeCookie("x", "v", { maxAge: 10, secure: true })).toBe("x=v; Path=/; Max-Age=10; HttpOnly; Secure; SameSite=Lax");
  });
});

describe("github helpers", () => {
  it("detects binary content", () => {
    expect(looksBinary(new TextEncoder().encode("héllo"))).toBe(false);
    expect(looksBinary(new Uint8Array([104, 0, 105]))).toBe(true);
    expect(looksBinary(new Uint8Array([0xff, 0xfe, 0x41]))).toBe(true);
  });

  it("caps huge trees and flags truncation", () => {
    const big = { sha: "t", truncated: false, tree: Array.from({ length: MAX_TREE_ENTRIES + 5 }, (_, i) => ({ path: `f${i}`, type: "blob" as const, size: 1 })) };
    const out = mapTree(big);
    expect(out.entries).toHaveLength(MAX_TREE_ENTRIES);
    expect(out.truncated).toBe(true);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window", async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 1000, 0);
    await expect(rateLimit(key, 3, 1000, 10)).rejects.toThrow(HttpError);
    await expect(rateLimit(key, 3, 1000, 2000)).resolves.toBeUndefined();
  });

  it("uses one atomic upsert per hit in Postgres, with hashed keys", async () => {
    const counts = new Map<string, number>();
    const queries: string[] = [];
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      queries.push(text);
      if (text.includes("INSERT INTO rate_limits")) {
        const k = `${String(values[0])}@${String(values[1])}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return [{ count: String(counts.get(k)) }];
      }
      return [];
    }) as unknown as Parameters<typeof postgresStore>[0];
    setRateStore(postgresStore(sql, () => 1));
    try {
      await rateLimit("user:42", 2, 60_000, 1_000);
      await rateLimit("user:42", 2, 60_000, 2_000);
      const err = await rateLimit("user:42", 2, 60_000, 3_000).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).headers["Retry-After"]).toBe("57");
      expect([...counts.keys()][0]).not.toContain("user:42");
      expect(queries.every((q) => q.includes("ON CONFLICT"))).toBe(true);
    } finally {
      setRateStore(null);
    }
  });

  it("falls back to memory when the shared store fails", async () => {
    setRateStore({ kind: "postgres", hit: async () => { throw new Error("db down"); } });
    try {
      const key = `f-${Math.random()}`;
      await rateLimit(key, 1, 1000, 0);
      await expect(rateLimit(key, 1, 1000, 1)).rejects.toThrow(HttpError);
    } finally {
      setRateStore(null);
    }
  });
});
