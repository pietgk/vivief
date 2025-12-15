/**
 * External Reference Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.3
 */

/**
 * Import style
 */
export type ImportStyle =
  | "named" // import { foo } from 'module'
  | "default" // import foo from 'module'
  | "namespace" // import * as foo from 'module'
  | "side_effect" // import 'module'
  | "dynamic" // await import('module')
  | "require"; // const foo = require('module')

/**
 * Parsed external reference (unresolved import)
 *
 * These are imports that reference symbols outside the current package.
 * They get resolved to actual entity_ids in the semantic resolution phase.
 *
 * Matches the Parquet schema for external_refs table
 */
export interface ParsedExternalRef {
  /** Source node entity_id that contains this import */
  source_entity_id: string;

  /** Module specifier as written in code (e.g., "@myorg/shared") */
  module_specifier: string;

  /** Imported symbol name (e.g., "User") */
  imported_symbol: string;

  /** Local alias if renamed (e.g., "UserModel" from "import { User as UserModel }") */
  local_alias: string | null;

  /** How the import was written */
  import_style: ImportStyle;

  /** Is this a type-only import? */
  is_type_only: boolean;

  /** File path where import occurs */
  source_file_path: string;

  /** Line number of import statement */
  source_line: number;

  /** Column of import */
  source_column: number;

  /** Resolved target entity_id (populated in semantic pass) */
  target_entity_id: string | null;

  /** Has this reference been resolved? */
  is_resolved: boolean;

  /** Is this a re-export? */
  is_reexport: boolean;

  /** Export alias if re-exporting with different name */
  export_alias: string | null;

  /** SHA-256 hash of source file content */
  source_file_hash: string;

  /** Branch name (for delta storage) */
  branch: string;

  /** Is this ref deleted in branch partition? */
  is_deleted: boolean;

  /** Timestamp of last update */
  updated_at: string;
}

/**
 * Create a new ParsedExternalRef with defaults
 */
export function createExternalRef(
  partial: Partial<ParsedExternalRef> &
    Pick<
      ParsedExternalRef,
      | "source_entity_id"
      | "module_specifier"
      | "imported_symbol"
      | "source_file_path"
      | "source_file_hash"
    >
): ParsedExternalRef {
  return {
    local_alias: null,
    import_style: "named",
    is_type_only: false,
    source_line: 1,
    source_column: 0,
    target_entity_id: null,
    is_resolved: false,
    is_reexport: false,
    export_alias: null,
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
    ...partial,
  };
}
