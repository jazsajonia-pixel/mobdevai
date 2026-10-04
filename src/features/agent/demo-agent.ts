import type { AgentMessage, AgentMode, AgentStepResponse, ToolCall } from "@/types/agent";

/**
 * SIMULATED agent for demo mode — no AI provider is called. It follows scripted plans for a few
 * requests on the bundled Pocket Tasks project, but it drives the real loop: real tool calls,
 * real proposal, real diffs and review. Everything it says is labelled as simulated.
 */

interface Script {
  id: string;
  match: RegExp;
  steps: (ToolCall | string)[][];
}

let seq = 0;
const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: `demo_${(seq++).toString(36)}`, name, args });

const DELETE_SCRIPT: Script = {
  id: "delete",
  match: /\b(delete|remove)\b.*\b(task|item|button|todo)s?\b|\bdelete button\b/i,
  steps: [
    [call("list_files", { path: "src" })],
    [call("read_file", { path: "src/components/TaskItem.jsx" }), call("read_file", { path: "src/App.jsx" })],
    [
      call("propose_plan", {
        summary: "Add a delete button to each task.",
        steps: ["TaskItem.jsx: render a small “Delete” button and call a new onDelete prop", "App.jsx: add a remove(id) function and pass it to every TaskItem", "styles.css: style the button so it's easy to tap on a phone"],
      }),
    ],
    [
      call("apply_patch", {
        path: "src/components/TaskItem.jsx",
        edits: [
          { find: "export default function TaskItem({ task, onToggle }) {", replace: "export default function TaskItem({ task, onToggle, onDelete }) {" },
          { find: "      </label>\n", replace: '      </label>\n      <button type="button" className="delete" onClick={onDelete} aria-label={`Delete ${task.title}`}>\n        Delete\n      </button>\n' },
        ],
      }),
      call("apply_patch", {
        path: "src/App.jsx",
        edits: [
          { find: "  const remaining =", replace: "  function remove(id) {\n    setTasks((t) => t.filter((task) => task.id !== id));\n  }\n\n  const remaining =" },
          { find: "onToggle={() => toggle(task.id)} />", replace: "onToggle={() => toggle(task.id)} onDelete={() => remove(task.id)} />" },
        ],
      }),
      call("apply_patch", {
        path: "src/styles.css",
        edits: [
          {
            find: ".task.done span {",
            replace:
              ".task {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n}\n\n.task label {\n  flex: 1;\n}\n\n.task .delete {\n  min-height: 2.75rem;\n  padding: 0 0.75rem;\n  border: 0;\n  border-radius: 0.5rem;\n  background: transparent;\n  color: #b42318;\n  font-size: 0.875rem;\n}\n\n.task.done span {",
          },
        ],
      }),
    ],
    [
      "**Done (simulated).** I proposed changes to 3 files:\n\n- `src/components/TaskItem.jsx` — a **Delete** button that calls a new `onDelete` prop\n- `src/App.jsx` — `remove(id)` filters the task out; passed to each `TaskItem`\n- `src/styles.css` — a 44px-tall, red text button\n\nReview the diffs below and accept the files you want.",
    ],
  ],
};

const CLEAR_SCRIPT: Script = {
  id: "clear",
  match: /\bclear\b.*\b(done|completed|finished)\b|\b(completed|done)\b.*\bclear\b/i,
  steps: [
    [call("read_file", { path: "src/App.jsx" })],
    [
      call("propose_plan", {
        summary: "Add a “Clear completed” button under the list.",
        steps: ["App.jsx: add clearCompleted() that keeps only unfinished tasks", "App.jsx: show the button only when something is completed", "styles.css: style it as a secondary action"],
      }),
    ],
    [
      call("apply_patch", {
        path: "src/App.jsx",
        edits: [
          { find: "  const remaining =", replace: "  function clearCompleted() {\n    setTasks((t) => t.filter((task) => !task.done));\n  }\n\n  const remaining =" },
          {
            find: "      </ul>\n",
            replace: '      </ul>\n\n      {tasks.some((t) => t.done) && (\n        <button type="button" className="clear" onClick={clearCompleted}>\n          Clear completed\n        </button>\n      )}\n',
          },
        ],
      }),
      call("apply_patch", {
        path: "src/styles.css",
        edits: [{ find: ".task.done span {", replace: ".clear {\n  margin-top: 1rem;\n  min-height: 2.75rem;\n  width: 100%;\n  border: 1px solid #d8d6d0;\n  border-radius: 0.5rem;\n  background: transparent;\n  font-size: 1rem;\n}\n\n.task.done span {" }],
      }),
    ],
    ["**Done (simulated).** `App.jsx` gets `clearCompleted()` and a button that appears once a task is checked; `styles.css` styles it full-width. Review and accept below."],
  ],
};

