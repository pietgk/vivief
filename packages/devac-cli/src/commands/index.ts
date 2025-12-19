/**
 * CLI Commands Index
 *
 * Re-exports all CLI command implementations.
 */

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
  contextReviewCommand,
  processReviewResponse,
} from "./context.js";
export type {
  ContextOptions,
  ContextResult,
  ContextCIOptions,
  ContextCIResult,
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
