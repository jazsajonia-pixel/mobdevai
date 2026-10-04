import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("AI agent (demo, simulated)", () => {
  it("plans, waits for approval, proposes diffs, and applies accepted files to the workspace", async () => {
    renderDemo();
    expect(await screen.findByText("Simulated AI")).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("quick-add-a-delete-button-to-each-task"));
    fireEvent.click(screen.getByTestId("button-send-agent"));

    // Tool calls are logged; the run pauses on the plan — nothing proposed yet.
    const approve = await screen.findByTestId("button-approve-plan", {}, { timeout: 5000 });
    expect(screen.getAllByTestId("tool-read_file").length).toBe(2);
    expect(screen.queryByTestId("card-proposal")).toBeNull();
    expect(screen.queryByTestId("badge-changes")).toBeNull();

    fireEvent.click(approve);
    const review = await screen.findByTestId("button-review-changes", {}, { timeout: 5000 });
    expect(screen.getByTestId("card-proposal")).toHaveTextContent("3 files");
    // Proposed ≠ applied.
    expect(screen.queryByTestId("badge-changes")).toBeNull();

    fireEvent.click(review);
    const sheet = await screen.findByTestId("review-file-src/App.jsx");
    expect(within(sheet).getByTestId("diff-src/App.jsx")).toHaveTextContent("remove(id)");
    // Reject one, accept the rest.
    fireEvent.click(within(screen.getByTestId("review-file-src/styles.css")).getByTestId("button-reject-file"));
    fireEvent.click(await screen.findByTestId("button-accept-all"));

    await waitFor(() => expect(screen.getByTestId("badge-changes")).toHaveTextContent("2"));
    const card = screen.getByTestId("card-proposal");
    expect(card).toHaveTextContent("accepted");
    expect(card).toHaveTextContent("rejected");

    // Accepted edits are ordinary workspace changes in the Git tab.
    fireEvent.click(screen.getByTestId("tab-git"));
    expect(await screen.findByTestId("change-src/App.jsx")).toBeInTheDocument();
    expect(screen.queryByTestId("change-src/styles.css")).toBeNull();
  }, 20_000);

  it("Ask mode answers without proposing edits", async () => {
    renderDemo();
    fireEvent.click(await screen.findByTestId("mode-ask"));
    fireEvent.change(screen.getByTestId("input-agent-message"), { target: { value: "Explain how this app works" } });
    fireEvent.click(screen.getByTestId("button-send-agent"));
    expect(await screen.findByText(/Pocket Tasks is a small Vite \+ React app/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("card-proposal")).toBeNull();
    expect(screen.queryByTestId("card-plan")).toBeNull();
  }, 10_000);
});
