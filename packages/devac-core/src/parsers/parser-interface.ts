/**
 * Parser Interface
 *
 * Defines the contract for language-specific parsers.
 * Based on DevAC v2.0 spec Section 9.
 */

import type { CodeEffect, ParsedEdge, ParsedExternalRef, ParsedNode } from "../types/index.js";

/**
 * Result of parsing a single source file
 */
export interface StructuralParseResult {
  /** Parsed nodes (functions, classes, variables, etc.) */
  nodes: ParsedNode[];
  /** Parsed edges (relationships between nodes) */
  edges: ParsedEdge[];
  /** External references (unresolved imports) */
  externalRefs: ParsedExternalRef[];
  /** Code effects extracted during parse (v3.0 foundation) */
  effects: CodeEffect[];
  /** SHA-256 hash of the source file content */
  sourceFileHash: string;
  /** File path relative to package root */
  filePath: string;
  /** Parse duration in milliseconds */
  parseTimeMs: number;
  /** Any warnings or non-fatal errors */
  warnings: string[];
}

/**
 * Parser configuration options
 */
export interface ParserConfig {
  /** Repository name for entity ID generation */
  repoName: string;
  /** Package path relative to repo root */
  packagePath: string;
  /** Absolute path to package root directory (for computing relative file paths) */
  packageRoot?: string;
  /** Branch name (default: "base") */
  branch: string;
  /** Include JSDoc/documentation comments */
  includeDocumentation: boolean;
  /** Include type information */
  includeTypes: boolean;
  /** Maximum depth for nested scope analysis */
  maxScopeDepth: number;
}

/**
 * Default parser configuration
 */
export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  repoName: "",
  packagePath: "",
  packageRoot: undefined,
  branch: "base",
  includeDocumentation: true,
  includeTypes: true,
  maxScopeDepth: 10,
};

/**
 * Compute relative file path for entity ID generation.
 * If packageRoot is provided, makes filePath relative to it.
 * Otherwise uses the filePath as-is (for backwards compatibility).
 */
export function computeRelativeFilePath(filePath: string, config: ParserConfig): string {
  if (config.packageRoot && filePath.startsWith(config.packageRoot)) {
    // Remove packageRoot prefix and any leading slash
    let relative = filePath.slice(config.packageRoot.length);
    if (relative.startsWith("/") || relative.startsWith("\\")) {
      relative = relative.slice(1);
    }
    return relative || filePath;
  }
  return filePath;
}

/**
 * Language parser interface
 *
 * Each language implementation must implement this interface.
 */
export interface LanguageParser {
  /**
   * Language identifier (e.g., "typescript", "python")
   */
  readonly language: string;

  /**
   * File extensions this parser handles (e.g., [".ts", ".tsx"])
   */
  readonly extensions: string[];

  /**
   * Parse a source file
   *
   * @param filePath - Absolute path to the source file
   * @param config - Parser configuration
   * @returns Structural parse result
   */
  parse(filePath: string, config: ParserConfig): Promise<StructuralParseResult>;

  /**
   * Parse source code content directly (for testing)
   *
   * @param content - Source code content
   * @param filePath - Virtual file path for entity ID generation
   * @param config - Parser configuration
   * @returns Structural parse result
   */
  parseContent(
    content: string,
    filePath: string,
    config: ParserConfig
  ): Promise<StructuralParseResult>;

  /**
   * Check if this parser can handle a given file
   *
   * @param filePath - File path to check
   * @returns true if this parser can handle the file
   */
  canParse(filePath: string): boolean;

  /**
   * Get parser version for cache invalidation
   */
  readonly version: string;
}

/**
 * Parse result for multiple files
 */
export interface BatchParseResult {
  /** Results by file path */
  results: Map<string, StructuralParseResult>;
  /** Failed files with error messages */
  errors: Map<string, string>;
  /** Total parse time in milliseconds */
  totalTimeMs: number;
  /** Number of files successfully parsed */
  successCount: number;
  /** Number of files that failed */
  errorCount: number;
}

/**
 * Parser factory function type
 */
export type ParserFactory = () => LanguageParser;

/**
 * Create an empty parse result
 */
export function createEmptyParseResult(
  filePath: string,
  sourceFileHash: string
): StructuralParseResult {
  return {
    nodes: [],
    edges: [],
    externalRefs: [],
    effects: [],
    sourceFileHash,
    filePath,
    parseTimeMs: 0,
    warnings: [],
  };
}

/**
 * Merge multiple parse results into one
 */
export function mergeParseResults(results: StructuralParseResult[]): StructuralParseResult {
  const merged: StructuralParseResult = {
    nodes: [],
    edges: [],
    externalRefs: [],
    effects: [],
    sourceFileHash: "",
    filePath: "",
    parseTimeMs: 0,
    warnings: [],
  };

  for (const result of results) {
    merged.nodes.push(...result.nodes);
    merged.edges.push(...result.edges);
    merged.externalRefs.push(...result.externalRefs);
    merged.effects.push(...(result.effects ?? []));
    merged.parseTimeMs += result.parseTimeMs;
    merged.warnings.push(...result.warnings);
  }

  return merged;
}

/**
 * Filter parse result to only include specified file
 */
export function filterParseResultByFile(
  result: StructuralParseResult,
  filePath: string
): StructuralParseResult {
  return {
    ...result,
    nodes: result.nodes.filter((n) => n.file_path === filePath),
    edges: result.edges.filter((e) => e.source_file_path === filePath),
    externalRefs: result.externalRefs.filter((r) => r.source_file_path === filePath),
    effects: (result.effects ?? []).filter((e) => e.source_file_path === filePath),
  };
}

/**
 * Validate a parse result for consistency
 */
export function validateParseResult(result: StructuralParseResult): string[] {
  const errors: string[] = [];

  // Check all nodes have required fields
  for (const node of result.nodes) {
    if (!node.entity_id) {
      errors.push(`Node missing entity_id: ${node.name}`);
    }
    if (!node.file_path) {
      errors.push(`Node missing file_path: ${node.entity_id}`);
    }
  }

  // Check all edges reference valid nodes
  const nodeIds = new Set(result.nodes.map((n) => n.entity_id));
  for (const edge of result.edges) {
    if (!nodeIds.has(edge.source_entity_id)) {
      // This is okay for cross-file references
      // Only flag if source should be in this file
      if (edge.source_file_path === result.filePath) {
        errors.push(`Edge source not found: ${edge.source_entity_id}`);
      }
    }
  }

  // Check external refs have source nodes
  for (const ref of result.externalRefs) {
    if (!nodeIds.has(ref.source_entity_id)) {
      if (ref.source_file_path === result.filePath) {
        errors.push(`External ref source not found: ${ref.source_entity_id}`);
      }
    }
  }

  return errors;
}
