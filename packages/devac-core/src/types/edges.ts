/**
 * Edge Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.2
 */

/**
 * Edge types representing relationships between nodes
 */
export type EdgeType =
  | "CONTAINS" // Parent contains child (class contains method)
  | "CALLS" // Function calls another function
  | "IMPORTS" // Module imports from another
  | "EXTENDS" // Class/interface extends another
  | "IMPLEMENTS" // Class implements interface
  | "RETURNS" // Function returns type
  | "PARAMETER_OF" // Parameter belongs to function
  | "TYPE_OF" // Variable has type
  | "DECORATES" // Decorator applied to symbol
  | "OVERRIDES" // Method overrides parent method
  | "REFERENCES" // General reference to symbol
  | "EXPORTS" // Module exports symbol
  | "RE_EXPORTS" // Module re-exports from another
  | "INSTANTIATES" // Creates instance of class
  | "USES_TYPE" // Uses type in signature
  | "ACCESSES" // Accesses property/field
  | "THROWS" // Function throws error type
  | "AWAITS" // Awaits promise/async call
  | "YIELDS" // Generator yields value
  | "RENDERS" // JSX: Component renders another component as child
  | "PASSES_PROPS"; // JSX: Component passes props to child component

/**
 * Parsed edge from structural analysis
 *
 * Matches the Parquet schema for edges table
 */
export interface ParsedEdge {
  /** Source node entity_id */
  source_entity_id: string;

  /** Target node entity_id */
  target_entity_id: string;

  /** Type of relationship */
  edge_type: EdgeType;

  /** Source file where this edge originates */
  source_file_path: string;

  /** Line number of reference in source */
  source_line: number;

  /** Column of reference in source */
  source_column: number;

  /** Additional properties (e.g., call arguments, import alias) */
  properties: Record<string, unknown>;

  /** SHA-256 hash of source file content */
  source_file_hash: string;

  /** Branch name (for delta storage) */
  branch: string;

  /** Is this edge deleted in branch partition? */
  is_deleted: boolean;

  /** Timestamp of last update */
  updated_at: string;
}

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
