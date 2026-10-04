import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";

/** Automated accessibility checks (axe-core) on the main screens, at phone size. */
function renderAt(path: string, demo = true) {
  render(
    <ThemeProvider>
      <SessionProvider initial={demo ? { mode: "demo", startedAt: new Date().toISOString() } : { mode: "anonymous" }}>
        <Router hook={memoryLocation({ path }).hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
}

async function violations() {
  const res = await axe.run(document.body, {
    // jsdom has no layout/canvas: contrast is checked visually in browser QA instead.
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return res.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const PAGES: [string, string, boolean?][] = [
  ["landing", "/", false],
  ["home", "/app"],
  ["projects", "/app/projects"],
  ["ai", "/app/ai"],
  ["history", "/app/ai/history"],
  ["settings", "/app/settings"],
  ["workspace files", "/app/projects/demo/pocket-tasks"],
  ["workspace git", "/app/projects/demo/pocket-tasks/git"],
  ["workspace overview", "/app/projects/demo/pocket-tasks/overview"],
];

describe("accessibility (axe)", () => {
  it.each(PAGES)("%s has no violations", async (_name, path, demo = true) => {
    renderAt(path, demo);
    // Wait for lazy routes / async content.
    await screen.findAllByRole("main", {}, { timeout: 3000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 300));
    expect(await violations()).toEqual([]);
  });
});
