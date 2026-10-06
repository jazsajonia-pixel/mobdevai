import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentStepResponse, ToolCall } from "@/types/agent";
import { DEMO_FILES } from "@/features/demo/sample-project";
import { applyEdits, hasConflict, PatchError, propose, setDecision } from "./proposal";
import { executeTool, overlayPaths, type WorkspaceView } from "./tools-exec";
import { advance, answerPlan, withUserMessage, type StepFn } from "./runner";
import { compactForStorage, newTask } from "./task";
import { mentionedPaths } from "./composer";

function ws(files: Record<string, string>): WorkspaceView {
  return {
    paths: () => Object.keys(files),
    read: async (p) => {
      if (!(p in files)) throw new Error("missing");
      return files[p]!;
    },
    changes: () => [],
  };
}

const call = (name: string, args: Record<string, unknown> | null, id = name): ToolCall => ({ id, name, args });

describe("applyEdits", () => {
  it("replaces exact, unique matches", () => {
    expect(applyEdits("a\nb\nc\n", [{ find: "b", replace: "B" }])).toBe("a\nB\nc\n");
  });
  it("rejects missing and ambiguous matches with a hint", () => {
    expect(() => applyEdits("x", [{ find: "y", replace: "z" }])).toThrow(PatchError);
    expect(() => applyEdits("aa", [{ find: "a", replace: "b" }])).toThrow(/2|more than once|unique/i);
  });
});

describe("proposal", () => {
  it("drops no-op proposals and tracks decisions/conflicts", () => {
    let p = propose({}, "a.ts", "x", "x");
    expect(p).toEqual({});
    p = propose(p, "a.ts", "x", "y");
    expect(p["a.ts"]).toMatchObject({ before: "x", after: "y", decision: "pending" });
    expect(hasConflict(p["a.ts"]!, "x")).toBe(false);
    expect(hasConflict(p["a.ts"]!, "edited meanwhile")).toBe(true);
    p = setDecision(p, ["a.ts"], "accepted");
    expect(p["a.ts"]!.decision).toBe("accepted");
  });
});

describe("executeTool", () => {
  const files = { "src/a.ts": "export const a = 1;\n", "README.md": "# hi\n", "package.json": '{"name":"x","scripts":{"dev":"vite"}}' };
  it("reads, lists and searches", async () => {
    const r = await executeTool(call("read_file", { path: "src/a.ts" }), ws(files), {}, "ask");
    expect(r.isError).toBe(false);
    expect(r.content).toContain("export const a");
    const l = await executeTool(call("list_files", {}), ws(files), {}, "ask");
    expect(l.content).toContain("README.md");
    const s = await executeTool(call("search_code", { query: "const a" }), ws(files), {}, "ask");
    expect(s.content).toContain("src/a.ts");
  });
  it("refuses write tools in Ask mode and bad paths", async () => {
    const r = await executeTool(call("create_file", { path: "b.ts", content: "x" }), ws(files), {}, "ask");
    expect(r.isError).toBe(true);
    const bad = await executeTool(call("read_file", { path: "../etc/passwd" }), ws(files), {}, "agent");
    expect(bad.isError).toBe(true);
    const unknown = await executeTool(call("rm_rf", {}), ws(files), {}, "agent");
    expect(unknown.isError).toBe(true);
  });
  it("write tools only stage a proposal; reads see the overlay", async () => {
    const w = ws(files);
    let p = (await executeTool(call("apply_patch", { path: "src/a.ts", edits: [{ find: "1", replace: "2" }] }), w, {}, "agent")).proposal;
    expect(files["src/a.ts"]).toContain("= 1"); // workspace untouched
    expect(p["src/a.ts"]!.after).toContain("= 2");
    const r = await executeTool(call("read_file", { path: "src/a.ts" }), w, p, "agent");
    expect(r.content).toContain("= 2");
    p = (await executeTool(call("create_file", { path: "src/b.ts", content: "b" }), w, p, "agent")).proposal;
    p = (await executeTool(call("delete_file", { path: "README.md", reason: "unused" }), w, p, "agent")).proposal;
    expect(overlayPaths(w, p)).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts"]));
    expect(overlayPaths(w, p)).not.toContain("README.md");
    expect(p["README.md"]!.after).toBeNull();
  });
  it("reports patch failures as tool errors", async () => {
    const r = await executeTool(call("apply_patch", { path: "src/a.ts", edits: [{ find: "nope", replace: "x" }] }), ws(files), {}, "agent");
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/not found|read_file/i);
  });
  it("handles invalid JSON args", async () => {
    const r = await executeTool({ id: "x", name: "read_file", args: null, rawArgs: "{bad" }, ws(files), {}, "agent");
    expect(r.isError).toBe(true);
  });
});

function scripted(replies: Array<{ text?: string; calls?: ToolCall[] }>): StepFn {
  let i = 0;
  const fn: StepFn = async () => {
    const r = replies[i++] ?? { text: "end" };
    return {
      message: { role: "assistant", content: r.text ?? "", ...(r.calls ? { toolCalls: r.calls } : {}) },
      stopReason: r.calls ? "tool_calls" : "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
      provider: { id: "p", label: "P", kind: "openai", model: "m" },
    } satisfies AgentStepResponse;
  };
  return fn;
}

