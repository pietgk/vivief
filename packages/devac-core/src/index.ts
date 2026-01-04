/**
 * DevAC Core - Federated Code Analysis Engine
 *
 * DuckDB + Parquet based code analysis system.
 * Replaces Neo4j with file-based storage.
 *
 * @module @pietgk/devac-core
 */

// Types (base types)
export * from "./types/index.js";

// Storage (excludes StructuralParseResult which is re-exported from parsers)
export {
  DuckDBPool,
  isFatalError,
  executeWithRecovery,
  getDefaultPool,
  shutdownDefaultPool,
  getPoolStats,
  assertPoolClean,
  NODES_SCHEMA,
  EDGES_SCHEMA,
  EXTERNAL_REFS_SCHEMA,
  EFFECTS_SCHEMA,
  INDEXES,
  PARQUET_OPTIONS,
  initializeSchemas,
  getCopyToParquet,
  getReadFromParquet,
  getUnifiedQuery,
  acquireLock,
  releaseLock,
  isLockStale,
  withLock,
  withSeedLock,
  getLockInfo,
  forceReleaseLock,
  SeedWriter,
  createSeedWriter,
  SeedReader,
  createSeedReader,
  queryMultiplePackages,
  // Query context (ergonomic query UX)
  setupQueryContext,
  preprocessSql,
  discoverPackagesInRepo,
  buildPackageMap,
  // Effect storage (v3.0 foundation)
  EffectWriter,
  createEffectWriter,
  EffectReader,
  createEffectReader,
} from "./storage/index.js";
export type {
  PoolStats,
  PoolConfig,
  LockInfo,
  LockOptions,
  WriteOptions,
  WriteResult,
  QueryResult,
  IntegrityResult,
  // Query context types
  QueryContextConfig,
  QueryContextResult,
  DiscoveredPackage,
  // Effect storage types (v3.0 foundation)
  EffectWriteOptions,
  EffectWriteResult,
  EffectFilter,
  EffectReadResult,
  EffectStatistics,
} from "./storage/index.js";

// Analyzer (excludes generateScopeHash which conflicts with utils)
export {
  generateEntityId,
  normalizeComponent,
  normalizePathComponent,
  parseEntityId,
  isValidEntityId,
  entityIdsMatch,
  getRepoFromEntityId,
  getPackagePathFromEntityId,
  getKindFromEntityId,
  createEntityIdGenerator,
  generateEntityIdsForFile,
  deriveChildEntityId,
  LanguageRouter,
  createLanguageRouter,
  getDefaultRouter,
  resetDefaultRouter,
  DEFAULT_EXTENSION_MAP,
  createAnalysisOrchestrator,
} from "./analyzer/index.js";
export type {
  EntityIdComponents,
  ParsedEntityId,
  AnalysisOrchestrator,
  FileChangeEvent,
  AnalysisResult,
  PackageResult,
  BatchResult,
  ResolutionResult,
  OrchestratorStatus,
  OrchestratorOptions,
} from "./analyzer/index.js";

// Parsers
export * from "./parsers/index.js";

// Semantic Resolution (compiler-grade - ts-morph, Pyright, Roslyn)
export * from "./semantic/index.js";

// Configuration (Zod schemas and utilities)
export * from "./config/index.js";

// Watcher
export * from "./watcher/index.js";

// Hub (Federation)
export * from "./hub/index.js";

// Context Discovery
export * from "./context/index.js";

// Workspace (DevAC v3 Phase 1)
// Note: Explicit exports to avoid conflicts with context module
export {
  // Core types (workspace-specific, no conflicts)
  type WorkspaceInfo,
  type WorkspaceRepoInfo,
  type WorkspaceConfig,
  type WorkspaceState,
  type WorkspaceRepoState,
  type RepoHubStatus,
  // Event types
  type WorkspaceEvent,
  type WorkspaceEventBase,
  type FileChangeEvent as WorkspaceFileChangeEvent,
  type SeedChangeEvent,
  type HubRefreshEvent,
  type RepoDiscoveryEvent,
  type WatcherStateEvent,
  type WorkspaceEventHandler,
  // Options types
  type WorkspaceDiscoveryOptions,
  type WorkspaceWatcherOptions,
  type WorkspaceManagerOptions,
  type AutoRefreshOptions,
  // Git utilities
  findGitRoot,
  // Workspace-specific functions
  isWorkspaceDirectory,
  discoverWorkspaceRepos,
  discoverWorkspace,
  loadWorkspaceConfig,
  formatWorkspaceInfo,
  // Workspace hub discovery
  findWorkspaceDir,
  findWorkspaceHubDir,
  // State management
  getStateFilePath,
  loadWorkspaceState,
  saveWorkspaceState,
  updateRepoState,
  updateHubState,
  removeRepoFromState,
  isStateStale,
  repoInfoToState,
  syncStateWithDiscovery,
  mergeStateIntoRepos,
  getChangedRepos,
  markReposAsRegistered,
  stateFileExists,
  // Seed detector
  createSeedDetector,
  type SeedDetector,
  type SeedDetectorOptions,
  type SeedChangeHandler,
  type SeedDetectorStats,
  // Workspace watcher
  createWorkspaceWatcher,
  type WorkspaceWatcher,
  type WorkspaceWatcherStats,
  // Auto-refresh
  createAutoRefresher,
  type AutoRefresher,
  type RefreshEventHandler,
  type AutoRefreshStats,
  // Manager
  createWorkspaceManager,
  type WorkspaceManager,
  type WorkspaceManagerStats,
  // Package manager detection and discovery
  detectPackageManager,
  discoverJSPackages,
  discoverPythonPackages,
  discoverCSharpPackages,
  discoverAllPackages,
  type PackageManagerType,
  type LanguageType,
  type PackageInfo,
  type DiscoveryError,
  type DiscoveryResult,
  // Seed state detection
  hasBaseSeed,
  hasDeltaSeed,
  detectPackageSeedState,
  detectRepoSeedStatus,
  getPackagesNeedingAnalysis,
  getAnalyzedPackages,
  type SeedState,
  type PackageSeedState,
  type RepoSeedStatus,
  // Workspace status
  getRepoStatus,
  getWorkspaceStatus,
  formatStatusBrief,
  formatStatusFull,
  type StatusOptions,
  type RepoStatus,
  type WorkspaceStatus,
} from "./workspace/index.js";

