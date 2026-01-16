import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    forceExit: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: ["__tests__/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/version.ts"],
      reportOnFailure: true,
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 10000,
    retry: 1,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    maxConcurrency: 5,
  },
});
