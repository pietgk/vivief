/**
 * External Reference Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.3
 *
 * IMPORTANT: The canonical type definitions are in ../storage/schemas/external-ref.schema.ts
 * This file re-exports those types for backward compatibility.
 */

// Import types from the Zod schema (single source of truth)
import type { ExternalRef, ImportStyle } from "../storage/schemas/external-ref.schema.js";

// Re-export the types for backward compatibility
export type { ImportStyle };

/**
 * Parsed external reference (unresolved import)
 *
 * These are imports that reference symbols outside the current package.
 * They get resolved to actual entity_ids in the semantic resolution phase.
 *
 * This type is now derived from the Zod schema in ../storage/schemas/external-ref.schema.ts
 * Any changes to the schema should be made there, not here.
 */
export type ParsedExternalRef = ExternalRef;

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
