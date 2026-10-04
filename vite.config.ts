/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const apiPort = process.env.DEV_API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative base so the built bundle works from any host path (Netlify root or a preview sub-path).
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    // `npm run dev:api` serves Netlify Functions locally on :8787 (DEV_API_PORT). (`netlify dev` intercepts /api itself.)
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, xfwd: true } },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "netlify/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
