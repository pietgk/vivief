/**
 * Global Test Setup for devac-cli
 *
 * This file ensures proper cleanup of shared resources between tests
 * to prevent flaky test behavior caused by state leakage.
 *
 * Key resources managed:
 * - DuckDB connection pool (singleton from @pietgk/devac-core)
 * - ts-morph Project caches
 * - Semantic resolver factory singleton
 */

import {
  TypeScriptSemanticResolver,
  resetSemanticResolverFactory,
  shutdownDefaultPool,
} from "@pietgk/devac-core";
import { afterAll, afterEach, beforeEach } from "vitest";

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
