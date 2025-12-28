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

// Effect types (v3.0 foundation)
export type {
  // Base types
  BaseEffect,
  Effect,
  EffectType,
  // Code Effects
  CodeEffect,
  CodeEffectType,
  FunctionCallEffect,
  StoreEffect,
  RetrieveEffect,
  SendEffect,
  RequestEffect,
  ResponseEffect,
  ConditionEffect,
  LoopEffect,
  GroupEffect,
  GroupEffectType,
  // Workflow Effects
  WorkflowEffect,
  WorkflowEffectType,
  FileChangedEffect,
  SeedUpdatedEffect,
  ValidationResultEffect,
  ValidationCheckType,
  IssueClaimedEffect,
  PRMergedEffect,
  ChangeRequestedEffect,
} from "./effects.js";

export {
  // Schemas
  BaseEffectSchema,
  EffectSchema,
  CodeEffectSchema,
  WorkflowEffectSchema,
  FunctionCallEffectSchema,
  StoreEffectSchema,
  RetrieveEffectSchema,
  SendEffectSchema,
  RequestEffectSchema,
  ResponseEffectSchema,
  ConditionEffectSchema,
  LoopEffectSchema,
  GroupEffectSchema,
  GroupEffectTypeSchema,
  FileChangedEffectSchema,
  SeedUpdatedEffectSchema,
  ValidationResultEffectSchema,
  ValidationCheckTypeSchema,
  IssueClaimedEffectSchema,
  PRMergedEffectSchema,
  ChangeRequestedEffectSchema,
  // Helper functions
  generateEffectId,
  createFunctionCallEffect,
  createStoreEffect,
  createRetrieveEffect,
  createSendEffect,
  createRequestEffect,
  createValidationResultEffect,
  createSeedUpdatedEffect,
  createFileChangedEffect,
  parseEffect,
  safeParseEffect,
  isCodeEffect,
  isWorkflowEffect,
} from "./effects.js";

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
