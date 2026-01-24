/**
 * URI Resolver
 *
 * Handles resolution between:
 * - Canonical URIs (human-readable)
 * - Entity IDs (stable internal)
 *
 * The resolver uses a symbol index to perform lookups.
 * This file provides the interface and utilities; actual index
 * implementation is in the storage layer.
 */

import type {
  CanonicalURI,
  EntityID,
  SymbolIndex,
  SymbolIndexEntry,
  SymbolPath,
  URIContext,
} from "./types.js";
import { formatCanonicalURI, formatEntityID, getQualifiedName } from "./formatter.js";
import { parseCanonicalURI, parseEntityID, parseSymbolPath } from "./parser.js";
import { KIND_TO_SEGMENT, METHOD_KINDS, ROOT_PACKAGE, type URISymbolKind } from "./types.js";

/**
 * Create a symbol index entry from parsed node data
 *
 * This is used during analysis to build the symbol index.
 */
export function createSymbolIndexEntry(params: {
  workspace: string;
  repo: string;
  version?: string;
  package: string;
  filePath: string;
  name: string;
  qualifiedName?: string;
  kind: URISymbolKind;
  hash: string;
  line: number;
}): SymbolIndexEntry {
  // Build symbol path
  const segmentKind = KIND_TO_SEGMENT[params.kind] || "term";
  const isMethod = METHOD_KINDS.has(params.kind);

  const segments: SymbolPath["segments"] = [];
  const qualifiedParts = (params.qualifiedName || params.name).split(".");

  for (let i = 0; i < qualifiedParts.length; i++) {
    const isLast = i === qualifiedParts.length - 1;
    const partName = qualifiedParts[i]!;
    segments.push({
      kind: isLast ? segmentKind : "type",
      name: partName,
      isMethod: isLast && isMethod,
    });
  }

  const uri: CanonicalURI = {
    workspace: params.workspace,
    repo: params.repo,
    version: params.version,
    package: params.package,
    file: params.filePath,
    symbol: { segments },
  };

  const entityId: EntityID = {
    repo: params.repo,
    package: params.package,
    kind: params.kind,
    hash: params.hash,
  };

  return {
    uri,
    entityId,
    name: params.name,
    filePath: params.filePath,
    line: params.line,
    kind: params.kind,
  };
}

/**
 * In-memory symbol index implementation
 *
 * This is a simple implementation suitable for single-package queries.
 * The storage layer provides a more sophisticated implementation backed
 * by DuckDB for cross-repo queries.
 */
export class InMemorySymbolIndex implements SymbolIndex {
  private readonly entries: SymbolIndexEntry[] = [];
  private readonly byEntityId = new Map<string, SymbolIndexEntry>();
  private readonly byURIString = new Map<string, SymbolIndexEntry>();
  private readonly byFile = new Map<string, SymbolIndexEntry[]>();
  private readonly byName = new Map<string, SymbolIndexEntry[]>();

  /**
   * Add an entry to the index
   */
  add(entry: SymbolIndexEntry): void {
    this.entries.push(entry);

    // Index by entity ID
    const entityIdStr = formatEntityID(entry.entityId);
    this.byEntityId.set(entityIdStr, entry);

    // Index by URI
    const uriStr = formatCanonicalURI(entry.uri);
    this.byURIString.set(uriStr, entry);

    // Index by file
    const fileKey = this.getFileKey(entry.uri);
    const fileEntries = this.byFile.get(fileKey) || [];
    fileEntries.push(entry);
    this.byFile.set(fileKey, fileEntries);

    // Index by name
    const nameEntries = this.byName.get(entry.name) || [];
    nameEntries.push(entry);
    this.byName.set(entry.name, nameEntries);
  }

  /**
   * Resolve a canonical URI to an entity ID
   */
  resolveURI(uri: CanonicalURI): EntityID | null {
    const uriStr = formatCanonicalURI(uri);
    const entry = this.byURIString.get(uriStr);
    return entry?.entityId || null;
  }

  /**
   * Get the canonical URI for an entity ID
   */
  getURI(entityId: EntityID): CanonicalURI | null {
    const entityIdStr = formatEntityID(entityId);
    const entry = this.byEntityId.get(entityIdStr);
    return entry?.uri || null;
  }

  /**
   * Find symbols by name pattern
   */
  findByName(pattern: string, _context?: URIContext): SymbolIndexEntry[] {
    // Simple pattern matching with * wildcard
    if (!pattern.includes("*")) {
      return this.byName.get(pattern) || [];
    }

    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*") + "$"
    );

    const results: SymbolIndexEntry[] = [];
    for (const [name, entries] of this.byName) {
      if (regex.test(name)) {
        results.push(...entries);
      }
    }

    return results;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(uri: CanonicalURI): SymbolIndexEntry[] {
    const fileKey = this.getFileKey(uri);
    return this.byFile.get(fileKey) || [];
  }

