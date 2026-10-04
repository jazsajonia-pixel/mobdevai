import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests on mobile browsers against the real app + functions, with GitHub and the AI
 * provider replaced by local mocks (no credentials needed). Uses its own ports so it never
 * collides with a running dev setup.
 *
 *   npm run e2e:install   # once: downloads Chromium + WebKit
 *   npm run e2e           # all projects (WebKit is skipped automatically where unsupported)
 */
const P = { web: 5273, api: 8887, gh: 8890, ai: 8891 };
const reuse = !process.env.CI;
const skipWebkit = process.env.E2E_SKIP_WEBKIT === "1";

export default defineConfig({
  testDir: "e2e",
  // The mock GitHub server is stateful (branches, commits, PRs): run serially.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${P.web}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
    // iPhone viewport/touch/UA on Chromium — runs everywhere.
    { name: "iphone-viewport", use: { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" } },
    ...(skipWebkit ? [] : [{ name: "iphone-safari", use: { ...devices["iPhone 14"] } }]),
  ],
  webServer: [
    { command: "npx tsx scripts/mock-github.ts", port: P.gh, env: { MOCK_GITHUB_PORT: String(P.gh) }, reuseExistingServer: reuse },
    { command: "npx tsx scripts/mock-ai.ts", port: P.ai, env: { MOCK_AI_PORT: String(P.ai) }, reuseExistingServer: reuse },
    {
      command: "npx tsx scripts/dev-api.ts",
      port: P.api,
      reuseExistingServer: reuse,
      env: {
        DEV_API_PORT: String(P.api),
        GITHUB_CLIENT_ID: "mock-id",
        GITHUB_CLIENT_SECRET: "mock-secret-value",
        SESSION_SECRET: "e2e-session-secret-0123456789abcdefghijkl",
        ENCRYPTION_KEY: "e2e-encryption-key-0123456789abcdefghijklmn",
        GITHUB_API_URL: `http://127.0.0.1:${P.gh}/api`,
        GITHUB_WEB_URL: `http://127.0.0.1:${P.gh}`,
        AI_ALLOW_PRIVATE_BASE_URLS: "true",
        RATE_LIMIT_STORE: "memory",
        LOG_LEVEL: "warn",
      },
    },
    {
      command: `npx vite --port ${P.web} --strictPort --host 127.0.0.1`,
      port: P.web,
      reuseExistingServer: reuse,
      env: { DEV_API_PORT: String(P.api), VITE_GITHUB_WEB_URL: `http://127.0.0.1:${P.gh}` },
    },
  ],
});

export const E2E_PORTS = P;
