import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Retry flaky tests once to handle transient I/O issues
    retry: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts", "src/**/__tests__/**"],
      reportOnFailure: true,
    },
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