  /**
   * Get all entries
   */
  getAll(): SymbolIndexEntry[] {
    return [...this.entries];
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.entries.length = 0;
    this.byEntityId.clear();
    this.byURIString.clear();
    this.byFile.clear();
    this.byName.clear();
  }

  private getFileKey(uri: CanonicalURI): string {
    return `${uri.workspace}/${uri.repo}/${uri.package}/${uri.file || ""}`;
  }
}

/**
 * Resolve a URI string to an entity ID string
 *
 * Convenience function that handles parsing and formatting.
 */
export function resolveURIToEntityID(uri: string, index: SymbolIndex): string | null {
  const parsed = parseCanonicalURI(uri);
  const entityId = index.resolveURI(parsed);
  return entityId ? formatEntityID(entityId) : null;
}

/**
 * Get a URI string from an entity ID string
 *
 * Convenience function that handles parsing and formatting.
 */
export function getURIFromEntityID(entityId: string, index: SymbolIndex): string | null {
  const parsed = parseEntityID(entityId);
  const uri = index.getURI(parsed);
  return uri ? formatCanonicalURI(uri) : null;
}

/**
 * Compare two URIs for equality
 *
 * Compares workspace, repo, package, file, and symbol path.
 * Ignores location and version differences.
 */
export function urisEqual(a: CanonicalURI, b: CanonicalURI): boolean {
  if (a.workspace !== b.workspace) return false;
  if (a.repo !== b.repo) return false;
  if (a.package !== b.package) return false;
  if (a.file !== b.file) return false;

  // Compare symbols
  if (!a.symbol && !b.symbol) return true;
  if (!a.symbol || !b.symbol) return false;

  return symbolPathsEqual(a.symbol, b.symbol);
}

/**
 * Compare two symbol paths for equality
 */
export function symbolPathsEqual(a: SymbolPath, b: SymbolPath): boolean {
  if (a.segments.length !== b.segments.length) return false;

  for (let i = 0; i < a.segments.length; i++) {
    const segA = a.segments[i];
    const segB = b.segments[i];

    if (!segA || !segB) return false;
    if (segA.kind !== segB.kind) return false;
    if (segA.name !== segB.name) return false;
    if (segA.isMethod !== segB.isMethod) return false;

    // Compare params if both have them
    if (segA.params || segB.params) {
      if (!segA.params || !segB.params) return false;
      if (segA.params.length !== segB.params.length) return false;
      for (let j = 0; j < segA.params.length; j++) {
        if (segA.params[j] !== segB.params[j]) return false;
      }
    }
  }

  return true;
}

/**
 * Compare two entity IDs for equality
 */
export function entityIdsEqual(a: EntityID, b: EntityID): boolean {
  return a.repo === b.repo && a.package === b.package && a.kind === b.kind && a.hash === b.hash;
}

/**
 * Check if a URI matches a context
 *
 * Returns true if the URI is within the same workspace, repo, or package
 * as the context, depending on how specific the context is.
 */
export function uriMatchesContext(uri: CanonicalURI, context: URIContext): boolean {
  if (uri.workspace !== context.workspace) return false;
  if (context.repo && uri.repo !== context.repo) return false;
  if (context.package && uri.package !== context.package) return false;
  if (context.file && uri.file !== context.file) return false;
  return true;
}

/**
 * Extract the parent URI from a URI
 *
 * File URI → Package URI → Repo URI → Workspace URI
 */
export function getParentURI(uri: CanonicalURI): CanonicalURI | null {
  if (uri.symbol) {
    // Symbol → File
    return {
      workspace: uri.workspace,
      repo: uri.repo,
      version: uri.version,
      package: uri.package,
      file: uri.file,
    };
  }

  if (uri.file) {
    // File → Package
    return {
      workspace: uri.workspace,
      repo: uri.repo,
      version: uri.version,
      package: uri.package,
    };
  }

  if (uri.package !== ROOT_PACKAGE) {
    // Package → Repo
    return {
      workspace: uri.workspace,
      repo: uri.repo,
      version: uri.version,
      package: ROOT_PACKAGE,
    };
  }

  if (uri.repo) {
    // Repo → Workspace
    return {
      workspace: uri.workspace,
      repo: "",
      package: ROOT_PACKAGE,
    };
  }

  // Workspace has no parent
  return null;
}

/**
 * Get the depth of a URI (number of levels from workspace)
 */
export function getURIDepth(uri: CanonicalURI): number {
  let depth = 1; // workspace
  if (uri.repo) depth++;
  if (uri.package !== ROOT_PACKAGE) depth++;
  if (uri.file) depth++;
  if (uri.symbol) depth++;
  return depth;
}

/**
 * Build a canonical URI from context and relative parts
 */
export function buildURIFromParts(
  context: URIContext,
  parts: {
    file?: string;
    symbol?: SymbolPath;
    line?: number;
  }
): CanonicalURI {
  return {
    workspace: context.workspace,
    repo: context.repo,
    version: context.version,
    package: context.package,
    file: parts.file || context.file,
    symbol: parts.symbol,
    location: parts.line ? { line: parts.line } : undefined,
  };
}