// Validation (explicit exports to avoid SymbolInfo conflict with parsers)
export {
  SymbolAffectedAnalyzer,
  createSymbolAffectedAnalyzer,
  IssueEnricher,
  createIssueEnricher,
  TypecheckValidator,
  createTypecheckValidator,
  LintValidator,
  createLintValidator,
  TestValidator,
  createTestValidator,
  CoverageValidator,
  createCoverageValidator,
  ValidationCoordinator,
  createValidationCoordinator,
  pushValidationResultsToHub,
  clearValidationErrorsFromHub,
} from "./validation/index.js";
export type {
  ChangedSymbol,
  AffectedFile,
  SymbolAffectedResult,
  SymbolAffectedOptions,
  ValidationIssue,
  EnrichedIssue,
  EnrichmentOptions,
  CallerInfo,
  GetCallersOptions,
  TypecheckOptions,
  TypecheckResult,
  LintOptions,
  LintResult,
  TestOptions,
  TestResult,
  CoverageOptions,
  CoverageResult,
  CoverageIssue,
  FileCoverage,
  CoverageSummary,
  ValidationMode,
  ValidationConfig,
  ValidationCoordinatorResult,
} from "./validation/index.js";
// Note: SymbolInfo from validation is not exported to avoid conflict with parsers/SymbolInfo
// Use: import { SymbolInfo as ValidationSymbolInfo } from "@pietgk/devac-core/validation" if needed

// Utils (excludes generateScopeHash which is also in analyzer)
export {
  writeFileAtomic,
  writeJsonAtomic,
  copyFileAtomic,
  moveFileAtomic,
  fsyncDirectory,
  createTempFile,
  cleanupTempFiles,
  ensureDir,
  removeIfExists,
  fileExists,
  getFileMtime,
  computeStringHash,
  computeBufferHash,
  computeFileHash,
  computeFileHashes,
  hasFileChanged,
  findChangedFiles,
  generateRandomHash,
  combineHashes,
  cleanupPackageSeeds,
  findOrphanedSeeds,
  removeAllSeeds,
  cleanupOrphanedFiles,
  getSeedStorageStats,
  verifySeedStructure,
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  logger,
} from "./utils/index.js";
export type {
  AtomicWriteOptions,
  CleanupOptions,
  CleanupResult,
  Logger,
  LogLevel,
  LoggerOptions,
} from "./utils/index.js";

// Rules Engine (v3.0 foundation - pattern matching for effects)
export {
  RuleEngine,
  createRuleEngine,
  defineRule,
  builtinRules,
  databaseRules,
  paymentRules,
  authRules,
  httpRules,
  messagingRules,
  storageRules,
  observabilityRules,
  getRulesByDomain,
  getRulesByProvider,
} from "./rules/index.js";
export type {
  Rule,
  RuleMatch,
  RuleEmit,
  DomainEffect,
  RuleEngineResult,
  RuleEngineConfig,
} from "./rules/index.js";

// Views (v3.0 foundation - Vision→View pipeline)
export {
  generateC4Context,
  generateC4Containers,
  exportContextToPlantUML,
  exportContainersToPlantUML,
  discoverDomainBoundaries,
} from "./views/index.js";
export type {
  C4ExternalSystem,
  C4Container,
  C4Component,
  C4Relationship,
  C4Context,
  C4ContainerDiagram,
  DomainSummary,
  C4GeneratorOptions,
  DomainBoundary,
} from "./views/index.js";

// Effects (v3.0 foundation - Hierarchical mapping loader)
export {
  loadEffectMappings,
  applyMappings,
  hasMappings,
  getMappingsPath,
} from "./effects/index.js";
export type {
  MappingLevel,
  MappingSource,
  MappingResolutionResult,
  LoadMappingsOptions,
} from "./effects/index.js";

/**
 * DevAC Core Version
 */
export { VERSION } from "./version.js";
