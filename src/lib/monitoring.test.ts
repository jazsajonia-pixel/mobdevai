import { afterEach, describe, expect, it } from "vitest";
import { _resetReporting, buildReport, reportError, type ClientErrorReport } from "./monitoring";

afterEach(() => {
  _resetReporting();
  window.location.hash = "";
});

describe("client error reporting", () => {
  it("masks repository names in the route and trims stacks", () => {
    window.location.hash = "#/app/projects/acme/secret-repo/files?x=1";
    const err = new Error("boom");
    err.stack = "Error: boom\n    at f (http://x/assets/a.js?v=123:1:2)";
    const r = buildReport("error", err);
    expect(r.route).toBe("/app/projects/:owner/:repo/files");
    expect(r.stack).not.toContain("?v=123");
    expect(r.release).toBeTruthy();
  });

  it("de-duplicates and caps reports per page load", () => {
    const sent: ClientErrorReport[] = [];
    const send = (r: ClientErrorReport) => sent.push(r);
    expect(reportError("error", new Error("same"), send)).toBe(true);
    expect(reportError("error", new Error("same"), send)).toBe(false);
    for (let i = 0; i < 10; i++) reportError("error", new Error(`e${i}`), send);
    expect(sent).toHaveLength(5);
  });
});
