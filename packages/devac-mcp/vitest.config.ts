import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    forceExit: true, // Ensure clean exit even with pending async ops
    environment: "node",
    include: ["src/**/*.test.ts", "__tests__/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 10000,
    // Retry flaky tests once to handle transient I/O issues
    retry: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts", "src/**/__tests__/**"],
      // Coverage thresholds - current baseline, target: 70%
      // Run `pnpm test:coverage` to see current coverage
      thresholds: {
        statements: 15, // Current: ~18%, Target: 70%
        branches: 75, // Current: ~82%, Target: 80%
        functions: 20, // Current: ~27%, Target: 70%
        lines: 15, // Current: ~18%, Target: 70%
      },
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
