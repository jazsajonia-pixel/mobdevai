/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the GitHub web host (only set for GitHub Enterprise or the local mock). */
  readonly VITE_GITHUB_WEB_URL?: string;
}
