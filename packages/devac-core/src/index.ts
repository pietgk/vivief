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
  // Column names derived from Zod schemas
  NODES_COLUMNS,
  EDGES_COLUMNS,
  EXTERNAL_REFS_COLUMNS,
  // Schema generators (Zod to SQL/Parquet)
  zodToCreateTable,
  zodToColumnNames,
  zodToInsertSQL,
  zodToValuesRow,
  getColumnMetadata,
  validateData,
  safeValidateData,
  // Zod schemas (single source of truth)
  NodeSchema,
  NodeKindSchema,
  VisibilitySchema,
  TestNodeSchema,
  createNodeFromTestData,
  EdgeSchema,
  EdgeTypeSchema,
  TestEdgeSchema,
  createEdgeFromTestData,
  ExternalRefSchema,
  ImportStyleSchema,
  TestExternalRefSchema,
  createExternalRefFromTestData,
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
  // Unified query (v3.0 - recommended for new code)
  query,
  // Query context (legacy - use query() for new code)
  setupQueryContext,
  queryWithContext,
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
  ResolvedRefUpdate,
  ResolvedCallEdgeUpdate,
  UpdateResolvedCallEdgesResult,
  QueryResult,
  IntegrityResult,
  // Unified query types (v3.0 - recommended for new code)
  QueryConfig,
  UnifiedQueryResult,
  // Query context types (legacy - use query() for new code)
  QueryContextConfig,
  QueryContextResult,
  ContextQueryResult,
  DiscoveredPackage,
  // Effect storage types (v3.0 foundation)
  EffectWriteOptions,
  EffectWriteResult,
  EffectFilter,
  EffectReadResult,
  EffectStatistics,
  // Schema generator types
  ColumnMetadata,
  // Zod schema types (single source of truth)
  Node,
  NodeKind,
  Visibility,
  TestNode,
  Edge,
  EdgeType,
  TestEdge,
  ExternalRef,
  ImportStyle,
  TestExternalRef,
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
  // Hub location validation
  validateHubLocation,
  type HubValidationResult,
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
  // WCAG Accessibility Validator (Phase 1 - Accessibility Intelligence Layer)
  WcagValidator,
  createWcagValidator,
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
  // WCAG Accessibility (Phase 1 - Accessibility Intelligence Layer)
  WcagOptions,
  WcagResult,
  WcagValidationIssue,
  A11yPlatform,
  A11yDetectionSource,
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
  // Git utilities
  detectRepoId,
  detectRepoIdFromGit,
  detectRepoIdFromPackageJson,
  parseGitConfigForOrigin,
  parseGitUrl,
  getRepoIdSync,
} from "./utils/index.js";
export type {
  AtomicWriteOptions,
  CleanupOptions,
  CleanupResult,
  Logger,
  LogLevel,
  LoggerOptions,
  RepoIdResult,
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
  // Grouping rules (v3.0 - container assignment)
  GroupingEngine,
  createGroupingEngine,
  defineGroupingRule,
  builtinGroupingRules,
  analysisLayerRules,
  storageLayerRules,
  federationLayerRules,
  apiLayerRules,
  rulesLayerRules,
  viewsLayerRules,
  getGroupingRulesByContainer,
  getGroupingRulesByLayer,
  getAvailableContainers,
  getAvailableTags,
  // Significance rules (v3.0 - architectural importance)
  SignificanceEngine,
  createSignificanceEngine,
  defineSignificanceRule,
  buildSignificanceContext,
  builtinSignificanceRules,
  criticalSignificanceRules,
  importantSignificanceRules,
  minorSignificanceRules,
  hiddenSignificanceRules,
  getSignificanceRulesByLevel,
  getSignificanceRulesByDomain,
  getSignificanceLevelValue,
  compareSignificanceLevels,
} from "./rules/index.js";
export type {
  Rule,
  RuleMatch,
  RuleEmit,
  DomainEffect,
  RuleEngineResult,
  RuleEngineConfig,
  // Grouping rules types
  GroupingRule,
  GroupingMatch,
  GroupingEmit,
  GroupingResult,
  GroupingEngineConfig,
  GroupingEngineStats,
  // Significance rules types
  SignificanceRule,
  SignificanceMatch,
  SignificanceEmit,
  SignificanceResult,
  SignificanceLevel,
  SignificanceContext,
  SignificanceEngineConfig,
  SignificanceEngineStats,
} from "./rules/index.js";

