import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";
import type { Session } from "./types/session";
import type { ProvidersResponse, PublicProvider } from "./types/ai";

const githubSession: Session = {
  mode: "github",
  user: { id: 1, login: "octo", name: "Octo Cat", avatarUrl: "https://avatars.example/1" },
  scopes: ["read:user", "public_repo"],
  includePrivate: false,
  expiresAt: "2026-10-11T00:00:00Z",
};

const KEY = "sk-proj-CLIENTKEY_secret_0123456789ABCD";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Stateful fake of the /api/ai endpoints. */
function fakeServer() {
  const providers: PublicProvider[] = [];
  let defaultId: string | null = null;
  const bodies: unknown[] = [];
  const resp = (): ProvidersResponse => ({
    storage: "session",
    storageNote: "Session-only: keys are kept encrypted in an HTTP-only cookie on this device.",
    maxProviders: 6,
    providers: providers.map((p) => ({ ...p, isDefault: p.id === defaultId })),
    defaultId,
  });
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    bodies.push(body);
    if (url.pathname === "/api/ai/providers" && method === "GET") return json(resp());
    if (url.pathname === "/api/ai/providers" && method === "POST") {
      const id = `p_${providers.length + 1}abcdefgh`;
      providers.push({ id, kind: body.kind, label: body.label ?? "OpenAI", model: body.model, baseUrl: body.baseUrl ?? null, enabled: true, isDefault: false, keyHint: "sk-…ABCD", source: "user", lastTest: null, updatedAt: new Date().toISOString() });
      if (!defaultId || body.makeDefault) defaultId = id;
      return json(resp(), 201);
    }
    const m = /^\/api\/ai\/providers\/(.+)$/.exec(url.pathname);
    if (m) {
      const i = providers.findIndex((p) => p.id === m[1]);
      if (method === "DELETE") {
        providers.splice(i, 1);
        if (defaultId === m[1]) defaultId = providers[0]?.id ?? null;
      } else {
        Object.assign(providers[i]!, { ...(body.label ? { label: body.label } : {}), ...(body.model ? { model: body.model } : {}), ...(body.enabled !== undefined ? { enabled: body.enabled } : {}) });
        if (body.makeDefault) defaultId = m[1]!;
      }
      return json(resp());
    }
    if (url.pathname === "/api/ai/test-provider") {
      if (body.apiKey === "sk-bad-key-000000") return json({ error: { code: "AI_INVALID_KEY", message: "OpenAI rejected the API key." } }, 400);
      return json({ ok: true, latencyMs: 321, model: body.model ?? "Chrono 1.3", models: ["Chrono 1.2", "Chrono 1.3", "Chrono 1.1"], modelListed: true });
    }
    return json({ ok: true, service: "x", phase: 3, capabilities: {} });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { bodies, fetchMock };
}

