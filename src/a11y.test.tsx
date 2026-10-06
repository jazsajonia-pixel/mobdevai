import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import axe from "axe-core";
import { GH_SESSION, SAMPLE_PATH, mockGitHub, renderApp } from "./test/github-fixture";

/** Automated accessibility checks (axe-core) on the main screens, at phone size. */
function renderAt(path: string, signedIn = true) {
  mockGitHub();
  renderApp(path, signedIn ? GH_SESSION : { mode: "anonymous" });
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
  vi.unstubAllGlobals();
  localStorage.clear();
});

const PAGES: [string, string, boolean?][] = [
  ["landing", "/", false],
  ["home", "/app"],
  ["projects", "/app/projects"],
  ["ai", "/app/ai"],
  ["history", "/app/ai/history"],
  ["settings", "/app/settings"],
  ["skills", "/app/skills"],
  ["sign in", "/signin", false],
  ["workspace files", SAMPLE_PATH],
  ["workspace git", `${SAMPLE_PATH}/git`],
  ["workspace ai", `${SAMPLE_PATH}/ai`],
  ["workspace overview", `${SAMPLE_PATH}/overview`],
];

describe("accessibility (axe)", () => {
  it.each(PAGES)("%s has no violations", async (_name, path, signedIn = true) => {
    renderAt(path, signedIn);
    // Wait for lazy routes / async content.
    await screen.findAllByRole("main", {}, { timeout: 3000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 300));
    expect(await violations()).toEqual([]);
  });
});
