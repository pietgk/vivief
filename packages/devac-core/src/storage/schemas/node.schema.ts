/**
 * Node Schema - SINGLE SOURCE OF TRUTH
 *
 * All TypeScript types, SQL DDL, and Parquet schemas are derived from this Zod schema.
 * Based on DevAC v2.0 spec Section 4.1
 */

import { z } from "zod";

/**
 * Node kinds supported by the analyzer
 */
export const NodeKindSchema = z.enum([
  "function",
  "class",
  "method",
  "property",
  "variable",
  "constant",
  "interface",
  "type",
  "enum",
  "enum_member",
  "namespace",
  "module",
  "parameter",
  "decorator",
  "jsx_component",
  "html_element",
  "hook",
  "unknown",
]);

export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * Visibility/access modifiers
 */
export const VisibilitySchema = z.enum(["public", "private", "protected", "internal"]);

export type Visibility = z.infer<typeof VisibilitySchema>;

/**
 * Node schema - the single source of truth for the nodes table
 *
 * IMPORTANT: All schema changes must be made here. TypeScript types,
 * SQL CREATE TABLE statements, and test fixtures are derived from this schema.
 */
export const NodeSchema = z.object({
  /** Globally unique identifier: {repo}:{package_path}:{kind}:{scope_hash} */
  entity_id: z.string().describe("Globally unique identifier"),

  /** Display name of the symbol */
  name: z.string().describe("Display name of the symbol"),

  /** Fully qualified name including scope */
  qualified_name: z.string().describe("Fully qualified name including scope"),

  /** Type of code element */
  kind: NodeKindSchema.describe("Type of code element"),

  /** Relative path from package root */
  file_path: z.string().describe("Relative path from package root"),

  /** 1-based line number where symbol starts */
  start_line: z.number().int().min(1).describe("1-based line number where symbol starts"),

  /** 1-based line number where symbol ends */
  end_line: z.number().int().min(1).describe("1-based line number where symbol ends"),

  /** 0-based column offset */
  start_column: z.number().int().min(0).describe("0-based column offset"),

  /** 0-based column offset */
  end_column: z.number().int().min(0).describe("0-based column offset"),

  /** Is this symbol exported from its module? */
  is_exported: z.boolean().default(false).describe("Is this symbol exported from its module?"),

  /** Is this a default export? */
  is_default_export: z.boolean().default(false).describe("Is this a default export?"),

  /** Access modifier */
  visibility: VisibilitySchema.default("public").describe("Access modifier"),

  /** Is this an async function/method? */
  is_async: z.boolean().default(false).describe("Is this an async function/method?"),

  /** Is this a generator function? */
  is_generator: z.boolean().default(false).describe("Is this a generator function?"),

  /** Is this a static class member? */
  is_static: z.boolean().default(false).describe("Is this a static class member?"),

  /** Is this an abstract class/method? */
  is_abstract: z.boolean().default(false).describe("Is this an abstract class/method?"),

  /** Type signature (for functions, variables with explicit types) */
  type_signature: z.string().nullable().default(null).describe("Type signature"),

  /** JSDoc/docstring content */
  documentation: z.string().nullable().default(null).describe("JSDoc/docstring content"),

  /** Decorator names applied to this symbol */
  decorators: z.array(z.string()).default([]).describe("Decorator names applied to this symbol"),

  /** Generic type parameters */
  type_parameters: z.array(z.string()).default([]).describe("Generic type parameters"),

  /** Additional language-specific properties as JSON */
  properties: z.record(z.unknown()).default({}).describe("Additional properties"),

  /** SHA-256 hash of source file content */
  source_file_hash: z.string().describe("SHA-256 hash of source file content"),

  /** Branch name (for delta storage) */
  branch: z.string().default("base").describe("Branch name"),

  /** Is this node deleted in branch partition? */
  is_deleted: z.boolean().default(false).describe("Is this node deleted?"),

  /** Timestamp of last update */
  updated_at: z.string().describe("Timestamp of last update"),
});

/** TypeScript type derived from Zod schema */
export type Node = z.infer<typeof NodeSchema>;

/**
 * Partial node schema for test data - only required fields
 * Optional fields will be filled with defaults
 */
export const TestNodeSchema = NodeSchema.pick({
  name: true,
  kind: true,
  file_path: true,
}).extend({
  entity_id: z.string().optional(),
  qualified_name: z.string().optional(),
  start_line: z.number().int().min(1).optional(),
  end_line: z.number().int().min(1).optional(),
  start_column: z.number().int().min(0).optional(),
  end_column: z.number().int().min(0).optional(),
  is_exported: z.boolean().optional(),
  is_default_export: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
  is_async: z.boolean().optional(),
  is_generator: z.boolean().optional(),
  is_static: z.boolean().optional(),
  is_abstract: z.boolean().optional(),
  type_signature: z.string().nullable().optional(),
  documentation: z.string().nullable().optional(),
  decorators: z.array(z.string()).optional(),
  type_parameters: z.array(z.string()).optional(),
  properties: z.record(z.unknown()).optional(),
  source_file_hash: z.string().optional(),
  branch: z.string().optional(),
  is_deleted: z.boolean().optional(),
  updated_at: z.string().optional(),
});

export type TestNode = z.infer<typeof TestNodeSchema>;

/**
 * Create a full Node from partial test data
 * Fills in defaults for missing fields
 */
export function createNodeFromTestData(
  testNode: TestNode,
  options?: { entityIdPrefix?: string }
): Node {
  const prefix = options?.entityIdPrefix ?? "test:pkg";
  const hash = Math.random().toString(36).substring(2, 10);

  return {
    entity_id: testNode.entity_id ?? `${prefix}:${testNode.kind}:${hash}`,
    name: testNode.name,
    qualified_name: testNode.qualified_name ?? testNode.name,
    kind: testNode.kind,
    file_path: testNode.file_path,
    start_line: testNode.start_line ?? 1,
    end_line: testNode.end_line ?? 10,
    start_column: testNode.start_column ?? 0,
    end_column: testNode.end_column ?? 50,
    is_exported: testNode.is_exported ?? false,
    is_default_export: testNode.is_default_export ?? false,
    visibility: testNode.visibility ?? "public",
    is_async: testNode.is_async ?? false,
    is_generator: testNode.is_generator ?? false,
    is_static: testNode.is_static ?? false,
    is_abstract: testNode.is_abstract ?? false,
    type_signature: testNode.type_signature ?? null,
    documentation: testNode.documentation ?? null,
    decorators: testNode.decorators ?? [],
    type_parameters: testNode.type_parameters ?? [],
    properties: testNode.properties ?? {},
    source_file_hash: testNode.source_file_hash ?? "test-hash",
    branch: testNode.branch ?? "base",
    is_deleted: testNode.is_deleted ?? false,
    updated_at: testNode.updated_at ?? new Date().toISOString(),
  };
}
