/**
 * DevAC Status Types (CLI Re-export)
 *
 * Re-exports status types from devac-core.
 * Core is the single source of truth for these types.
 *
 * @see @pietgk/devac-core/status for the canonical definitions
 */

export {
  // Core types
  type OutputLevel,
  type GroupBy,
  type StatusColor,
  type StatusCommandOptions,
  // Component output contracts
  type ContextOutput,
  type HealthOutput,
  type SeedsOutput,
  type DiagnosticsOutput,
  type WorkflowOutput,
  type NextOutput,
  // Constants
  STATUS_ICONS,
  STATUS_COLORS,
  // JSON schema
  type DevACStatusJSON,
} from "@pietgk/devac-core";
