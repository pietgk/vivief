/**
 * Enriched Domain Effects
 *
 * Types for domain effects enriched with node metadata from the code graph.
 * Used to generate C4 diagrams with readable function/class names instead of hashes.
 */

import type { DomainEffect } from "../rules/rule-engine.js";

/**
 * DomainEffect enriched with node metadata for better C4 generation.
 * Extends DomainEffect with human-readable names resolved from the nodes table.
 */
export interface EnrichedDomainEffect extends DomainEffect {
  /** Human-readable function/class name from nodes table (e.g., "analyzePackage") */
  sourceName: string;
  /** Fully qualified name including scope (e.g., "src/analyzer.analyzePackage") */
  sourceQualifiedName: string;
  /** Node kind (function, class, method, etc.) */
  sourceKind: string;
  /** Relative file path stripped of absolute prefix (e.g., "src/analyzer.ts" not "/Users/grop/...") */
  relativeFilePath: string;
}

/**
 * Node metadata from the nodes table.
 * Used to build a lookup map for enriching domain effects.
 */
export interface NodeMetadata {
  name: string;
  qualified_name: string;
  kind: string;
}

/**
 * Lookup map from entity_id to node metadata.
 * Built from SQL query results for efficient enrichment.
 */
export type NodeLookupMap = Map<string, NodeMetadata>;

/**
 * Internal edge representing a CALLS relationship between components.
 * Used to add internal call graph edges to C4 diagrams.
 */
export interface InternalEdge {
  sourceEntityId: string;
  targetEntityId: string;
}

/**
 * Result of enriching domain effects with node metadata.
 * Contains both the enriched effects and metadata for C4 generation.
 */
export interface EnrichmentResult {
  /** Domain effects enriched with readable names */
  effects: EnrichedDomainEffect[];
  /** Internal CALLS edges between components */
  internalEdges: InternalEdge[];
  /** Number of effects that couldn't be enriched (used fallback name) */
  unenrichedCount: number;
}
