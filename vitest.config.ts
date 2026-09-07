import { defineConfig } from "vitest/config";

/**
 * Default test run: fast, deterministic, no network. Live-API smoke tests
 * (*.live.test.ts) hit the real Atlas Academy API and are excluded here —
 * run them explicitly via `pnpm test:live`.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
