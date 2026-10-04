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
    // `netlify dev` proxies /api/* to functions; plain `vite` dev shows the backend as offline.
    port: 5173,
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
