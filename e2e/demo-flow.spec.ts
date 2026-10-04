import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, gotoTab } from "./helpers";

test("demo: AI agent plan → approve → accept → preview → simulated commit → history", async ({ page }) => {
  await page.goto("/");
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("button-try-demo").first().click();
  await expect(page.getByTestId("banner-demo")).toBeVisible();

  await gotoTab(page, "AI");
  await page.getByTestId("input-agent-message").fill("Add a \"Clear completed\" button");
  await page.getByTestId("button-send-agent").click();
  await expect(page.getByTestId("card-plan")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("button-approve-plan").click();
  await expect(page.getByTestId("card-proposal")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("button-review-changes").first().click();
  await page.getByTestId("button-accept-all").click();
  const confirm = page.getByTestId("confirm-apply");
  if (await confirm.isVisible().catch(() => false)) await page.getByTestId("button-confirm").click();

  await gotoTab(page, "Preview");
  await expect(page.getByTestId("preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preview-status")).toBeVisible();
  // The accepted change is live in the preview (React app compiled in the browser).
  await expect(page.frameLocator('[data-testid="preview-frame"]').locator("body")).toContainText(/task/i, { timeout: 30_000 });

  await gotoTab(page, "Git");
  await expect(page.getByTestId("ship-panel")).toBeVisible();
  await page.getByTestId("button-commit").click();
  await page.getByTestId("button-confirm").click();
  await expect(page.getByTestId("ship-result")).toBeVisible();
  await expect(page.getByTestId("ship-result")).toContainText(/demo|simulat/i);

  await page.goto("/#/app/ai/history");
  await expect(page.getByTestId("list-history")).toContainText("Clear completed");
  await expectNoHorizontalOverflow(page);
});
