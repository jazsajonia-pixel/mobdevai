import { expect, test } from "@playwright/test";
import { appendToEditor, gotoTab, expectNoHorizontalOverflow, openRepo, signInWithGitHub, uniqueBranch } from "./helpers";

test("sign in → edit → commit to a new branch → open PR → dashboard shows it", async ({ page }) => {
  await signInWithGitHub(page);
  await expectNoHorizontalOverflow(page);
  await openRepo(page);

  await page.getByText("README.md").first().click();
  await expect(page.locator(".cm-content")).toContainText("hello-mobile");
  await appendToEditor(page, "\nEdited from a phone.\n");

  await page.getByRole("button", { name: "Save" }).click();
  await gotoTab(page, "Git");
  await expect(page.getByTestId("ship-panel")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Include README.md in the commit" })).toBeChecked();

  const branch = uniqueBranch("e2e/readme");
  await page.getByTestId("radio-new-branch").check();
  await page.getByTestId("input-branch-name").fill(branch);
  await page.getByTestId("input-commit-message").fill("docs: edit README from e2e");
  const openPr = page.getByTestId("switch-open-pr");
  if ((await openPr.getAttribute("aria-checked")) !== "true") await openPr.click();
  await expect(page.getByTestId("ship-action-bar")).toBeInViewport();
  await page.getByTestId("button-commit").click();
  const summary = page.getByTestId("ship-summary");
  await expect(summary).toContainText(branch);
  await expect(summary).toContainText("README.md");
  await page.getByTestId("button-confirm").click();

  const result = page.getByTestId("ship-result");
  await expect(result).toBeVisible();
  await expect(page.getByTestId("link-pull-request")).toBeVisible();
  await expect(page.getByTestId("link-commit")).toBeVisible();

  // Dashboard reflects the new branch, commit and PR.
  await page.getByTestId("link-overview").click();
  const dash = page.getByTestId("project-dashboard");
  await expect(dash).toBeVisible();
  await expect(page.getByTestId("text-branch")).toContainText(branch);
  await expect(dash.getByTestId("list-commits")).toContainText("docs: edit README from e2e");
  await expect(dash.getByTestId("pr-status")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("the default branch is never overwritten silently", async ({ page }) => {
  await signInWithGitHub(page);
  await openRepo(page);
  await page.getByText("app.js").first().click();
  await appendToEditor(page, "\n// touch\n");
  await page.getByRole("button", { name: "Save" }).click();
  await gotoTab(page, "Git");
  await expect(page.getByTestId("ship-panel")).toBeVisible();
  // Committing straight to the default branch always asks first — cancelling leaves main untouched.
  await page.getByTestId("radio-current-branch").check();
  await page.getByTestId("input-commit-message").fill("should not land on main");
  await page.getByTestId("button-commit").click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("main");
  await dialog.getByRole("button", { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("ship-result")).toHaveCount(0);
  await expect(page.getByTestId("list-commits")).not.toContainText("should not land on main");
});
