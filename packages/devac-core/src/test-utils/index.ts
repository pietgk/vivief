/**
 * Test Utilities - Export Barrel
 *
 * Provides test utilities for creating seed data using Zod schemas.
 */

// Seed factory exports
export {
  createTestSeeds,
  cleanupTestSeeds,
  createTestPool,
  type TestFixture,
  type CreateSeedsResult,
  type CreateSeedsOptions,
} from "./seed-factory.js";

// Pre-defined fixtures
export {
  SIMPLE_CALL_CHAIN,
  CLASS_HIERARCHY,
  IMPORT_CHAIN,
  CIRCULAR_DEPS,
  DEEP_NESTING,
  EXTERNAL_DEPS,
  EMPTY_FIXTURE,
  SINGLE_NODE,
  INTERFACE_IMPL,
  generateLargeFixture,
} from "./fixtures.js";

// Re-export schema types for convenience
export type { TestNode, TestEdge, TestExternalRef } from "../storage/schemas/index.js";

export {
  createNodeFromTestData,
  createEdgeFromTestData,
  createExternalRefFromTestData,
} from "../storage/schemas/index.js";
