import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    forceExit: true, // Ensure clean exit even with pending async ops
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 10000,
    // Retry flaky tests once to handle transient I/O issues
    retry: 1,
    // Use forks for stability - prevents tinypool channel closed errors
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
  },
});
