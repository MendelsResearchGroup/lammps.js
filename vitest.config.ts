import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    hookTimeout: 120_000,
    testTimeout: 120_000,
    include: ["tests/**/*.spec.ts"]
  }
});
