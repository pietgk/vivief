/**
 * DevAC Status Module
 *
 * Exports all status-related types for CLI and MCP consumption.
 * This module is the single source of truth for status output types.
 */

// Core types
export type {
  OutputLevel,
  GroupBy,
  StatusColor,
  StatusCommandOptions,
  ContextOutput,
  HealthOutput,
  SeedsOutput,
  DiagnosticsOutput,
  WorkflowOutput,
  NextOutput,
} from "./types.js";

// Constants
export { STATUS_ICONS, STATUS_COLORS } from "./types.js";

// JSON schema
export type { DevACStatusJSON } from "./json-schema.js";
