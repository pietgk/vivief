/**
 * External Reference Schema - SINGLE SOURCE OF TRUTH
 *
 * All TypeScript types, SQL DDL, and Parquet schemas are derived from this Zod schema.
 * Based on DevAC v2.0 spec Section 4.3
 */

import { z } from "zod";

/**
 * Import style enumeration
 */
export const ImportStyleSchema = z.enum([
  "named", // import { foo } from 'module'
  "default", // import foo from 'module'
  "namespace", // import * as foo from 'module'
  "side_effect", // import 'module'
  "dynamic", // await import('module')
  "require", // const foo = require('module')
]);

export type ImportStyle = z.infer<typeof ImportStyleSchema>;

/**
 * External reference schema - the single source of truth for the external_refs table
 *
 * These are imports that reference symbols outside the current package.
 * They get resolved to actual entity_ids in the semantic resolution phase.
 *
 * IMPORTANT: All schema changes must be made here. TypeScript types,
 * SQL CREATE TABLE statements, and test fixtures are derived from this schema.
 */
export const ExternalRefSchema = z.object({
  /** Source node entity_id that contains this import */
  source_entity_id: z.string().describe("Source node entity_id that contains this import"),

  /** Module specifier as written in code (e.g., "@myorg/shared") */
  module_specifier: z.string().describe("Module specifier as written in code"),

  /** Imported symbol name (e.g., "User") */
  imported_symbol: z.string().describe("Imported symbol name"),

  /** Local alias if renamed (e.g., "UserModel" from "import { User as UserModel }") */
  local_alias: z.string().nullable().default(null).describe("Local alias if renamed"),

  /** How the import was written */
  import_style: ImportStyleSchema.default("named").describe("How the import was written"),

  /** Is this a type-only import? */
  is_type_only: z.boolean().default(false).describe("Is this a type-only import?"),

  /** File path where import occurs */
  source_file_path: z.string().describe("File path where import occurs"),

  /** Line number of import statement */
  source_line: z.number().int().min(1).describe("Line number of import statement"),

  /** Column of import */
  source_column: z.number().int().min(0).describe("Column of import"),

  /** Resolved target entity_id (populated in semantic pass) */
  target_entity_id: z.string().nullable().default(null).describe("Resolved target entity_id"),

  /** Has this reference been resolved? */
  is_resolved: z.boolean().default(false).describe("Has this reference been resolved?"),

  /** Is this a re-export? */
  is_reexport: z.boolean().default(false).describe("Is this a re-export?"),

  /** Export alias if re-exporting with different name */
  export_alias: z.string().nullable().default(null).describe("Export alias if re-exporting"),

  /** SHA-256 hash of source file content */
  source_file_hash: z.string().describe("SHA-256 hash of source file content"),

  /** Branch name (for delta storage) */
  branch: z.string().default("base").describe("Branch name"),

  /** Is this ref deleted in branch partition? */
  is_deleted: z.boolean().default(false).describe("Is this ref deleted?"),

  /** Timestamp of last update */
  updated_at: z.string().describe("Timestamp of last update"),
});

/** TypeScript type derived from Zod schema */
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

/**
 * Partial external ref schema for test data - only required fields
 */
export const TestExternalRefSchema = ExternalRefSchema.pick({
  source_entity_id: true,
  module_specifier: true,
  imported_symbol: true,
}).extend({
  local_alias: z.string().nullable().optional(),
  import_style: ImportStyleSchema.optional(),
  is_type_only: z.boolean().optional(),
  source_file_path: z.string().optional(),
  source_line: z.number().int().min(1).optional(),
  source_column: z.number().int().min(0).optional(),
  target_entity_id: z.string().nullable().optional(),
  is_resolved: z.boolean().optional(),
  is_reexport: z.boolean().optional(),
  export_alias: z.string().nullable().optional(),
  source_file_hash: z.string().optional(),
  branch: z.string().optional(),
  is_deleted: z.boolean().optional(),
  updated_at: z.string().optional(),
});

export type TestExternalRef = z.infer<typeof TestExternalRefSchema>;

/**
 * Create a full ExternalRef from partial test data
 * Fills in defaults for missing fields
 */
export function createExternalRefFromTestData(testRef: TestExternalRef): ExternalRef {
  return {
    source_entity_id: testRef.source_entity_id,
    module_specifier: testRef.module_specifier,
    imported_symbol: testRef.imported_symbol,
    local_alias: testRef.local_alias ?? null,
    import_style: testRef.import_style ?? "named",
    is_type_only: testRef.is_type_only ?? false,
    source_file_path: testRef.source_file_path ?? "src/test.ts",
    source_line: testRef.source_line ?? 1,
    source_column: testRef.source_column ?? 0,
    target_entity_id: testRef.target_entity_id ?? null,
    is_resolved: testRef.is_resolved ?? false,
    is_reexport: testRef.is_reexport ?? false,
    export_alias: testRef.export_alias ?? null,
    source_file_hash: testRef.source_file_hash ?? "test-hash",
    branch: testRef.branch ?? "base",
    is_deleted: testRef.is_deleted ?? false,
    updated_at: testRef.updated_at ?? new Date().toISOString(),
  };
}
