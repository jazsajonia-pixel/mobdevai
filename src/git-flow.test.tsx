import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SAMPLE_FILES } from "./test/sample-project";
import { COMMIT_SHA, SAMPLE_PATH, json, mockGitHub, renderApp } from "./test/github-fixture";

const sampleFile = (path: string) => SAMPLE_FILES.find((f) => f.path === path)?.content ?? "";

const KEY = "mdai:ws:github:octo/pocket-tasks@main";

function seed() {
  const base = sampleFile("README.md");
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: 1,
      baseSha: COMMIT_SHA,
      changes: {
        "README.md": { path: "README.md", status: "modified", content: base + "\nMore docs.\n", base },
        "src/styles.css": { path: "src/styles.css", status: "modified", content: "body{}\n", base: sampleFile("src/styles.css") },
      },
      drafts: {},
      tabs: [],
      active: null,
    }),
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Git shipping", () => {
  it("commits only the selected files to a new branch and opens a pull request", async () => {
    const commits: unknown[] = [];
    const pulls: unknown[] = [];
    const fetchMock = mockGitHub({
      extra: async (url, init) => {
        if (url.pathname.endsWith("/commit") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { branch: string; files: unknown[] };
          commits.push(body);
          return json({ branch: body.branch, created: true, parentSha: COMMIT_SHA, commit: { sha: "beef".padEnd(40, "1"), url: "https://github.com/octo/pocket-tasks/commit/beef", message: "m" }, files: body.files.length }, 201);
        }
        if (url.pathname.endsWith("/pulls") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { head: string; base: string; title: string };
          pulls.push(body);
          return json({ pull: { number: 7, url: "https://github.com/octo/pocket-tasks/pull/7", title: body.title, state: "open", draft: false, merged: false, head: body.head, base: body.base }, existing: false }, 201);
        }
        return undefined;
      },
    });
    seed();
    renderApp(`${SAMPLE_PATH}/git`);
    const panel = await screen.findByTestId("ship-panel", {}, { timeout: 5000 });
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("radio-new-branch")).toBeChecked();
    expect((screen.getByTestId("input-branch-name") as HTMLInputElement).value).toMatch(/^ai\/mobile-development-ai\//);

    // Leave styles.css out of the commit.
    fireEvent.click(screen.getByTestId("checkbox-src/styles.css"));
    expect(screen.getByTestId("text-selected-count")).toHaveTextContent("1 file");
    expect((screen.getByTestId("input-commit-message") as HTMLTextAreaElement).value).toContain("README.md");

    fireEvent.click(screen.getByTestId("button-commit"));
    expect(await screen.findByTestId("ship-summary")).toHaveTextContent("README.md");
    fireEvent.click(screen.getByRole("button", { name: /^Commit & push$/ }));

    await waitFor(() => expect(commits).toHaveLength(1), { timeout: 4000 });
    const sent = commits[0] as { files: { path: string }[]; createFrom?: string };
    expect(sent.files.map((f) => f.path)).toEqual(["README.md"]);
    expect(sent.createFrom).toBe(COMMIT_SHA);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("asks for confirmation before committing directly to the default branch", async () => {
    mockGitHub();
    seed();
    renderApp(`${SAMPLE_PATH}/git`);
    fireEvent.click(await screen.findByTestId("radio-current-branch", {}, { timeout: 5000 }));
    fireEvent.click(screen.getByTestId("button-commit"));
    expect(await screen.findByText("Commit directly to main?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("ship-summary")).toHaveTextContent(/Branch\s*main/));
  });
});