describe("runner", () => {
  const files = { "src/a.ts": "const a = 1;\n" };
  it("runs tools, pauses on the plan, resumes after approval, ends with a proposal", async () => {
    const step = scripted([
      { calls: [call("read_file", { path: "src/a.ts" }, "c1")] },
      { calls: [call("propose_plan", { summary: "bump", steps: ["edit a"] }, "c2")] },
      { calls: [call("apply_patch", { path: "src/a.ts", edits: [{ find: "1", replace: "2" }] }, "c3")] },
      { text: "Done." },
    ]);
    const deps = { step, workspace: ws(files), signal: new AbortController().signal, onUpdate: () => {} };
    let t = withUserMessage(newTask("agent", "bump"), "bump a");
    t = await advance(t, deps);
    expect(t.status).toBe("awaiting_plan");
    expect(t.proposal).toEqual({});
    t = await advance(answerPlan(t, true), deps);
    expect(t.status).toBe("done");
    expect(t.proposal["src/a.ts"]!.after).toBe("const a = 2;\n");
    expect(files["src/a.ts"]).toBe("const a = 1;\n");
    // every call got exactly one result
    const results = t.messages.filter((m) => m.role === "tool").map((m) => (m as { toolCallId: string }).toolCallId);
    expect(results).toEqual(["c1", "c2", "c3"]);
  });

  it("plan feedback is sent back as the propose_plan result", async () => {
    const step = scripted([{ calls: [call("propose_plan", { summary: "s", steps: ["a"] }, "p1")] }, { text: "revised" }]);
    const deps = { step, workspace: ws(files), signal: new AbortController().signal, onUpdate: () => {} };
    let t = await advance(withUserMessage(newTask("agent", "x"), "x"), deps);
    t = withUserMessage(t, "use a different approach"); // typing while a plan waits = feedback
    t = await advance(t, deps);
    const fb = t.messages.find((m) => m.role === "tool" && m.toolCallId === "p1") as { content: string };
    expect(fb.content).toMatch(/did NOT approve/);
    expect(fb.content).toContain("use a different approach");
  });

  it("stops cleanly when aborted and records errors", async () => {
    const ctrl = new AbortController();
    const step: StepFn = async () => {
      ctrl.abort();
      throw new DOMException("Aborted", "AbortError");
    };
    const t = await advance(withUserMessage(newTask("ask", "x"), "x"), { step, workspace: ws(files), signal: ctrl.signal, onUpdate: () => {} });
    expect(t.status).toBe("stopped");
    const failing: StepFn = async () => {
      throw new Error("boom");
    };
    const e = await advance(withUserMessage(newTask("ask", "x"), "x"), { step: failing, workspace: ws(files), signal: new AbortController().signal, onUpdate: () => {} });
    expect(e.status).toBe("error");
    expect(e.error?.message).toBe("boom");
  });

  it("flags truncated replies", async () => {
    const step: StepFn = async () => ({ message: { role: "assistant", content: "half" }, stopReason: "length", usage: {}, provider: { id: "p", label: "P", kind: "openai", model: "m" } }) as AgentStepResponse;
    const t = await advance(withUserMessage(newTask("ask", "x"), "x"), { step, workspace: ws(files), signal: new AbortController().signal, onUpdate: () => {} });
    expect((t.messages[1] as { content: string }).content).toMatch(/length limit/);
  });

  it("compacts large tool outputs for storage", () => {
    const t = { ...newTask("ask", "x"), messages: [{ role: "user", content: "x" }, { role: "assistant", content: "", toolCalls: [call("read_file", { path: "a" }, "c")] }, { role: "tool", toolCallId: "c", name: "read_file", content: "z".repeat(20000) }] as AgentMessage[] };
    expect((compactForStorage(t).messages[2] as { content: string }).content.length).toBeLessThan(8000);
  });
});

describe("mentions", () => {
  it("extracts @paths that exist", () => {
    expect(mentionedPaths("fix @src/a.ts, and @nope.ts", ["src/a.ts"])).toEqual(["src/a.ts"]);
  });
});

describe("request_preview tool", () => {
  it("builds the demo with proposed edits and reports build errors with a location", async () => {
    const files = Object.fromEntries(DEMO_FILES.map((f) => [f.path, f.content])) as Record<string, string>;
    const w = ws(files);
    const ok = await executeTool(call("request_preview", {}), w, {}, "ask");
    expect(ok.isError).toBe(false);
    expect(ok.content).toMatch(/Build OK \(Vite \+ React\)/);
    expect(ok.content).toMatch(/npm: .*react/);
    expect(ok.content).toMatch(/Runtime check unavailable/);

    const broken = propose({}, "src/App.jsx", files["src/App.jsx"]!, `const x = ;\n${files["src/App.jsx"]!}`);
    const bad = await executeTool(call("request_preview", {}), w, broken, "agent");
    expect(bad.content).toMatch(/BUILD FAILED in src\/App\.jsx:1/);

    const probed = await executeTool(call("request_preview", {}), { ...w, probe: async () => ({ booted: true, errors: [{ message: "boom", where: "src/App.jsx:3" }], console: [] }) }, {}, "agent");
    expect(probed.content).toMatch(/RUNTIME ERROR at src\/App\.jsx:3: boom/);
  });

  it("explains unsupported projects", async () => {
    const r = await executeTool(call("request_preview", {}), ws({ "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }), "pages/index.js": "" }), {}, "ask");
    expect(r.content).toMatch(/Preview not available: Next\.js/);
  });
});

describe("mergeDecisions", () => {
  it("keeps decisions made during a run unless the proposed content changed", async () => {
    const { mergeDecisions } = await import("./proposal");
    const base = propose(propose({}, "a.ts", "1", "2"), "b.ts", "x", "y");
    const latest = setDecision(base, ["a.ts", "b.ts"], "accepted");
    const incoming = propose(base, "b.ts", "x", "z"); // agent revised b.ts meanwhile
    const m = mergeDecisions(latest, incoming);
    expect(m["a.ts"]!.decision).toBe("accepted");
    expect(m["b.ts"]!.decision).toBe("pending");
  });
});
