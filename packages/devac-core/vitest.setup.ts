/**
 * Global Test Setup for devac-core
 *
 * This file ensures proper cleanup of shared resources between tests
 * to prevent flaky test behavior caused by state leakage.
 *
 * Key resources managed:
 * - DuckDB connection pool (singleton)
 * - ts-morph Project caches
 * - Semantic resolver factory singleton
 */

import { afterAll, afterEach, beforeEach } from "vitest";
import { resetSemanticResolverFactory } from "./src/semantic/index.js";
import { TypeScriptSemanticResolver } from "./src/semantic/typescript-semantic.js";
import { shutdownDefaultPool } from "./src/storage/duckdb-pool.js";

// Reset all shared state before each test to ensure clean state
beforeEach(async () => {
  await shutdownDefaultPool();
  TypeScriptSemanticResolver.clearAllCaches();
  resetSemanticResolverFactory();
});

// Ensure cleanup after each test
afterEach(async () => {
  await shutdownDefaultPool();
  TypeScriptSemanticResolver.clearAllCaches();
  resetSemanticResolverFactory();
});

// Final cleanup when test suite completes
afterAll(async () => {
  await shutdownDefaultPool();
  TypeScriptSemanticResolver.clearAllCaches();
  resetSemanticResolverFactory();
});
