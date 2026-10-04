import { expect, test } from "@playwright/test";
import { E2E_PORTS } from "../playwright.config";
import { expectNoHorizontalOverflow, gotoTab, openRepo, signInWithGitHub } from "./helpers";

test("add an OpenAI-compatible provider, test it, then run the agent on a GitHub repo", async ({ page }) => {
  await signInWithGitHub(page);
  await page.goto("/#/app/settings/ai");
  await page.getByTestId("button-add-first-provider").or(page.getByTestId("button-add-provider")).first().click();
  await page.getByTestId("radio-kind-openai-compatible").click();
  await page.getByTestId("input-base-url").fill(`http://127.0.0.1:${E2E_PORTS.ai}/v1`);
  await page.getByTestId("input-api-key").fill("sk-mock-e2e-key-123456");
  await page.getByTestId("input-model").fill("mock-coder-1");
  await page.getByTestId("input-label").fill("Mock coder");
  await page.getByTestId("button-test-connection").click();
  await expect(page.getByTestId("test-result-ok")).toBeVisible();
  await page.getByTestId("button-save-provider").click();
  const list = page.getByTestId("list-providers");
  await expect(list).toContainText("Mock coder");
  // Only a masked hint ever comes back from the server.
  await expect(page.locator("body")).not.toContainText("sk-mock-e2e-key-123456");
  await expectNoHorizontalOverflow(page);

  await page.goto("/#/app/projects");
  await openRepo(page);
  await gotoTab(page, "AI");
  await expect(page.getByTestId("link-agent-provider")).toContainText(/Mock coder|mock-coder-1/);
  await page.getByTestId("input-agent-message").fill("Improve the README");
  await page.getByTestId("button-send-agent").click();
  await expect(page.getByTestId("card-plan")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("button-approve-plan").click();
  await expect(page.getByTestId("card-proposal")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("button-review-changes").first().click();
  await expect(page.locator("body")).toContainText("README.md");
});
