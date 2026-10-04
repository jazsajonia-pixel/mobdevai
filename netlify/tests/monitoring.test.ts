import { afterEach, describe, expect, it } from "vitest";
import handler from "../functions/client-errors";
import { log, redact, redactString, setLogSink } from "../lib/log";
import { handle } from "../lib/http";
import { HttpError } from "../lib/http";
import { ORIGIN } from "./helpers";

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  delete process.env.LOG_LEVEL;
});

function capture(): string[] {
  const lines: string[] = [];
  process.env.LOG_LEVEL = "debug";
  restore = setLogSink((l) => lines.push(l));
  return lines;
}

describe("redaction", () => {
  it("masks secret keys and token-looking values", () => {
    expect(redactString("auth failed for ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe("auth failed for [redacted]");
    expect(redactString("key sk-proj-abcdefghijklmnop1234 bad")).toBe("key [redacted] bad");
    expect(redactString("Authorization: Bearer abc.def")).toContain("[redacted]");
    expect(redact({ apiKey: "x", nested: { access_token: "y", ok: "fine" }, list: ["AIzaSyA1234567890abcdefghijk"] })).toEqual({
      apiKey: "[redacted]",
      nested: { access_token: "[redacted]", ok: "fine" },
      list: ["[redacted]"],
    });
  });

  it("emits one JSON line per event", () => {
    const lines = capture();
    log("info", "hello", { token: "gho_1234567890abcdefghij", n: 1 });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: "info", msg: "hello", token: "[redacted]", n: 1 });
  });
});

describe("request logging + request ids", () => {
  it("logs method, path (no query), status, duration and code — and returns X-Request-Id", async () => {
    const lines = capture();
    const fn = handle(["GET"], async () => {
      throw new HttpError(404, "NOT_FOUND", "nope");
    });
    const res = await fn(new Request("https://app.example/api/thing?ref=secret-branch"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(((await res.json()) as { error: { requestId: string } }).error.requestId).toBe(id);
    const entry = JSON.parse(lines.at(-1)!);
    expect(entry).toMatchObject({ msg: "request", method: "GET", path: "/api/thing", status: 404, code: "NOT_FOUND", requestId: id });
    expect(lines.join("\n")).not.toContain("secret-branch");
  });

  it("reuses Netlify's request id and hides internal error details from clients", async () => {
    const lines = capture();
    const fn = handle(["GET"], async () => {
      throw new Error("db password=hunter2 exploded");
    });
    const res = await fn(new Request("https://app.example/api/x", { headers: { "x-nf-request-id": "01HXYZ" } }));
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("01HXYZ");
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
    expect(lines.some((l) => l.includes('"unhandled"'))).toBe(true);
  });
});

describe("POST /api/client-errors", () => {
  const post = (body: unknown, origin = ORIGIN) =>
    handler(new Request(`${ORIGIN}/api/client-errors`, { method: "POST", headers: { origin, "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone)" }, body: JSON.stringify(body) }), { ip: `1.2.3.${Math.floor(Math.random() * 250)}` });

  it("accepts a valid report and logs it redacted", async () => {
    const lines = capture();
    const res = await post({ kind: "error", message: "boom ghp_abcdefghijklmnopqrstuvwxyz123456", route: "/app", release: "0.9.0" });
    expect(res.status).toBe(204);
    const entry = JSON.parse(lines.find((l) => l.includes("client error"))!);
    expect(entry).toMatchObject({ level: "error", kind: "error", route: "/app", browser: "mobile" });
    expect(entry.message).toBe("boom [redacted]");
  });

  it("rejects unknown fields, oversize bodies and cross-site posts", async () => {
    expect((await post({ kind: "error", message: "x", route: "/", release: "1", fileContents: "secret" })).status).toBe(422);
    expect((await post({ kind: "error", message: "x".repeat(301), route: "/", release: "1" })).status).toBe(422);
    expect((await post({ kind: "error", message: "x", route: "/", release: "1" }, "https://evil.example")).status).toBe(403);
  });
});
