/**
 * Documentation Generation Module
 *
 * Provides utilities for generating documentation from DevAC analysis results,
 * including effects documentation and C4 architecture diagrams.
 *
 * Key features:
 * - Seed hashing for change detection
 * - Metadata embedding for tracking generation and verification
 * - Effects documentation generation
 * - C4 PlantUML diagram generation
 */

// Seed Hasher
export {
  computeSeedHash,
  getSeedPath,
  hasSeed,
  listSeedFiles,
} from "./seed-hasher.js";
export type { SeedFileInfo, SeedHashResult } from "./seed-hasher.js";

// Doc Metadata
export {
  docNeedsRegeneration,
  generateDocMetadata,
  generateDocMetadataForMarkdown,
  generateDocMetadataForPlantUML,
  parseDocMetadata,
  parseDocMetadataFromFile,
  stripDocMetadata,
  updateDocMetadata,
} from "./doc-metadata.js";
export type {
  DocMetadata,
  GenerateMetadataOptions,
  RegenerationCheckResult,
} from "./doc-metadata.js";

// Effects Generator
export {
  generateEffectsDoc,
  generateEmptyEffectsDoc,
} from "./effects-generator.js";
export type {
  EffectsDocData,
  ExternalPattern,
  GenerateEffectsDocOptions,
  OtherPattern,
  RetrievePattern,
  StorePattern,
} from "./effects-generator.js";

// C4 Doc Generator
export {
  generateAllC4Docs,
  generateC4ContainersDoc,
  generateC4ContextDoc,
  generateEmptyC4ContainersDoc,
  generateEmptyC4ContextDoc,
  getC4FilePaths,
} from "./c4-doc-generator.js";
export type { C4DocResult, GenerateC4DocOptions } from "./c4-doc-generator.js";
