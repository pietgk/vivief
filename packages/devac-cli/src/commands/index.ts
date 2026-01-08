/**
 * CLI Commands Index
 *
 * Re-exports all CLI command implementations and registration functions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Command registration functions (for use in index.ts)
// ─────────────────────────────────────────────────────────────────────────────

export { registerStatusCommand } from "./status.js";
export { registerDiagnosticsCommand } from "./diagnostics.js";
export { registerAnalyzeCommand } from "./analyze.js";
export { registerQueryCommand } from "./query.js";
export { registerVerifyCommand } from "./verify.js";
export { registerCleanCommand } from "./clean.js";
export { registerWatchCommand } from "./watch.js";
export { registerValidateCommand } from "./validate.js";
export { registerAffectedCommand } from "./affected.js";
export { registerMcpCommand } from "./mcp.js";
export { registerContextCommand } from "./context.js";
export { registerHubCommand } from "./hub-init.js";
export { registerWorkspaceCommand } from "./workspace-status.js";
export { registerTypecheckCommand } from "./typecheck.js";
export { registerLintCommand } from "./lint.js";
export { registerTestCommand } from "./test-cmd.js";
export { registerCoverageCommand } from "./coverage.js";
export { registerFindSymbolCommand } from "./find-symbol.js";
export { registerDepsCommand } from "./deps.js";
export { registerDependentsCommand } from "./dependents.js";
export { registerFileSymbolsCommand } from "./file-symbols.js";
export { registerCallGraphCommand } from "./call-graph.js";

// Effects, Rules, C4 commands (v3.0 foundation)
export { registerEffectsCommand } from "./effects.js";
export { registerRulesCommand } from "./rules.js";
export { registerC4Command } from "./c4.js";

// Architecture commands (improvement loop)
export { registerArchitectureCommand } from "./architecture.js";

// Workflow commands (deterministic development operations)
export { registerWorkflowCommand } from "./workflow/index.js";

// Doctor command (system health checks)
export { registerDoctorCommand } from "./doctor.js";

// Sync command (analyze + register workflow)
export { registerSyncCommand } from "./sync.js";

// Doc-sync command (documentation generation)
export { registerDocSyncCommand } from "./doc-sync.js";

// ─────────────────────────────────────────────────────────────────────────────
// Command function exports (for programmatic use)
// ─────────────────────────────────────────────────────────────────────────────

export { analyzeCommand } from "./analyze.js";
export { queryCommand } from "./query.js";
export { verifyCommand } from "./verify.js";
export { cleanCommand } from "./clean.js";
export { watchCommand } from "./watch.js";
export { validateCommand } from "./validate.js";
export type { ValidateOptions, ValidateResult } from "./validate.js";
export { affectedCommand } from "./affected.js";
export type {
  AffectedCommandOptions,
  AffectedCommandResult,
} from "./affected.js";
export { mcpCommand } from "./mcp.js";
export type {
  MCPCommandOptions,
  MCPCommandResult,
  MCPController,
  MCPTool,
  MCPToolResult,
} from "./mcp.js";

// Context command
export {
  contextCommand,
  contextCICommand,
  contextIssuesCommand,
  contextReviewsCommand,
  contextReviewCommand,
  processReviewResponse,
} from "./context.js";
export type {
  ContextOptions,
  ContextResult,
  ContextCIOptions,
  ContextCIResult,
  ContextIssuesOptions,
  ContextIssuesResult,
  ContextReviewsOptions,
  ContextReviewsResult,
  ContextReviewOptions,
  ContextReviewResult,
} from "./context.js";

// Hub commands
export { hubInit as hubInitCommand } from "./hub-init.js";
export type { HubInitOptions, HubInitResult } from "./hub-init.js";
export { hubList as hubListCommand } from "./hub-list.js";
export type { HubListOptions, HubListResult } from "./hub-list.js";
export { hubRegister as hubRegisterCommand } from "./hub-register.js";
export type { HubRegisterOptions, HubRegisterResult } from "./hub-register.js";
export { hubUnregister as hubUnregisterCommand } from "./hub-unregister.js";
export type {
  HubUnregisterOptions,
  HubUnregisterResult,
} from "./hub-unregister.js";
export { hubStatus as hubStatusCommand } from "./hub-status.js";
export type { HubStatusOptions, HubStatusResult } from "./hub-status.js";
export { hubRefresh as hubRefreshCommand } from "./hub-refresh.js";
export type { HubRefreshOptions, HubRefreshResult } from "./hub-refresh.js";
export { hubSyncCommand } from "./hub-sync.js";
export type { HubSyncOptions, HubSyncResult } from "./hub-sync.js";

export type {
  AnalyzeOptions,
  AnalyzeResult,
  QueryOptions,
  QueryResult,
  VerifyOptions,
  VerifyResult,
  CleanOptions,
  CleanResult,
  WatchOptions,
  WatchResult,
  WatchStatus,
  WatchChangeEvent,
  WatchController,
  AffectedOptions,
  AffectedResult,
} from "./types.js";

// Status command
export { statusCommand } from "./status.js";
export type { StatusOptions, StatusResult } from "./status.js";

// Diagnostics command
export { diagnosticsCommand } from "./diagnostics.js";
export type {
  DiagnosticsCommandOptions,
  DiagnosticsCommandResult,
} from "./diagnostics.js";

// Workspace commands
export { workspaceStatus } from "./workspace-status.js";
export type {
  WorkspaceStatusOptions,
  WorkspaceStatusResult,
} from "./workspace-status.js";
export { workspaceWatch } from "./workspace-watch.js";
export type {
  WorkspaceWatchOptions,
  WorkspaceWatchResult,
  WorkspaceWatchController,
} from "./workspace-watch.js";
export { workspaceInit } from "./workspace-init.js";
export type {
  WorkspaceInitOptions,
  WorkspaceInitResult,
} from "./workspace-init.js";

// Output formatting utilities
export {
  formatOutput,
  formatTable,
  formatValidationIssues,
  formatDiagnostics,
  formatSummary,
  formatSymbols,
  formatDependencies,
  type FormatOptions,
} from "./output-formatter.js";

// Validation commands
export { typecheckCommand } from "./typecheck.js";
export type {
  TypecheckCommandOptions,
  TypecheckCommandResult,
} from "./typecheck.js";
export { lintCommand } from "./lint.js";
export type { LintCommandOptions, LintCommandResult } from "./lint.js";
export { testCommand } from "./test-cmd.js";
export type { TestCommandOptions, TestCommandResult } from "./test-cmd.js";
export { coverageCommand } from "./coverage.js";
export type {
  CoverageCommandOptions,
  CoverageCommandResult,
} from "./coverage.js";

// Code graph commands
export { findSymbolCommand } from "./find-symbol.js";
export type { FindSymbolOptions, FindSymbolResult } from "./find-symbol.js";
export { depsCommand } from "./deps.js";
export type { DepsCommandOptions, DepsCommandResult } from "./deps.js";
export { dependentsCommand } from "./dependents.js";
export type {
  DependentsCommandOptions,
  DependentsCommandResult,
} from "./dependents.js";
export { fileSymbolsCommand } from "./file-symbols.js";
export type {
  FileSymbolsCommandOptions,
  FileSymbolsCommandResult,
} from "./file-symbols.js";
export { callGraphCommand } from "./call-graph.js";
export type {
  CallGraphCommandOptions,
  CallGraphCommandResult,
} from "./call-graph.js";

// Hub query commands
export { hubErrorsCommand } from "./hub-errors.js";
export type {
  HubErrorsCommandOptions,
  HubErrorsCommandResult,
} from "./hub-errors.js";
export { hubDiagnosticsCommand } from "./hub-diagnostics.js";
export type {
  HubDiagnosticsCommandOptions,
  HubDiagnosticsCommandResult,
} from "./hub-diagnostics.js";
export { hubSummaryCommand } from "./hub-summary.js";
export type {
  HubSummaryCommandOptions,
  HubSummaryCommandResult,
} from "./hub-summary.js";
export { hubQueryCommand } from "./hub-query.js";
export type { HubQueryOptions, HubQueryResult } from "./hub-query.js";

// Effects, Rules, C4 commands (v3.0 foundation)
export { effectsCommand, effectsSummaryCommand } from "./effects.js";
export type {
  EffectsCommandOptions,
  EffectsCommandResult,
  EffectsSummaryOptions,
  EffectsSummaryResult,
} from "./effects.js";
export {
  rulesRunCommand,
  rulesStatsCommand,
  rulesListCommand,
} from "./rules.js";
export type {
  RulesRunOptions,
  RulesRunResult,
  RulesListOptions,
  RulesListResult,
} from "./rules.js";
export {
  c4ContextCommand,
  c4ContainersCommand,
  c4DomainsCommand,
  c4ExternalsCommand,
} from "./c4.js";
export type {
  C4CommandOptions,
  C4ContextResult,
  C4ContainersResult,
  C4DomainsResult,
  C4ExternalsResult,
} from "./c4.js";

// Workflow commands (deterministic development operations)
export {
  checkChangesetCommand,
  checkDocsCommand,
  preCommitCommand,
  prepareShipCommand,
  diffSummaryCommand,
  installLocalCommand,
} from "./workflow/index.js";
export type {
  CheckChangesetOptions,
  CheckChangesetResult,
  CheckDocsOptions,
  CheckDocsResult,
  DocIssue,
  PreCommitOptions,
  PreCommitResult,
  PrepareShipOptions,
  PrepareShipResult,
  DiffSummaryOptions,
  DiffSummaryResult,
  InstallLocalOptions,
  InstallLocalResult,
} from "./workflow/index.js";

// Doctor command (system health checks)
export { doctorCommand } from "./doctor.js";
export type { DoctorOptions, DoctorResult } from "./doctor.js";

// Sync command (analyze + register workflow)
export { syncCommand } from "./sync.js";
export type { SyncOptions, SyncResult } from "./sync.js";

// Doc-sync command (documentation generation)
export { docSyncCommand } from "./doc-sync.js";
export type { DocSyncOptions, DocSyncResult, PackageSyncResult } from "./doc-sync.js";

// Architecture commands (improvement loop)
export {
  architectureStatusCommand,
  architectureScoreCommand,
  architectureDiffCommand,
} from "./architecture.js";
export type {
  ArchitectureOptions,
  ArchitectureStatusResult,
  ArchitectureScoreResult,
  ArchitectureDiffResult,
} from "./architecture.js";
