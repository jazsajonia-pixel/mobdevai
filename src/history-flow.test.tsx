import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { saveTasks } from "./features/agent/store";
import { newTask } from "./features/agent/task";
import { SAMPLE_PATH, mockGitHub, renderApp } from "./test/github-fixture";

function renderAt(path: string) {
  renderApp(path);
}

beforeEach(() => {
  mockGitHub();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Task history page", () => {
  it("lists tasks, shows details with commit/PR info, filters, and deletes after confirmation", async () => {
    const shipped = {
      ...newTask("agent", "Add a delete button"),
      status: "done" as const,
      messages: [{ role: "user" as const, content: "Add a delete button" }, { role: "assistant" as const, content: "Added it." }],
      proposal: { "src/App.jsx": { path: "src/App.jsx", before: "a", after: "b", decision: "accepted" as const } },
      shipped: { sha: "abc1234def", url: "https://github.com/x/y/commit/abc", branch: "ai/mobile-development-ai/delete", at: new Date().toISOString(), pr: { number: 9, url: "https://github.com/x/y/pull/9" } },
    };
    const failed = { ...newTask("ask", "Why is it slow"), status: "error" as const, error: { code: "AI_PROVIDER_ERROR", message: "Provider timed out" } };
    saveTasks("ws:github:octo/pocket-tasks@main", [shipped, failed]);
    renderAt("/app/ai/history");

    const list = await screen.findByTestId("list-history");
    expect(within(list).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("filter-failed"));
    expect(within(screen.getByTestId("list-history")).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("filter-all"));

    fireEvent.click(screen.getByTestId(`history-task-${shipped.id}`));
    const detail = await screen.findByTestId("task-detail");
    expect(within(detail).getByTestId("text-task-prompt")).toHaveTextContent("Add a delete button");
    expect(within(detail).getByTestId("list-task-files")).toHaveTextContent("src/App.jsx");
    expect(within(detail).getByTestId("text-task-result")).toHaveTextContent("Added it.");
    expect(within(detail).getByTestId("task-shipped")).toHaveTextContent("PR #9");
    expect(detail).toHaveTextContent("octo/pocket-tasks");

    fireEvent.click(within(detail).getByTestId("button-delete-task"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(within(screen.getByTestId("list-history")).getAllByRole("button")).toHaveLength(1));
  });
});

describe("Project dashboard", () => {
  it("opens from the header and shows repo, branch, Git, AI and preview status", async () => {
    renderAt(SAMPLE_PATH);
    fireEvent.click(await screen.findByTestId("link-overview"));
    const dash = await screen.findByTestId("project-dashboard");
    expect(within(dash).getByTestId("card-repository")).toHaveTextContent("octo/pocket-tasks");
    expect(within(dash).getByTestId("card-branch")).toHaveTextContent("main");
    await waitFor(() => expect(within(dash).getByTestId("text-last-sync")).toHaveTextContent(/just now|ago/i));
    expect(within(dash).getByTestId("text-git-summary")).toHaveTextContent(/Working tree clean/);
    expect(within(dash).getByTestId("card-ai")).toBeInTheDocument();
    expect(within(dash).getByTestId("card-preview")).toHaveTextContent(/Not run yet/);
  });
});
