/**
 * Effect Enricher
 *
 * Enriches domain effects with node metadata from the code graph.
 * This bridges the gap between hash-based entity IDs and human-readable names
 * for generating meaningful C4 architecture diagrams.
 */

import type { DomainEffect } from "../rules/rule-engine.js";
import type {
  EnrichedDomainEffect,
  EnrichmentResult,
  InternalEdge,
  NodeLookupMap,
  NodeMetadata,
} from "../types/enriched-effects.js";

/**
 * Enrich domain effects with node metadata.
 *
 * @param effects - Domain effects from rules engine
 * @param nodeLookup - Map of entity_id to node metadata
 * @param basePath - Base path for computing relative file paths
 * @param internalEdges - Optional CALLS edges for internal relationships
 * @returns Enrichment result with enriched effects and metadata
 */
export function enrichDomainEffects(
  effects: DomainEffect[],
  nodeLookup: NodeLookupMap,
  basePath?: string,
  internalEdges: InternalEdge[] = []
): EnrichmentResult {
  let unenrichedCount = 0;

  const enrichedEffects = effects.map((effect): EnrichedDomainEffect => {
    const nodeMetadata = nodeLookup.get(effect.sourceEntityId);

    if (!nodeMetadata) {
      unenrichedCount++;
    }

    return {
      ...effect,
      sourceName: nodeMetadata?.name ?? extractFallbackName(effect.sourceEntityId),
      sourceQualifiedName: nodeMetadata?.qualified_name ?? effect.sourceEntityId,
      sourceKind: nodeMetadata?.kind ?? "unknown",
      relativeFilePath: computeRelativePath(effect.filePath, basePath),
    };
  });

  return {
    effects: enrichedEffects,
    internalEdges,
    unenrichedCount,
  };
}

/**
 * Extract a fallback name from an entity ID when node metadata is not available.
 *
 * Entity ID format: repo:package:kind:hash
 * We try to extract the kind as a hint, otherwise use a truncated hash.
 *
 * @param entityId - Entity ID to extract name from
 * @returns Fallback display name
 */
export function extractFallbackName(entityId: string): string {
  const parts = entityId.split(":");
  if (parts.length >= 4) {
    // Format: repo:package:kind:hash
    // Use kind + first 6 chars of hash for some context
    const kind = parts[2] ?? "unknown";
    const hash = parts[3] ?? "";
    const shortHash = hash.slice(0, 6);
    return `${kind}_${shortHash}`;
  }
  if (parts.length >= 3) {
    // Shorter format - use last meaningful part
    const lastPart = parts[parts.length - 1] ?? "";
    return lastPart.slice(0, 12) || entityId.slice(0, 12);
  }
  // Fallback: truncate the whole ID
  return entityId.slice(0, 16);
}

/**
 * Compute a relative file path by stripping common absolute path prefixes.
 *
 * This handles paths like /Users/grop/ws/project/src/file.ts
 * and converts them to src/file.ts or similar relative paths.
 *
 * @param filePath - Absolute or relative file path
 * @param basePath - Optional base path to strip
 * @returns Relative file path suitable for display
 */
export function computeRelativePath(filePath: string, basePath?: string): string {
  if (!filePath) {
    return "";
  }

  let result = filePath;

  // If basePath is provided and path starts with it, strip it
  if (basePath && result.startsWith(basePath)) {
    result = result.slice(basePath.length);
    // Remove leading slash if present
    if (result.startsWith("/")) {
      result = result.slice(1);
    }
    return result;
  }

  // Strip common absolute path patterns
  // Pattern: /Users/{user}/{workspace}/{project}/...
  const absolutePathPattern = /^\/Users\/[^/]+\/[^/]+\/[^/]+\//;
  if (absolutePathPattern.test(result)) {
    result = result.replace(absolutePathPattern, "");
    return result;
  }

  // Pattern: /home/{user}/{workspace}/{project}/...
  const homePathPattern = /^\/home\/[^/]+\/[^/]+\/[^/]+\//;
  if (homePathPattern.test(result)) {
    result = result.replace(homePathPattern, "");
    return result;
  }

  // Pattern: C:\Users\{user}\{workspace}\{project}\... (Windows)
  const windowsPathPattern = /^[A-Z]:\\Users\\[^\\]+\\[^\\]+\\[^\\]+\\/i;
  if (windowsPathPattern.test(result)) {
    result = result.replace(windowsPathPattern, "").replace(/\\/g, "/");
    return result;
  }

  // If it's already relative or doesn't match patterns, return as-is
  return result;
}

/**
 * Build a node lookup map from SQL query results.
 *
 * @param nodes - Array of node rows from SQL query
 * @returns Map of entity_id to node metadata
 */
export function buildNodeLookupMap(
  nodes: Array<{ entity_id: string; name: string; qualified_name: string; kind: string }>
): NodeLookupMap {
  const map = new Map<string, NodeMetadata>();

  for (const node of nodes) {
    map.set(node.entity_id, {
      name: node.name,
      qualified_name: node.qualified_name,
      kind: node.kind,
    });
  }

  return map;
}

/**
 * Build internal edges array from SQL query results.
 *
 * @param edges - Array of edge rows from SQL query
 * @returns Array of internal edges
 */
export function buildInternalEdges(
  edges: Array<{ source_entity_id: string; target_entity_id: string }>
): InternalEdge[] {
  return edges.map((edge) => ({
    sourceEntityId: edge.source_entity_id,
    targetEntityId: edge.target_entity_id,
  }));
}
