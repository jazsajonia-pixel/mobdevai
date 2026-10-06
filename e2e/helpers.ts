import { expect, type Page } from "@playwright/test";

/** Sign in through the mock GitHub OAuth flow and land on the project list. */
export async function signInWithGitHub(page: Page): Promise<void> {
  await page.goto("/#/signin");
  await page.getByTestId("button-github-signin").click();
  await expect(page.getByText("octo-dev/hello-mobile")).toBeVisible();
}

export async function openRepo(page: Page, name = "hello-mobile"): Promise<void> {
  await page.getByText(`octo-dev/${name}`).click();
  await expect(page.getByTestId("text-repo-name")).toContainText(name);
}

/** Type at the end of the open CodeMirror document. */
export async function appendToEditor(page: Page, text: string): Promise<void> {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

/** The page must never scroll sideways on a phone. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export function uniqueBranch(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Dismiss the on-screen keyboard (blur the editor) and switch workspace tab (via the drawer on phones). */
export async function gotoTab(page: Page, tab: "Files" | "AI" | "Preview" | "Git"): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const toggle = page.getByTestId("button-toggle-workspace-sidebar");
  await expect(async () => {
    const drawer = page.locator('aside[data-state="closed"]');
    if ((await drawer.count()) && (await toggle.isVisible())) await toggle.click();
    await expect(nav).toBeInViewport({ timeout: 800 });
  }).toPass({ timeout: 5_000 });
  await nav.getByTestId(`tab-${tab.toLowerCase()}`).click();
  if (tab !== "Files") await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`));
}
