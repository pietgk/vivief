/**
 * Node Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.1
 *
 * IMPORTANT: The canonical type definitions are in ../storage/schemas/node.schema.ts
 * This file re-exports those types for backward compatibility.
 */

// Import types from the Zod schema (single source of truth)
import type { Node, NodeKind, Visibility } from "../storage/schemas/node.schema.js";

// Re-export the types for backward compatibility
export type { NodeKind, Visibility };

/**
 * Parsed node from structural analysis
 *
 * This type is now derived from the Zod schema in ../storage/schemas/node.schema.ts
 * Any changes to the schema should be made there, not here.
 */
export type ParsedNode = Node;

/**
 * Create a new ParsedNode with defaults
 */
export function createNode(
  partial: Partial<ParsedNode> &
    Pick<ParsedNode, "entity_id" | "name" | "kind" | "file_path" | "source_file_hash">
): ParsedNode {
  return {
    qualified_name: partial.qualified_name ?? partial.name,
    start_line: 1,
    end_line: 1,
    start_column: 0,
    end_column: 0,
    is_exported: false,
    is_default_export: false,
    visibility: "public",
    is_async: false,
    is_generator: false,
    is_static: false,
    is_abstract: false,
    type_signature: null,
    documentation: null,
    decorators: [],
    type_parameters: [],
    properties: {},
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
    ...partial,
  };
}
