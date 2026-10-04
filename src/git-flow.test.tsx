import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";
import { DEMO_FILES } from "./features/demo/sample-project";

const demoFile = (path: string) => DEMO_FILES.find((f) => f.path === path)?.content ?? "";

const KEY = "mdai:ws:demo:demo/pocket-tasks@main";

function seed() {
  const base = demoFile("README.md");
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: 1,
      baseSha: "demo-v1",
      changes: {
        "README.md": { path: "README.md", status: "modified", content: base + "\nMore docs.\n", base },
        "src/styles.css": { path: "src/styles.css", status: "modified", content: "body{}\n", base: demoFile("src/styles.css") },
      },
      drafts: {},
      tabs: [],
      active: null,
    }),
  );
}

function renderDemo(path = "/app/projects/demo/pocket-tasks/git") {
  render(
    <ThemeProvider>
      <SessionProvider initial={{ mode: "demo", startedAt: new Date().toISOString() }}>
        <Router hook={memoryLocation({ path }).hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("Git shipping (demo, simulated)", () => {
  it("commits only selected files to a working branch, clearly labelled as simulated, with no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    seed();
    renderDemo();
    const panel = await screen.findByTestId("ship-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("radio-new-branch")).toBeChecked();
    expect((screen.getByTestId("input-branch-name") as HTMLInputElement).value).toMatch(/^ai\/mobile-development-ai\//);

    // Leave styles.css out of the commit.
    fireEvent.click(screen.getByTestId("checkbox-src/styles.css"));
    expect(screen.getByTestId("text-selected-count")).toHaveTextContent("1 file");
    expect((screen.getByTestId("input-commit-message") as HTMLTextAreaElement).value).toContain("README.md");

    fireEvent.click(screen.getByTestId("button-commit"));
    expect(await screen.findByTestId("ship-summary")).toHaveTextContent("README.md");
    fireEvent.click(screen.getByRole("button", { name: /^Simulate$/ }));

    const result = await screen.findByTestId("ship-result", {}, { timeout: 4000 });
    expect(result).toHaveTextContent(/Simulated commit/);
    expect(result).toHaveTextContent(/nothing was sent to GitHub/);
    expect(screen.getByTestId("list-commits")).toHaveTextContent(/simulated/i);
    // Demo never touches the workspace or the network.
    expect(screen.getByTestId("ship-panel")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/api/github"))).toEqual([]);
  });

  it("asks for confirmation before committing directly to the default branch", async () => {
    seed();
    renderDemo();
    fireEvent.click(await screen.findByTestId("radio-current-branch"));
    fireEvent.click(screen.getByTestId("button-commit"));
    expect(await screen.findByText("Simulate this commit?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("ship-summary")).toHaveTextContent(/Branch\s*main/));
  });
});
