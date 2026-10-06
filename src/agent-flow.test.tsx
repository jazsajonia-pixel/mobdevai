import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";

function renderDemo(path = "/app/projects/demo/pocket-tasks/ai") {
  const loc = memoryLocation({ path, record: true });
  render(
    <ThemeProvider>
      <SessionProvider initial={{ mode: "demo", startedAt: new Date().toISOString() }}>
        <Router hook={loc.hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
  return loc;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Live preview (demo)", () => {
  it("builds the real app — including workspace changes — into a sandboxed, opaque-origin frame", async () => {
    renderDemo("/app/projects/demo/pocket-tasks/preview");
    const frame = (await screen.findByTestId("preview-frame", {}, { timeout: 8000 })) as HTMLIFrameElement;
    // Never same-origin: project code can't reach this app's cookies, storage or API.
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    const html = frame.getAttribute("srcdoc") ?? "";
    expect(html).toContain('"src/App.jsx"');
    expect(html).toContain("useState");
    expect(html).toContain("esm.sh/react@");
    expect(await screen.findByText(/4 modules · 2 npm packages via esm\.sh/)).toBeInTheDocument();
    expect(screen.queryByTestId("button-header-preview")).toBeNull();
  }, 15_000);

  it("lists projects to preview and what isn't supported yet", async () => {
    renderDemo("/app/preview");
    expect(await screen.findByTestId("link-preview-demo-pocket-tasks")).toHaveAttribute("href", expect.stringContaining("/app/projects/demo/pocket-tasks/preview"));
    expect(screen.getByText(/Not in the browser preview yet/)).toBeInTheDocument();
  });
});