// Views (v3.0 foundation - Vision→View pipeline)
export {
  generateC4Context,
  generateC4Containers,
  exportContextToPlantUML,
  exportContainersToPlantUML,
  discoverDomainBoundaries,
  // Rule-based filtering and grouping (v3.0)
  applySignificanceFiltering,
  applyGroupingRules,
  // Effect enrichment (for readable C4 diagrams)
  enrichDomainEffects,
  extractFallbackName,
  computeRelativePath,
  buildNodeLookupMap,
  buildInternalEdges,
  // LikeC4 JSON Parser (for gap analysis)
  exportLikeC4ToJson,
  parseModel,
  parseLikeC4,
  parsePackageC4Files,
  getContainerId,
  getContainerComponents,
  // Gap Metrics (for architecture improvement loop)
  calculateF1,
  calculateContainerF1,
  calculateSignalToNoise,
  calculateRelationshipF1,
  calculateExternalF1,
  analyzeGap,
  formatGapAnalysis,
  // Gap target constants
  DEFAULT_GAP_TARGETS,
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
  // LikeC4 JSON Parser types
  LikeC4Element,
  LikeC4Relationship,
  LikeC4View,
  LikeC4Model,
  ParsedC4Model,
  // Gap Metrics types
  F1Score,
  GapMetric,
  GapAnalysis,
  GapTargets,
  GapAnalysisOptions,
  RuleAnalysisResult,
} from "./views/index.js";

// Enriched Effects Types (for C4 enrichment)
export type {
  EnrichedDomainEffect,
  NodeMetadata,
  NodeLookupMap,
  InternalEdge,
  EnrichmentResult,
} from "./types/enriched-effects.js";

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

// Docs (v3.0 foundation - Documentation generation with metadata)
export {
  // Seed hasher
  computeSeedHash,
  getSeedPath,
  hasSeed,
  listSeedFiles,
  // Doc metadata
  docNeedsRegeneration,
  generateDocMetadata,
  generateDocMetadataForMarkdown,
  generateDocMetadataForPlantUML,
  parseDocMetadata,
  parseDocMetadataFromFile,
  stripDocMetadata,
  updateDocMetadata,
  // Effects generator
  generateEffectsDoc,
  generateEmptyEffectsDoc,
  // C4 doc generator
  generateAllC4Docs,
  generateC4ContainersDoc,
  generateC4ContextDoc,
  generateEmptyC4ContainersDoc,
  generateEmptyC4ContextDoc,
  generateEmptyLikeC4ContainersDoc,
  generateEmptyLikeC4ContextDoc,
  generateEmptyUnifiedLikeC4Doc,
  generateLikeC4ContainersDoc,
  generateLikeC4ContextDoc,
  generateUnifiedLikeC4Doc,
  getC4FilePaths,
  getUnifiedLikeC4FilePath,
  // Repo-level generators
  aggregatePackageEffects,
  computeRepoSeedHash,
  generateAllRepoC4Docs,
  generateEmptyRepoC4ContainersDoc,
  generateEmptyRepoC4ContextDoc,
  generateEmptyRepoEffectsDoc,
  generateEmptyRepoLikeC4ContainersDoc,
  generateEmptyRepoLikeC4ContextDoc,
  generateEmptyUnifiedRepoLikeC4Doc,
  generateRepoC4ContainersDoc,
  generateRepoC4ContextDoc,
  generateRepoEffectsDoc,
  generateRepoLikeC4ContainersDoc,
  generateRepoLikeC4ContextDoc,
  generateUnifiedRepoLikeC4Doc,
  getRepoC4FilePaths,
  getUnifiedRepoLikeC4FilePath,
  // Workspace-level generators
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
} from "./docs/index.js";
export type {
  // Seed hasher types
  SeedFileInfo,
  SeedHashResult,
  // Doc metadata types
  DocMetadata,
  GenerateMetadataOptions,
  RegenerationCheckResult,
  // Effects generator types
  EffectsDocData,
  ExternalPattern,
  GenerateEffectsDocOptions,
  OtherPattern,
  RetrievePattern,
  StorePattern,
  // C4 doc generator types
  C4DocResult,
  GenerateC4DocOptions,
  // Repo-level types
  AggregatedPattern,
  GenerateRepoC4DocOptions,
  GenerateRepoEffectsDocOptions,
  PackageEffectsInput,
  PackageEffectsSummary,
  RepoC4DocResult,
  RepoEffectsData,
  // Workspace-level types
  CrossRepoPattern,
  GenerateWorkspaceEffectsDocOptions,
  RepoEffectsSummary,
  WorkspaceEffectsData,
} from "./docs/index.js";

// Status (v4.0 - CLI/MCP unified types)
export * from "./status/index.js";

// Prerequisites (v4.0 - Unified prerequisite checking)
export * from "./prerequisites/index.js";

// URI (ADR-0044 - Unified Addressing Scheme)
export * from "./uri/index.js";

// Queries (v4.0 - Shared Query Layer for CLI and MCP)
export * from "./queries/index.js";

/**
 * DevAC Core Version
 */
export { VERSION } from "./version.js";