const DARK_SCRIPT: Script = {
  id: "dark",
  match: /\bdark\b/i,
  steps: [
    [call("read_file", { path: "src/styles.css" })],
    [call("propose_plan", { summary: "Follow the phone's dark mode setting.", steps: ["styles.css: add a prefers-color-scheme: dark block", "Adjust text, borders and the Add button for contrast"] })],
    [
      call("apply_patch", {
        path: "src/styles.css",
        edits: [
          {
            find: ".app {",
            replace:
              "@media (prefers-color-scheme: dark) {\n  :root {\n    color: #ecebe8;\n    background: #141518;\n  }\n\n  .composer input {\n    background: #1d1f23;\n    border-color: #34363b;\n    color: inherit;\n  }\n\n  .composer button {\n    background: #ecebe8;\n    color: #141518;\n  }\n\n  .task label {\n    border-bottom-color: #2a2c31;\n  }\n}\n\n.app {",
          },
        ],
      }),
    ],
    ["**Done (simulated).** `styles.css` now has a `prefers-color-scheme: dark` block, so the app follows the phone's theme. Review the diff below."],
  ],
};

const EXPLAIN_SCRIPT: Script = {
  id: "explain",
  match: /\b(explain|what does|how does|overview|walk me|review|find (a )?bug)\b/i,
  steps: [
    [call("inspect_package_json", {}), call("read_file", { path: "src/App.jsx" })],
    [
      "**Simulated answer.** Pocket Tasks is a small Vite + React app:\n\n- `src/main.jsx` mounts `<App />`.\n- `src/App.jsx` keeps `tasks` in `useState`, adds a task on submit (ignoring blank input), and toggles `done` by id.\n- `src/components/TaskItem.jsx` renders one checkbox row.\n- `remaining` counts unfinished tasks for the header.\n\nOne thing to watch: ids use `Date.now()`, which can collide if two tasks are added in the same millisecond — `crypto.randomUUID()` is safer.\n\nSign in and add an AI provider to ask real questions about your own code.",
    ],
  ],
};

/** Edit scripts verify their changes with a real preview build before the summary, like a real agent should. */
function withPreviewCheck(s: Script): Script {
  const last = s.steps[s.steps.length - 1]!;
  return { ...s, steps: [...s.steps.slice(0, -1), [call("request_preview", {})], last] };
}

const SCRIPTS = [withPreviewCheck(DELETE_SCRIPT), withPreviewCheck(CLEAR_SCRIPT), withPreviewCheck(DARK_SCRIPT), EXPLAIN_SCRIPT];

export const DEMO_SUGGESTIONS = ["Add a delete button to each task", "Add a “Clear completed” button", "Support dark mode", "Explain how this app works"];

const FALLBACK =
  "**Demo mode — simulated AI.** No AI model is connected, so I can only run a few scripted requests on this sample project:\n\n" +
  DEMO_SUGGESTIONS.map((s) => `- ${s}`).join("\n") +
  "\n\nSign in with GitHub and add an AI provider in Settings to use a real model on your repositories.";

function lastUserIndex(messages: AgentMessage[]): number {
  return messages.map((m) => m.role).lastIndexOf("user");
}

function reply(content: string, toolCalls?: ToolCall[]): AgentStepResponse {
  return {
    message: { role: "assistant", content, ...(toolCalls?.length ? { toolCalls } : {}) },
    stopReason: toolCalls?.length ? "tool_use" : "end_turn",
    usage: { inputTokens: 0, outputTokens: 0 },
    provider: { id: "demo", label: "Simulated (demo)", kind: "demo", model: "scripted" },
  };
}

export async function demoStep(mode: AgentMode, messages: AgentMessage[], signal?: AbortSignal): Promise<AgentStepResponse> {
  await new Promise((r) => setTimeout(r, 350)); // feel like a real step, still instant enough
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const ui = lastUserIndex(messages);
  const userText = ui >= 0 ? (messages[ui] as { content: string }).content : "";
  const turn = messages.slice(ui + 1);

  // Plan rejected or a tool failed (e.g. the user already edited the demo files).
  const results = turn.filter((m): m is Extract<AgentMessage, { role: "tool" }> => m.role === "tool");
  if (results.some((r) => r.name === "propose_plan" && r.content.startsWith("The user did NOT"))) {
    return reply("The simulated agent can't revise plans. Describe the change differently, or sign in and add an AI provider to use a real model.");
  }
  const failed = results.find((r) => r.isError);
  if (failed) {
    return reply(`The simulated agent hit an error: ${failed.content}\n\nThe demo scripts expect the original sample files — discard your demo changes in the Git tab and try again.`);
  }

  const script = SCRIPTS.find((s) => s.match.test(userText) && (mode === "agent" || s.id === "explain"));
  if (!script) {
    const wantsEdit = SCRIPTS.some((s) => s.id !== "explain" && s.match.test(userText));
    return reply(wantsEdit && mode === "ask" ? "That's a change request — switch to **Agent** mode so I can propose edits (simulated in the demo)." : FALLBACK);
  }
  const stepIndex = turn.filter((m) => m.role === "assistant").length;
  const step = script.steps[stepIndex];
  if (!step) return reply("Done (simulated).");
  const text = step.filter((x): x is string => typeof x === "string").join("\n");
  const calls = step.filter((x): x is ToolCall => typeof x !== "string").map((c) => ({ ...c, id: `demo_${(seq++).toString(36)}` }));
  return reply(text, calls);
}
