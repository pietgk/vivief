/**
 * Edge Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.2
 *
 * IMPORTANT: The canonical type definitions are in ../storage/schemas/edge.schema.ts
 * This file re-exports those types for backward compatibility.
 */

// Import types from the Zod schema (single source of truth)
import type { Edge, EdgeType } from "../storage/schemas/edge.schema.js";

// Re-export the types for backward compatibility
export type { EdgeType };

/**
 * Parsed edge from structural analysis
 *
 * This type is now derived from the Zod schema in ../storage/schemas/edge.schema.ts
 * Any changes to the schema should be made there, not here.
 */
export type ParsedEdge = Edge;

/**
 * Create a new ParsedEdge with defaults
 */
export function createEdge(
  partial: Partial<ParsedEdge> &
    Pick<
      ParsedEdge,
      | "source_entity_id"
      | "target_entity_id"
      | "edge_type"
      | "source_file_path"
      | "source_file_hash"
    >
): ParsedEdge {
  return {
    source_line: 1,
    source_column: 0,
    properties: {},
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
    ...partial,
  };
}
