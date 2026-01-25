/**
 * URI Resolver
 *
 * Handles resolution between:
 * - Canonical URIs (human-readable lookup keys)
 * - Entity IDs (stable internal identity)
 *
 * The resolver uses a symbol index to perform lookups.
 * This file provides the interface and utilities; actual index
 * implementation is in the storage layer.
 *
 * Single Identity Model (ADR-0044):
 * - Entity ID is THE identity
 * - URIs are lookup keys that resolve TO Entity IDs
 */

import { formatCanonicalURI, formatEntityID } from "./formatter.js";
import { parseCanonicalURI, parseEntityID } from "./parser.js";
import type {
  CanonicalURI,
  EntityID,
  SymbolIndex,
  SymbolIndexEntry,
  SymbolPath,
  URIContext,
} from "./types.js";
import { KIND_TO_SEGMENT, METHOD_KINDS, ROOT_PACKAGE, type URISymbolKind } from "./types.js";

/**
 * Create a symbol index entry from parsed node data
 *
 * This is used during analysis to build the symbol index.
 */
export function createSymbolIndexEntry(params: {
  repo: string;
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
    repo: params.repo,
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
 * Resolve a URI string to an entity ID string
 *
 * Convenience function that handles parsing and formatting.
 */
export function resolveURIToEntityID(uri: string, index: SymbolIndex): string | null {
  const parsed = parseCanonicalURI(uri);
  const entityId = index.resolveURI(parsed.uri);
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
 * Compares repo, package, file, and symbol path.
 */
export function urisEqual(a: CanonicalURI, b: CanonicalURI): boolean {
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
 * Returns true if the URI is within the same repo or package
 * as the context, depending on how specific the context is.
 */
export function uriMatchesContext(uri: CanonicalURI, context: URIContext): boolean {
  if (uri.repo !== context.repo) return false;
  if (context.package && uri.package !== context.package) return false;
  if (context.file && uri.file !== context.file) return false;
  return true;
}

/**
 * Extract the parent URI from a URI
 *
 * File URI → Package URI → Repo URI
 */
export function getParentURI(uri: CanonicalURI): CanonicalURI | null {
  if (uri.symbol) {
    // Symbol → File
    return {
      repo: uri.repo,
      package: uri.package,
      file: uri.file,
    };
  }

  if (uri.file) {
    // File → Package
    return {
      repo: uri.repo,
      package: uri.package,
    };
  }

  if (uri.package !== ROOT_PACKAGE) {
    // Package → Repo
    return {
      repo: uri.repo,
      package: ROOT_PACKAGE,
    };
  }

  // Repo has no parent
  return null;
}

/**
 * Get the depth of a URI (number of levels from repo)
 */
export function getURIDepth(uri: CanonicalURI): number {
  let depth = 1; // repo
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
  }
): CanonicalURI {
  return {
    repo: context.repo,
    package: context.package,
    file: parts.file || context.file,
    symbol: parts.symbol,
  };
}
