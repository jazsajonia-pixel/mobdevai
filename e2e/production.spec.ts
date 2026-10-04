import { expect, test } from "@playwright/test";
import { appendToEditor, gotoTab, openRepo, signInWithGitHub } from "./helpers";

test.describe("production behaviour", () => {
  test("health reports version + readiness, never configuration values", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(res.headers()["x-request-id"]).toMatch(/^[\w-]+$/);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, phase: 8, ready: true });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    const text = JSON.stringify(body);
    expect(text).not.toContain("e2e-session-secret");
    expect(text).not.toContain("mock-secret-value");
  });

  test("cross-site writes are refused and errors carry a request id", async ({ request, baseURL }) => {
    const res = await request.post("/api/github/repos/octo-dev/hello-mobile/commit", { headers: { origin: "https://evil.example" }, data: {} });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.requestId).toBe(res.headers()["x-request-id"]);
    const anon = await request.get("/api/github/repos", { headers: { origin: baseURL! } });
    expect([401, 403]).toContain(anon.status());
  });

  test("rate limits answer 429 with Retry-After", async ({ request, baseURL }) => {
    const report = { kind: "error", message: "e2e rate limit probe", route: "/", release: "e2e" };
    let last = 0;
    let retryAfter: string | undefined;
    for (let i = 0; i < 35 && last !== 429; i++) {
      const res = await request.post("/api/client-errors", { headers: { origin: baseURL! }, data: report });
      last = res.status();
      retryAfter = res.headers()["retry-after"];
    }
    expect(last).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  test("offline: commit is blocked with an explanation, drafts stay, and it recovers online", async ({ page, context }) => {
    await signInWithGitHub(page);
    await openRepo(page);
    await page.getByText("index.html").first().click();
    await appendToEditor(page, "\n<!-- offline edit -->\n");
    await page.getByRole("button", { name: "Save" }).click();
    await gotoTab(page, "Git");
    await expect(page.getByTestId("ship-panel")).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByTestId("text-ship-blocked")).toContainText(/offline/i);
    await expect(page.getByTestId("button-commit")).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Include index.html in the commit" })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByTestId("button-commit")).toBeEnabled();
  });
});
