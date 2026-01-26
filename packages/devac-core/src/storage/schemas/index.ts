/**
 * Schema Exports - Single Source of Truth
 *
 * All table schemas are defined here using Zod.
 * TypeScript types, SQL DDL, and Parquet schemas are derived from these definitions.
 */

// Node schema exports
export {
  NodeSchema,
  NodeKindSchema,
  VisibilitySchema,
  TestNodeSchema,
  createNodeFromTestData,
} from "./node.schema.js";

export type { Node, NodeKind, Visibility, TestNode } from "./node.schema.js";

// Edge schema exports
export {
  EdgeSchema,
  EdgeTypeSchema,
  TestEdgeSchema,
  createEdgeFromTestData,
} from "./edge.schema.js";

export type { Edge, EdgeType, TestEdge } from "./edge.schema.js";

// External ref schema exports
export {
  ExternalRefSchema,
  ImportStyleSchema,
  TestExternalRefSchema,
  createExternalRefFromTestData,
} from "./external-ref.schema.js";

export type { ExternalRef, ImportStyle, TestExternalRef } from "./external-ref.schema.js";

// Re-export effects schemas from types (already using Zod)
export {
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
} from "../../types/effects.js";

export type {
  BaseEffect,
  Effect,
  CodeEffect,
  WorkflowEffect,
  FunctionCallEffect,
  StoreEffect,
  RetrieveEffect,
  SendEffect,
  RequestEffect,
  ResponseEffect,
  ConditionEffect,
  LoopEffect,
  GroupEffect,
} from "../../types/effects.js";
