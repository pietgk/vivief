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
  // Unified Diagnostics types
  type UnifiedDiagnostics,
  type DiagnosticsFilter,
  type DiagnosticsSummary,
  type DiagnosticsSource,
  type DiagnosticsSeverity,
  type DiagnosticsCategory,
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
  type M2MConnection,
  type M2MQueryResult,
} from "./central-hub.js";

export {
  AffectedAnalyzer,
  createAffectedAnalyzer,
  type AnalyzeOptions,
  type AffectedResult,
  type AffectedRepo,
} from "./affected-analyzer.js";

// IPC Protocol
export {
  HUB_SOCKET_NAME,
  IPC_TIMEOUT_MS,
  IPC_CONNECT_TIMEOUT_MS,
  getSocketPath,
  type HubMethod,
  type HubRequest,
  type HubResponse,
  type HubError,
  HubErrorCode,
} from "./ipc-protocol.js";

// Hub Server (for MCP)
export {
  HubServer,
  createHubServer,
  type HubServerOptions,
  type HubServerEvents,
} from "./hub-server.js";

// Hub Client (for CLI)
export { HubClient, createHubClient, type HubClientOptions, type HubLike } from "./hub-client.js";
