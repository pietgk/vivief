/**
 * Effects Module
 *
 * Provides hierarchical effect mapping loading and application.
 * Part of DevAC v3.0 effects infrastructure.
 *
 * @module effects
 */

// Mapping loader - hierarchical effect mapping resolution
export {
  loadEffectMappings,
  applyMappings,
  hasMappings,
  getMappingsPath,
} from "./mapping-loader.js";

export type {
  MappingLevel,
  MappingSource,
  MappingResolutionResult,
  LoadMappingsOptions,
} from "./mapping-loader.js";
