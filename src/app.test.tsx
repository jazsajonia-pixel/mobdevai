import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";

function renderAt(path: string) {
  const loc = memoryLocation({ path, record: true });
  render(
    <ThemeProvider>
      <SessionProvider initial={{ mode: "anonymous" }}>
        <Router hook={loc.hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
  return loc;
}

describe("routing", () => {
  it("renders the landing page", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Build, edit, preview, and ship");
    expect(screen.getByTestId("button-start-building")).toBeInTheDocument();
  });

  it("redirects anonymous users away from protected routes", () => {
    const loc = renderAt("/app/settings");
    expect(loc.history?.at(-1)).toBe("/signin");
  });

  it("Try Demo enters a clearly labelled demo workspace and opens files", () => {
    renderAt("/");
    fireEvent.click(screen.getByTestId("button-try-demo"));
    expect(screen.getByTestId("banner-demo")).toHaveTextContent("DEMO");
    expect(screen.getByTestId("text-repo-name")).toHaveTextContent("demo/pocket-tasks");
    fireEvent.click(screen.getByText("README.md"));
    expect(screen.getByTestId("code-viewer")).toHaveTextContent("Pocket Tasks");
  });
});