function renderAt(path: string, session: Session = githubSession) {
  render(
    <ThemeProvider>
      <SessionProvider initial={session}>
        <Router hook={memoryLocation({ path }).hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AI providers settings", () => {
  it("adds a provider after a successful test; the key never reaches the DOM or storage", async () => {
    const { bodies } = fakeServer();
    renderAt("/app/settings/ai");
    expect(await screen.findByTestId("notice-storage")).toHaveTextContent("Session-only");
    fireEvent.click(screen.getByTestId("button-add-first-provider"));

    const key = await screen.findByTestId("input-api-key");
    expect(key).toHaveAttribute("type", "password");
    expect(key).toHaveAttribute("autocomplete", "new-password");

    // Validation before any request.
    fireEvent.click(screen.getByTestId("button-save-provider"));
    expect(await screen.findByTestId("text-form-error")).toHaveTextContent("Paste an API key");

    fireEvent.change(key, { target: { value: "sk-bad-key-000000" } });
    fireEvent.click(screen.getByTestId("button-test-connection"));
    expect(await screen.findByTestId("test-result-error")).toHaveTextContent("The provider rejected the API key");

    fireEvent.change(key, { target: { value: KEY } });
    fireEvent.click(screen.getByTestId("button-test-connection"));
    expect(await screen.findByTestId("test-result-ok")).toHaveTextContent("Connected · 321 ms");
    // Fetched models become chips.
    expect(screen.getByRole("button", { name: "Chrono 1.1" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-save-provider"));
    const card = await screen.findByTestId("card-provider-p_1abcdefgh");
    expect(within(card).getByTestId("text-key-hint")).toHaveTextContent("sk-…ABCD");
    expect(within(card).getByTestId("badge-default")).toBeInTheDocument();

    expect(bodies).toContainEqual(expect.objectContaining({ kind: "openai", model: "Chrono 1.3", apiKey: KEY }));
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain("CLIENTKEY");
  });

  it("adds an OpenAI-compatible provider (base URL required), switches default, disables and removes", async () => {
    const { bodies } = fakeServer();
    renderAt("/app/settings/ai");
    fireEvent.click(await screen.findByTestId("button-add-first-provider"));
    fireEvent.change(await screen.findByTestId("input-api-key"), { target: { value: KEY } });
    fireEvent.click(screen.getByTestId("button-save-provider"));
    await screen.findByTestId("card-provider-p_1abcdefgh");

    fireEvent.click(screen.getByTestId("button-add-provider"));
    fireEvent.click(await screen.findByTestId("radio-kind-openai-compatible"));
    fireEvent.change(screen.getByTestId("input-api-key"), { target: { value: "gsk_compat_key_123456" } });
    fireEvent.change(screen.getByTestId("input-model"), { target: { value: "llama-4" } });
    fireEvent.click(screen.getByTestId("button-save-provider"));
    expect(await screen.findByTestId("text-form-error")).toHaveTextContent("base URL");
    fireEvent.change(screen.getByTestId("input-base-url"), { target: { value: "https://api.example.com/v1" } });
    fireEvent.click(screen.getByTestId("switch-default"));
    fireEvent.click(screen.getByTestId("button-save-provider"));
    const second = await screen.findByTestId("card-provider-p_2abcdefgh");
    expect(within(second).getByTestId("badge-default")).toBeInTheDocument();
    expect(bodies).toContainEqual(expect.objectContaining({ kind: "openai-compatible", baseUrl: "https://api.example.com/v1", makeDefault: true }));

    const first = screen.getByTestId("card-provider-p_1abcdefgh");
    fireEvent.click(within(first).getByTestId("button-make-default"));
    await waitFor(() => expect(within(screen.getByTestId("card-provider-p_1abcdefgh")).getByTestId("badge-default")).toBeInTheDocument());

    fireEvent.click(within(second).getByTestId("switch-provider-enabled"));
    await waitFor(() => expect(within(screen.getByTestId("card-provider-p_2abcdefgh")).getByText("Disabled")).toBeInTheDocument());

    fireEvent.click(within(screen.getByTestId("card-provider-p_2abcdefgh")).getByTestId("button-remove-provider"));
    fireEvent.click(await screen.findByTestId("button-confirm"));
    await waitFor(() => expect(screen.queryByTestId("card-provider-p_2abcdefgh")).not.toBeInTheDocument());
  });

  it("edits without re-entering the key", async () => {
    const { bodies } = fakeServer();
    renderAt("/app/settings/ai");
    fireEvent.click(await screen.findByTestId("button-add-first-provider"));
    fireEvent.change(await screen.findByTestId("input-api-key"), { target: { value: KEY } });
    fireEvent.click(screen.getByTestId("button-save-provider"));
    fireEvent.click(within(await screen.findByTestId("card-provider-p_1abcdefgh")).getByTestId("button-edit-provider"));
    const key = await screen.findByTestId("input-api-key");
    expect(key).toHaveValue("");
    fireEvent.change(screen.getByTestId("input-model"), { target: { value: "Chrono 1.2" } });
    fireEvent.click(screen.getByTestId("button-test-connection"));
    await screen.findByTestId("test-result-ok");
    expect(bodies).toContainEqual({ id: "p_1abcdefgh", model: "Chrono 1.2" });
    fireEvent.click(screen.getByTestId("button-save-provider"));
    await waitFor(() => expect(screen.getByTestId("card-provider-p_1abcdefgh")).toHaveTextContent("Chrono 1.2"));
    const patch = bodies.find((b) => b && typeof b === "object" && "model" in b && (b as { model: string }).model === "Chrono 1.2" && !("id" in b));
    expect(patch).not.toHaveProperty("apiKey");
  });

  it("explains that demo mode needs GitHub sign-in", async () => {
    fakeServer();
    renderAt("/app/settings/ai", { mode: "demo", startedAt: new Date().toISOString() });
    expect(await screen.findByText("Sign in to add AI providers")).toBeInTheDocument();
  });

  it("shows the default provider on the AI page", async () => {
    fakeServer();
    renderAt("/app/ai");
    expect(await screen.findByTestId("text-active-provider")).toHaveTextContent("Add an OpenAI");
  });
});
