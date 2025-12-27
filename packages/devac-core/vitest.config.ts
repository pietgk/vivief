import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts", "src/**/__tests__/**"],
      reportOnFailure: true,
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    // Test isolation settings to prevent flakiness
    setupFiles: ["./vitest.setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    sequence: {
      shuffle: true,
    },
  },
});
