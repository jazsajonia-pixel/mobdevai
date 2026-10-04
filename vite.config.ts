/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built bundle works from any host path (Netlify root or a preview sub-path).
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    // `npm run dev:api` serves Netlify Functions locally on :8787. (`netlify dev` intercepts /api itself.)
    proxy: { "/api": { target: "http://127.0.0.1:8787", xfwd: true } },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "netlify/**/*.test.ts"],
  },
});
