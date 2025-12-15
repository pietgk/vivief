/**
 * DevAC v2.0 Type Exports
 */

// Node types
export type { ParsedNode, NodeKind, Visibility } from "./nodes.js";
export { createNode } from "./nodes.js";

// Edge types
export type { ParsedEdge, EdgeType } from "./edges.js";
export { createEdge } from "./edges.js";

// External reference types
export type { ParsedExternalRef, ImportStyle } from "./external-refs.js";
export { createExternalRef } from "./external-refs.js";

// Configuration types
export type {
  SeedMeta,
  PackageConfig,
  AnalysisOptions,
  SeedPaths,
  OutputFormat,
  QueryOptions,
} from "./config.js";

export {
  SCHEMA_VERSION,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_QUERY_OPTIONS,
  getSeedPaths,
} from "./config.js";
