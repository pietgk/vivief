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
  generateEmptyLikeC4ContainersDoc,
  generateEmptyLikeC4ContextDoc,
  generateLikeC4ContainersDoc,
  generateLikeC4ContextDoc,
  getC4FilePaths,
} from "./c4-doc-generator.js";
export type { C4DocResult, GenerateC4DocOptions } from "./c4-doc-generator.js";

// Repo Effects Generator
export {
  aggregatePackageEffects,
  computeRepoSeedHash,
  generateEmptyRepoEffectsDoc,
  generateRepoEffectsDoc,
} from "./repo-effects-generator.js";
export type {
  AggregatedPattern,
  GenerateRepoEffectsDocOptions,
  PackageEffectsInput,
  PackageEffectsSummary,
  RepoEffectsData,
} from "./repo-effects-generator.js";

// Repo C4 Generator
export {
  generateAllRepoC4Docs,
  generateEmptyRepoC4ContainersDoc,
  generateEmptyRepoC4ContextDoc,
  generateEmptyRepoLikeC4ContainersDoc,
  generateEmptyRepoLikeC4ContextDoc,
  generateRepoC4ContainersDoc,
  generateRepoC4ContextDoc,
  generateRepoLikeC4ContainersDoc,
  generateRepoLikeC4ContextDoc,
  getRepoC4FilePaths,
} from "./repo-c4-generator.js";
export type {
  GenerateRepoC4DocOptions,
  RepoC4DocResult,
} from "./repo-c4-generator.js";

// Workspace Effects Generator
export {
  computeWorkspaceSeedHash,
  generateEmptyUnifiedWorkspaceLikeC4,
  generateEmptyWorkspaceEffectsDoc,
  generateUnifiedWorkspaceLikeC4,
  generateWorkspaceC4ContainersDoc,
  generateWorkspaceC4ContextDoc,
  generateWorkspaceEffectsDoc,
  generateWorkspaceLikeC4ContainersDoc,
  generateWorkspaceLikeC4ContextDoc,
  queryWorkspaceEffects,
} from "./workspace-effects-generator.js";
export type {
  CrossRepoPattern,
  GenerateWorkspaceEffectsDocOptions,
  RepoEffectsSummary,
  WorkspaceEffectsData,
} from "./workspace-effects-generator.js";
