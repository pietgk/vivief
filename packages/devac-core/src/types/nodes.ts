/**
 * Node Schema Types
 *
 * Based on DevAC v2.0 spec Section 4.1
 */

/**
 * Node kinds supported by the analyzer
 */
export type NodeKind =
  | "function"
  | "class"
  | "method"
  | "property"
  | "variable"
  | "constant"
  | "interface"
  | "type"
  | "enum"
  | "enum_member"
  | "namespace"
  | "module"
  | "parameter"
  | "decorator"
  | "jsx_component"
  | "html_element"
  | "hook"
  | "unknown";

/**
 * Visibility/access modifiers
 */
export type Visibility = "public" | "private" | "protected" | "internal";

/**
 * Parsed node from structural analysis
 *
 * Matches the Parquet schema for nodes table
 */
export interface ParsedNode {
  /** Globally unique identifier: {repo}:{package_path}:{kind}:{scope_hash} */
  entity_id: string;

  /** Display name of the symbol */
  name: string;

  /** Fully qualified name including scope */
  qualified_name: string;

  /** Type of code element */
  kind: NodeKind;

  /** Relative path from package root */
  file_path: string;

  /** 1-based line number where symbol starts */
  start_line: number;

  /** 1-based line number where symbol ends */
  end_line: number;

  /** 0-based column offset */
  start_column: number;

  /** 0-based column offset */
  end_column: number;

  /** Is this symbol exported from its module? */
  is_exported: boolean;

  /** Is this a default export? */
  is_default_export: boolean;

  /** Access modifier */
  visibility: Visibility;

  /** Is this an async function/method? */
  is_async: boolean;

  /** Is this a generator function? */
  is_generator: boolean;

  /** Is this a static class member? */
  is_static: boolean;

  /** Is this an abstract class/method? */
  is_abstract: boolean;

  /** Type signature (for functions, variables with explicit types) */
  type_signature: string | null;

  /** JSDoc/docstring content */
  documentation: string | null;

  /** Decorator names applied to this symbol */
  decorators: string[];

  /** Generic type parameters */
  type_parameters: string[];

  /** Additional language-specific properties as JSON */
  properties: Record<string, unknown>;

  /** SHA-256 hash of source file content */
  source_file_hash: string;

  /** Branch name (for delta storage) */
  branch: string;

  /** Is this node deleted in branch partition? */
  is_deleted: boolean;

  /** Timestamp of last update */
  updated_at: string;
}

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
