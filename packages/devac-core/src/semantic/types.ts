/**
 * Semantic Resolution Types
 *
 * Common interfaces for all language-specific semantic resolvers.
 * Semantic resolution is Pass 2 of the two-pass architecture:
 * - Pass 1 (Structural): Fast per-file parsing with Babel/ast/tree-sitter
 * - Pass 2 (Semantic): Cross-file resolution with ts-morph/Pyright/Roslyn
 *
 * @module semantic/types
 */

import type { ParsedExternalRef } from "../types/external-refs.js";
import type { NodeKind } from "../types/nodes.js";

/**
 * Supported languages for semantic resolution
 */
export type SemanticLanguage = "typescript" | "python" | "csharp";

/**
 * Information about an exported symbol from a module
 */
export interface ExportInfo {
  /** Name of the exported symbol */
  name: string;

  /** Kind of the symbol (function, class, etc.) */
  kind: NodeKind;

  /** Absolute file path where the symbol is defined */
  filePath: string;

  /** Entity ID of the exported symbol */
  entityId: string;

  /** Is this a default export? */
  isDefault: boolean;

  /** Is this a type-only export? (TypeScript) */
  isTypeOnly: boolean;

  /** Original file path if this is a re-export */
  originalFilePath?: string;

  /** Original name if re-exported with alias */
  originalName?: string;
}

/**
 * Index of all exports from a package
 * Maps module specifier -> symbol name -> export info
 */
export interface ExportIndex {
  /** Package root path */
  packagePath: string;

  /** Map of file path to its exports */
  fileExports: Map<string, ExportInfo[]>;

  /** Map of module specifier to resolved file path */
  moduleResolution: Map<string, string>;

  /** Timestamp when index was built */
  builtAt: Date;
}

/**
 * An unresolved reference from structural parsing
 */
export interface UnresolvedRef {
  /** Entity ID of the source node containing this import */
  sourceEntityId: string;

  /** File path where the import occurs */
  sourceFilePath: string;

  /** Module specifier as written (e.g., "./utils", "@org/pkg") */
  moduleSpecifier: string;

  /** Imported symbol name */
  importedSymbol: string;

  /** Is this a type-only import? */
  isTypeOnly: boolean;

  /** Is this a default import? */
  isDefault: boolean;

  /** Is this a namespace import? */
  isNamespace: boolean;

  /** Source line number */
  sourceLine: number;

  /** Source column */
  sourceColumn: number;
}

/**
 * A successfully resolved reference
 */
export interface ResolvedRef {
  /** The original unresolved reference */
  ref: UnresolvedRef;

  /** Resolved target entity ID */
  targetEntityId: string;

  /** Resolved target file path */
  targetFilePath: string;

  /** Confidence score (0-1) - useful for partial/fuzzy matches */
  confidence: number;

  /** Resolution method used */
  method: "compiler" | "index" | "heuristic";
}

/**
 * Result of semantic resolution for a package
 */
export interface ResolutionResult {
  /** Total number of references processed */
  total: number;

  /** Number of successfully resolved references */
  resolved: number;

  /** Number of unresolved references */
  unresolved: number;

  /** List of resolved references */
  resolvedRefs: ResolvedRef[];

  /** Errors encountered during resolution */
  errors: ResolutionError[];

  /** Time taken in milliseconds */
  timeMs: number;

  /** Package path that was resolved */
  packagePath: string;
}

/**
 * Error encountered during resolution
 */
export interface ResolutionError {
  /** The reference that failed to resolve */
  ref: UnresolvedRef;

  /** Error message */
  error: string;

  /** Error code for categorization */
  code: ResolutionErrorCode;
}

/**
 * Error codes for resolution failures
 */
export type ResolutionErrorCode =
  | "MODULE_NOT_FOUND" // Module specifier could not be resolved
  | "SYMBOL_NOT_FOUND" // Symbol not exported from module
  | "PARSE_ERROR" // Failed to parse target file
  | "TIMEOUT" // Resolution timed out
  | "CIRCULAR_DEPENDENCY" // Circular import detected
  | "INTERNAL_ERROR"; // Unexpected error

/**
 * Configuration for semantic resolution
 */
export interface SemanticConfig {
  /** Enable TypeScript resolution */
  typescript: {
    enabled: boolean;
    /** Timeout per file in milliseconds */
    timeoutMs: number;
    /** Number of files to process in a batch */
    batchSize: number;
    /** Skip lib.d.ts checking for performance */
    skipLibCheck: boolean;
  };

  /** Enable Python resolution */
  python: {
    enabled: boolean;
    /** Path to pyright executable */
    pyrightPath?: string;
  };

  /** Enable C# resolution */
  csharp: {
    enabled: boolean;
    /** Path to dotnet executable */
    dotnetPath?: string;
  };
}

/**
 * Default semantic configuration
 */
export const defaultSemanticConfig: SemanticConfig = {
  typescript: {
    enabled: true,
    timeoutMs: 30000,
    batchSize: 50,
    skipLibCheck: true,
  },
  python: {
    enabled: true,
    pyrightPath: undefined,
  },
  csharp: {
    enabled: true,
    dotnetPath: undefined,
  },
};

/**
 * Interface for language-specific semantic resolvers
 *
 * Each language implements this interface to provide cross-file
 * symbol resolution using compiler-grade tools.
 */
export interface SemanticResolver {
  /** Language this resolver handles */
  readonly language: SemanticLanguage;

  /**
   * Check if the resolver is available
   * (e.g., required tools are installed)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Build an export index for a package
   * This indexes all exported symbols for fast lookup
   *
   * @param packagePath - Root path of the package
   * @returns Export index for the package
   */
  buildExportIndex(packagePath: string): Promise<ExportIndex>;

  /**
   * Resolve a single import reference
   *
   * @param ref - Unresolved reference to resolve
   * @param index - Export index for target resolution
   * @returns Resolved reference or null if not resolvable
   */
  resolveRef(ref: UnresolvedRef, index: ExportIndex): Promise<ResolvedRef | null>;

  /**
   * Resolve all external references in a package
   * This is the main entry point for semantic resolution
   *
   * @param packagePath - Root path of the package
   * @param refs - Unresolved references from structural parsing
   * @returns Resolution result with all resolved/unresolved refs
   */
  resolvePackage(packagePath: string, refs: UnresolvedRef[]): Promise<ResolutionResult>;

  /**
   * Clear any cached data for a package
   * Called when files change and cache needs invalidation
   *
   * @param packagePath - Package to clear cache for
   */
  clearCache(packagePath: string): void;
}

/**
 * Convert ParsedExternalRef to UnresolvedRef
 * Used to transform structural parsing output for semantic resolution
 */
export function toUnresolvedRef(parsed: ParsedExternalRef): UnresolvedRef {
  return {
    sourceEntityId: parsed.source_entity_id,
    sourceFilePath: parsed.source_file_path,
    moduleSpecifier: parsed.module_specifier,
    importedSymbol: parsed.imported_symbol,
    isTypeOnly: parsed.is_type_only,
    isDefault: parsed.import_style === "default",
    isNamespace: parsed.import_style === "namespace",
    sourceLine: parsed.source_line,
    sourceColumn: parsed.source_column,
  };
}

/**
 * Apply resolution result to ParsedExternalRef
 * Used to update structural parsing output with resolved entity IDs
 */
export function applyResolution(
  parsed: ParsedExternalRef,
  resolved: ResolvedRef
): ParsedExternalRef {
  return {
    ...parsed,
    target_entity_id: resolved.targetEntityId,
    is_resolved: true,
    updated_at: new Date().toISOString(),
  };
}
