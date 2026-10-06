import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { __resetSkillsForTests } from "./features/skills/use-skills";
import { score } from "./features/command/command-palette";
import { repoNameError } from "./features/github/new-repo";
import { SAMPLE_PATH, SAMPLE_REPO, json, mockGitHub, renderApp } from "./test/github-fixture";
import type { UserSkill } from "./lib/skills";

beforeEach(() => {
  localStorage.clear();
  __resetSkillsForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** In-memory /api/skills server. */
function skillsServer(initial: { custom?: UserSkill[]; enabled?: string[] } = {}, opts: { failPut?: boolean } = {}) {
  const db = { custom: initial.custom ?? [], enabled: initial.enabled ?? ["code-review"] };
  const puts: unknown[] = [];
  const fetchMock = mockGitHub({
    extra: (url, init) => {
      if (url.pathname !== "/api/skills") return undefined;
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as typeof db;
        puts.push(body);
        if (opts.failPut) return json({ error: { code: "INTERNAL", message: "boom" } }, 500);
        Object.assign(db, body);
      }
      return json({ ...db, storage: "database" });
    },
  });
  return { db, puts, fetchMock };
}

describe("Skills page", () => {
  it("toggles a built-in skill and syncs it", async () => {
    const { db } = skillsServer();
    renderApp("/app/skills");
    const sw = await screen.findByTestId("switch-skill-debugging");
    await waitFor(() => expect(screen.getByTestId("text-skills-storage")).toHaveTextContent("Synced to your account"));
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    await waitFor(() => expect(db.enabled).toContain("debugging"));
    expect(await screen.findByTestId("text-skills-saved")).toHaveTextContent("Debugging enabled");
  });

  it("validates, creates, edits and deletes a custom skill", async () => {
    const { db } = skillsServer();
    renderApp("/app/skills");
    fireEvent.click(await screen.findByTestId("button-add-first-skill"));
    fireEvent.click(await screen.findByTestId("button-save-skill"));
    expect(await screen.findByText("Give the skill a name.")).toBeInTheDocument();
    expect(db.custom).toHaveLength(0);

    fireEvent.change(screen.getByTestId("input-skill-name"), { target: { value: "API rules" } });
    fireEvent.change(screen.getByTestId("input-skill-instructions"), { target: { value: "Validate with Zod." } });
    fireEvent.click(screen.getByTestId("button-save-skill"));
    await waitFor(() => expect(db.custom).toHaveLength(1));
    const id = db.custom[0]!.id;
    expect(id).toMatch(/^u_/);
    expect(db.enabled).toContain(id);
    expect(await screen.findByTestId(`row-skill-${id}`)).toHaveTextContent("API rules");

    fireEvent.click(screen.getByTestId(`button-edit-skill-${id}`));
    const name = await screen.findByTestId("input-skill-name");
    await waitFor(() => expect(name).toHaveValue("API rules"));
    fireEvent.change(name, { target: { value: "API conventions" } });
    fireEvent.click(screen.getByTestId("button-save-skill"));
    await waitFor(() => expect(db.custom[0]!.name).toBe("API conventions"));

    fireEvent.click(await screen.findByTestId(`button-delete-skill-${id}`));
    fireEvent.click(await screen.findByTestId("button-confirm"));
    await waitFor(() => expect(db.custom).toHaveLength(0));
    expect(db.enabled).not.toContain(id);
    expect(await screen.findByTestId("empty-custom-skills")).toBeInTheDocument();
  });

  it("reverts and explains when saving fails", async () => {
    skillsServer({}, { failPut: true });
    renderApp("/app/skills");
    const sw = await screen.findByTestId("switch-skill-mobile-ui");
    await waitFor(() => expect(screen.getByTestId("text-skills-storage")).toBeInTheDocument());
    fireEvent.click(sw);
    expect(await screen.findByTestId("text-skills-error")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("switch-skill-mobile-ui")).toHaveAttribute("aria-checked", "false"));
  });
});

describe("Chat plus menu", () => {
  it("opens from the plus button, switches to skills, toggles one and links to the Skills page", async () => {
    const { db } = skillsServer({ custom: [{ id: "u_abcdef12", name: "Team style", description: "", instructions: "x", createdAt: "", updatedAt: "" }] });
    const { loc } = renderApp(`${SAMPLE_PATH}/ai`);
    const plus = await screen.findByTestId("button-chat-plus", {}, { timeout: 5000 });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    const menu = await screen.findByTestId("chat-tools-menu");
    expect(within(menu).getByTestId("button-agent-upload")).toBeInTheDocument();
    fireEvent.click(within(menu).getByTestId("button-chat-skills"));
    const list = await screen.findByTestId("chat-skills-list");
    expect(list).toHaveTextContent("Team style");
    fireEvent.click(within(list).getByTestId("skill-toggle-u_abcdef12"));
    await waitFor(() => expect(db.enabled).toContain("u_abcdef12"));
    fireEvent.click(screen.getByTestId("link-add-skills"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/app/skills"));
  });
});

describe("New repository", () => {
  it("creates a repo from Projects and opens it", async () => {
    const posts: unknown[] = [];
    mockGitHub({
      extra: (url, init) => {
        if (url.pathname === "/api/github/repos" && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { name: string; private: boolean };
          posts.push(body);
          if (body.name === "taken") return json({ error: { code: "REPO_EXISTS", message: "exists" } }, 409);
          return json({ repo: { ...SAMPLE_REPO, name: body.name, fullName: `octo/${body.name}` } }, 201);
        }
        return undefined;
      },
    });
    const { loc } = renderApp("/app/projects");
    fireEvent.click(await screen.findByTestId("button-new-repo"));
    const input = await screen.findByTestId("input-repo-name");
    fireEvent.change(input, { target: { value: "bad name!" } });
    expect(await screen.findByText(/Use only letters/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "taken" } });
    fireEvent.click(screen.getByTestId("button-create-repo"));
    expect(await screen.findByTestId("text-new-repo-error")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "fresh-app" } });
    fireEvent.click(screen.getByTestId("button-create-repo"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/app/projects/octo/fresh-app/overview"));
    expect(posts.at(-1)).toMatchObject({ name: "fresh-app", private: false });
  });

  it("validates names like GitHub does", () => {
    expect(repoNameError("ok-name_1.x")).toBeNull();
    expect(repoNameError("no spaces!")).toMatch(/letters/);
    expect(repoNameError("..")).toMatch(/isn't allowed/);
    expect(repoNameError("a".repeat(101))).toMatch(/100/);
  });
});

describe("Command palette", () => {
  it("ranks prefix over substring over fuzzy", () => {
    expect(score("Projects", "pro")).toBeGreaterThan(score("New project", "pro"));
    expect(score("New project", "pro")).toBeGreaterThan(score("approve", "pro"));
    expect(score("Settings", "stg")).toBe(1);
    expect(score("Settings", "xyz")).toBe(0);
  });

  it("opens with Ctrl+K, filters and navigates", async () => {
    mockGitHub();
    const { loc } = renderApp("/app");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByTestId("input-palette");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "skills" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/app/skills"));
    expect(screen.queryByTestId("command-palette")).toBeNull();
  });
});
