/**
 * Hub Module - Federation support for DevAC v2.0
 *
 * Provides repository manifest generation, central hub management,
 * and cross-repository query capabilities.
 */

export {
  ManifestGenerator,
  createManifestGenerator,
  type RepositoryManifest,
  type PackageInfo,
  type ExternalDependency,
  type ValidationResult,
} from "./manifest-generator.js";

export {
  HubStorage,
  createHubStorage,
  type RepoRegistration,
  type CrossRepoEdge,
  type ValidationError,
  type ValidationFilter,
  type ValidationSummary,
  // Unified Feedback types
  type UnifiedFeedback,
  type FeedbackFilter,
  type FeedbackSummary,
  type FeedbackSource,
  type FeedbackSeverity,
  type FeedbackCategory,
} from "./hub-storage.js";

export {
  CentralHub,
  createCentralHub,
  type CentralHubOptions,
  type HubStatus,
  type RefreshResult,
  type AffectedResult as CentralHubAffectedResult,
  type AffectedRepo as CentralHubAffectedRepo,
  type QueryResult,
} from "./central-hub.js";

export {
  AffectedAnalyzer,
  createAffectedAnalyzer,
  type AnalyzeOptions,
  type AffectedResult,
  type AffectedRepo,
} from "./affected-analyzer.js";
