import type { ProjectRef, WorkspaceFile } from "@/types/workspace";

/**
 * Bundled sample project for DEMO mode. It is a real, small Vite + React app so later phases
 * (editor, AI diff, live preview) can operate on genuine code without GitHub credentials.
 * Nothing here is ever pushed anywhere.
 */
export const DEMO_PROJECT: ProjectRef = {
  id: "demo/pocket-tasks",
  source: "demo",
  owner: "demo",
  name: "pocket-tasks",
  defaultBranch: "main",
  visibility: "demo",
  description: "A tiny Vite + React to-do app bundled for trying Mobile Development AI.",
};

export const DEMO_FILES: WorkspaceFile[] = [
  {
    path: "package.json",
    content: `{
  "name": "pocket-tasks",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
`,
  },
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pocket Tasks</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  },
  {
    path: "vite.config.js",
    content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
  },
  {
    path: "src/main.jsx",
    content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
  },
  {
    path: "src/App.jsx",
    content: `import { useState } from "react";
import TaskItem from "./components/TaskItem.jsx";

const STARTER = [
  { id: 1, title: "Sketch the onboarding flow", done: true },
  { id: 2, title: "Write release notes", done: false },
  { id: 3, title: "Review open pull requests", done: false },
];

export default function App() {
  const [tasks, setTasks] = useState(STARTER);
  const [draft, setDraft] = useState("");

  function addTask(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setTasks((t) => [...t, { id: Date.now(), title, done: false }]);
    setDraft("");
  }

  function toggle(id) {
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <main className="app">
      <header>
        <h1>Pocket Tasks</h1>
        <p>{remaining} left today</p>
      </header>

      <form onSubmit={addTask} className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task"
          aria-label="New task"
        />
        <button type="submit">Add</button>
      </form>

      <ul className="list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={() => toggle(task.id)} />
        ))}
      </ul>
    </main>
  );
}
`,
  },
  {
    path: "src/components/TaskItem.jsx",
    content: `export default function TaskItem({ task, onToggle }) {
  return (
    <li className={task.done ? "task done" : "task"}>
      <label>
        <input type="checkbox" checked={task.done} onChange={onToggle} />
        <span>{task.title}</span>
      </label>
    </li>
  );
}
`,
  },
  {
    path: "src/styles.css",
    content: `:root {
  font-family: system-ui, sans-serif;
  color: #1c1f24;
  background: #f6f5f2;
}

.app {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

header h1 {
  margin: 0;
  font-size: 1.5rem;
}

header p {
  margin: 0.25rem 0 1rem;
  color: #6b6f76;
}

.composer {
  display: flex;
  gap: 0.5rem;
}

.composer input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #d8d6d0;
  border-radius: 0.5rem;
  font-size: 1rem;
}

.composer button {
  padding: 0 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: #1c1f24;
  color: white;
  font-size: 1rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

.task label {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.875rem 0;
  border-bottom: 1px solid #e6e4df;
}

.task.done span {
  text-decoration: line-through;
  color: #9a9da3;
}
`,
  },
  {
    path: "README.md",
    content: `# Pocket Tasks

A tiny Vite + React to-do list used as the Mobile Development AI demo project.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  },
];
