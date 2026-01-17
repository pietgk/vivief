import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    forceExit: true,
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    testTimeout: 120000, // 2 minutes for real browser operations
    hookTimeout: 60000,
    teardownTimeout: 30000,
    retry: 0, // No retries for integration tests - failures should be investigated
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially to avoid browser conflicts
        isolate: true,
      },
    },
    maxConcurrency: 1, // One test at a time for browser stability
  },
});
