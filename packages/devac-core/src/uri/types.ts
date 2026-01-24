/**
 * URI Types for Unified Addressing Scheme
 *
 * Based on ADR-0044: Unified Addressing Scheme for DevAC
 *
 * Three reference types:
 * - CanonicalURI: Human-readable `devac://workspace/repo@version/package/file#Symbol`
 * - EntityID: Stable internal `repo:package:kind:hash`
 * - RelativeRef: Context-dependent shorthand `#Symbol`, `./file#Symbol`
 */

/**
 * Canonical URI - the human-readable address for a code artifact
 *
 * Format: devac://workspace/repo@version/package/file#Symbol.path()#L10:C5
 *
 * @example
 * ```typescript
 * const uri: CanonicalURI = {
 *   workspace: "mindlercare",
 *   repo: "app",
 *   version: "main",
 *   package: "packages/core",
 *   file: "src/auth.ts",
 *   symbol: { segments: [{ kind: "type", name: "AuthService" }] },
 *   location: { line: 45, column: 10 }
 * };
 * // devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService#L45:C10
 * ```
 */
export interface CanonicalURI {
  /** Workspace name (from workspace repo, e.g., "mindlercare") */
  workspace: string;

  /** Repository name */
  repo: string;

  /** Version tag, branch, or commit SHA (optional, defaults to HEAD) */
  version?: string;

  /** Package path within repo ("." for root package) */
  package: string;

  /** File path within package (optional for package-level references) */
  file?: string;

  /** SCIP-style symbol path (optional for file-level references) */
  symbol?: SymbolPath;

  /** Line/column position for navigation (optional) */
  location?: Location;
}

/**
 * Entity ID - stable internal identifier for storage
 *
 * Format: repo:package:kind:hash
 *
 * This ID is:
 * - Stable across renames (hash-based)
 * - Used in parquet storage
 * - Used in edge relationships
 *
 * @example
 * ```typescript
 * const entityId: EntityID = {
 *   repo: "app",
 *   package: "packages/core",
 *   kind: "class",
 *   hash: "a1b2c3d4"
 * };
 * // Serializes to: "app:packages/core:class:a1b2c3d4"
 * ```
 */
export interface EntityID {
  /** Repository name */
  repo: string;

  /** Package path within repo */
  package: string;

  /** Symbol kind (class, function, variable, etc.) */
  kind: string;

  /** Content-based hash for stability */
  hash: string;
}

/**
 * SCIP-inspired symbol path
 *
 * Represents a path to a symbol using type suffixes:
 * - `#` for types (class, interface, type alias)
 * - `.` for terms (function, variable, constant)
 *
 * @example
 * ```typescript
 * // #AuthService
 * { segments: [{ kind: "type", name: "AuthService" }] }
 *
 * // #AuthService.login()
 * { segments: [
 *   { kind: "type", name: "AuthService" },
 *   { kind: "term", name: "login", isMethod: true }
 * ]}
 *
 * // #AuthService.login(string,string)
 * { segments: [
 *   { kind: "type", name: "AuthService" },
 *   { kind: "term", name: "login", isMethod: true, params: ["string", "string"] }
 * ]}
 * ```
 */
export interface SymbolPath {
  /** Ordered list of symbol segments from outer to inner */
  segments: SymbolSegment[];
}

/**
 * A single segment in a symbol path
 */
export interface SymbolSegment {
  /** Segment kind: "type" for classes/interfaces, "term" for functions/variables */
  kind: "type" | "term";

  /** Symbol name */
  name: string;

  /** Whether this is a method/function (has parentheses in formatted output) */
  isMethod?: boolean;

  /** Parameter types for overload disambiguation (e.g., ["string", "number"]) */
  params?: string[];
}

/**
 * Source code location (line/column position)
 *
 * Used for navigation, not identity. The same symbol may be referenced
 * with different locations for jump-to-definition vs show-all-usages.
 */
export interface Location {
  /** 1-based line number */
  line: number;

  /** 0-based column number (optional) */
  column?: number;

  /** End line for ranges (optional) */
  endLine?: number;

  /** End column for ranges (optional) */
  endColumn?: number;
}

/**
 * Context for resolving relative references
 *
 * When parsing a relative ref like `#Symbol` or `./file#Symbol`,
 * we need to know the current workspace, repo, package, and file
 * to resolve it to a canonical URI.
 */
export interface URIContext {
  /** Current workspace name */
  workspace: string;

  /** Current repository name */
  repo: string;

  /** Current version/branch (optional) */
  version?: string;

  /** Current package path */
  package: string;

  /** Current file path (for file-relative refs) */
  file?: string;
}

/**
 * Result of parsing a URI string
 *
 * Includes the parsed URI and metadata about what type was parsed.
 */
export interface ParsedURIResult {
  /** The parsed canonical URI */
  uri: CanonicalURI;

  /** Whether the original was a full canonical URI or relative ref */
  wasRelative: boolean;

  /** The original input string */
  original: string;
}

/**
 * Symbol index entry for URI resolution
 *
 * Used to resolve human-readable URIs to stable entity IDs.
 */
export interface SymbolIndexEntry {
  /** Canonical URI of the symbol */
  uri: CanonicalURI;

  /** Entity ID for stable reference */
  entityId: EntityID;

  /** Symbol display name */
  name: string;

  /** File path where symbol is defined */
  filePath: string;

  /** Line number of definition */
  line: number;

  /** Symbol kind (class, function, etc.) */
  kind: string;
}

/**
 * Symbol index interface for URI resolution
 *
 * This interface is implemented by the storage layer to support
 * bidirectional resolution between URIs and entity IDs.
 */
export interface SymbolIndex {
  /**
   * Resolve a canonical URI to an entity ID
   * Returns null if the symbol is not found
   */
  resolveURI(uri: CanonicalURI): EntityID | null;

  /**
   * Get the canonical URI for an entity ID
   * Returns null if the entity is not found
   */
  getURI(entityId: EntityID): CanonicalURI | null;

  /**
   * Find symbols by name pattern
   * Supports wildcards (e.g., "Auth*")
   */
  findByName(pattern: string, context?: URIContext): SymbolIndexEntry[];

  /**
   * Get all symbols in a file
   */
  getFileSymbols(uri: CanonicalURI): SymbolIndexEntry[];
}

/**
 * URI scheme constant
 */
export const URI_SCHEME = "devac://";

/**
 * Entity ID separator
 */
export const ENTITY_ID_SEPARATOR = ":";

/**
 * Root package marker
 */
export const ROOT_PACKAGE = ".";

/**
 * Symbol kind type for URI system (matches NodeKind from nodes.ts)
 * Named differently to avoid conflict with parsers/SymbolKind
 */
export type URISymbolKind =
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
 * Map from symbol kind to segment kind
 */
export const KIND_TO_SEGMENT: Record<URISymbolKind, "type" | "term"> = {
  class: "type",
  interface: "type",
  type: "type",
  enum: "type",
  namespace: "type",
  module: "type",
  function: "term",
  method: "term",
  property: "term",
  variable: "term",
  constant: "term",
  enum_member: "term",
  parameter: "term",
  decorator: "term",
  jsx_component: "type",
  html_element: "term",
  hook: "term",
  unknown: "term",
};

/**
 * Kinds that are methods (have parentheses)
 */
export const METHOD_KINDS: Set<URISymbolKind> = new Set([
  "function",
  "method",
  "hook",
]);
