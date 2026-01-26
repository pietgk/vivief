/**
 * Edge Schema - SINGLE SOURCE OF TRUTH
 *
 * All TypeScript types, SQL DDL, and Parquet schemas are derived from this Zod schema.
 * Based on DevAC v2.0 spec Section 4.2
 */

import { z } from "zod";

/**
 * Edge types representing relationships between nodes
 */
export const EdgeTypeSchema = z.enum([
  "CONTAINS", // Parent contains child (class contains method)
  "CALLS", // Function calls another function
  "IMPORTS", // Module imports from another
  "EXTENDS", // Class/interface extends another
  "IMPLEMENTS", // Class implements interface
  "RETURNS", // Function returns type
  "PARAMETER_OF", // Parameter belongs to function
  "TYPE_OF", // Variable has type
  "DECORATES", // Decorator applied to symbol
  "OVERRIDES", // Method overrides parent method
  "REFERENCES", // General reference to symbol
  "EXPORTS", // Module exports symbol
  "RE_EXPORTS", // Module re-exports from another
  "INSTANTIATES", // Creates instance of class
  "USES_TYPE", // Uses type in signature
  "ACCESSES", // Accesses property/field
  "THROWS", // Function throws error type
  "AWAITS", // Awaits promise/async call
  "YIELDS", // Generator yields value
  "RENDERS", // JSX: Component renders another component as child
  "PASSES_PROPS", // JSX: Component passes props to child component
]);

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Edge schema - the single source of truth for the edges table
 *
 * IMPORTANT: All schema changes must be made here. TypeScript types,
 * SQL CREATE TABLE statements, and test fixtures are derived from this schema.
 */
export const EdgeSchema = z.object({
  /** Source node entity_id */
  source_entity_id: z.string().describe("Source node entity_id"),

  /** Target node entity_id */
  target_entity_id: z.string().describe("Target node entity_id"),

  /** Type of relationship */
  edge_type: EdgeTypeSchema.describe("Type of relationship"),

  /** Source file where this edge originates */
  source_file_path: z.string().describe("Source file where this edge originates"),

  /** Line number of reference in source */
  source_line: z.number().int().min(1).describe("Line number of reference in source"),

  /** Column of reference in source */
  source_column: z.number().int().min(0).describe("Column of reference in source"),

  /** Additional properties (e.g., call arguments, import alias) */
  properties: z.record(z.unknown()).default({}).describe("Additional properties"),

  /** SHA-256 hash of source file content */
  source_file_hash: z.string().describe("SHA-256 hash of source file content"),

  /** Branch name (for delta storage) */
  branch: z.string().default("base").describe("Branch name"),

  /** Is this edge deleted in branch partition? */
  is_deleted: z.boolean().default(false).describe("Is this edge deleted?"),

  /** Timestamp of last update */
  updated_at: z.string().describe("Timestamp of last update"),
});

/** TypeScript type derived from Zod schema */
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * Partial edge schema for test data - only required fields
 */
export const TestEdgeSchema = EdgeSchema.pick({
  source_entity_id: true,
  target_entity_id: true,
  edge_type: true,
}).extend({
  source_file_path: z.string().optional(),
  source_line: z.number().int().min(1).optional(),
  source_column: z.number().int().min(0).optional(),
  properties: z.record(z.unknown()).optional(),
  source_file_hash: z.string().optional(),
  branch: z.string().optional(),
  is_deleted: z.boolean().optional(),
  updated_at: z.string().optional(),
});

export type TestEdge = z.infer<typeof TestEdgeSchema>;

/**
 * Create a full Edge from partial test data
 * Fills in defaults for missing fields
 */
export function createEdgeFromTestData(testEdge: TestEdge): Edge {
  return {
    source_entity_id: testEdge.source_entity_id,
    target_entity_id: testEdge.target_entity_id,
    edge_type: testEdge.edge_type,
    source_file_path: testEdge.source_file_path ?? "src/test.ts",
    source_line: testEdge.source_line ?? 1,
    source_column: testEdge.source_column ?? 0,
    properties: testEdge.properties ?? {},
    source_file_hash: testEdge.source_file_hash ?? "test-hash",
    branch: testEdge.branch ?? "base",
    is_deleted: testEdge.is_deleted ?? false,
    updated_at: testEdge.updated_at ?? new Date().toISOString(),
  };
}
