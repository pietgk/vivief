import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    forceExit: true, // Ensure clean exit even with pending async ops
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts", "src/**/__tests__/**"],
      // Coverage thresholds - current baseline, target: 70%
      // Run `pnpm test:coverage` to see current coverage
      thresholds: {
        statements: 20, // Current: ~22%, Target: 70%
        branches: 60, // Current: ~63%, Target: 80%
        functions: 25, // Current: ~30%, Target: 70%
        lines: 20, // Current: ~22%, Target: 70%
      },
      reportOnFailure: true,
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 10000,
    // Retry flaky tests once to handle transient I/O issues
    retry: 1,
    // Test isolation settings to prevent flakiness
    setupFiles: ["./vitest.setup.ts"],
    // Use forks with singleFork for stability - prevents tinypool channel closed errors
    // CLI tests are heavy integration tests with DuckDB, file I/O, and subprocesses
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Run test files sequentially for stability
        isolate: true,
      },
    },
    // Limit concurrency within test files
    maxConcurrency: 5,
    sequence: {
      shuffle: true,
    },
  },
});
