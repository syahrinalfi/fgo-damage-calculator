import { defineConfig } from "vitest/config";

/** Live-API smoke tests only — real network calls to api.atlasacademy.io. */
export default defineConfig({
  test: {
    include: ["**/*.live.test.ts"],
  },
});
