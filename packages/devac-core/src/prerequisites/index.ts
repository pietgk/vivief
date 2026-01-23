/**
 * Prerequisites Module
 *
 * Provides unified prerequisite checking for DevAC commands.
 * This is a thin composition layer that reuses existing functions
 * and adds only truly new checks.
 *
 * @example
 * ```typescript
 * import { checkSyncPrerequisites, formatPrerequisiteError } from "@pietgk/devac-core";
 *
 * const readiness = await checkSyncPrerequisites();
 * if (!readiness.ready) {
 *   console.error(formatPrerequisiteError("sync", readiness));
 *   process.exit(1);
 * }
 * ```
 */

// Types
export type {
  SystemState,
  PrerequisiteCategory,
  PrerequisiteCheck,
  ReadinessCommand,
  CommandReadiness,
  ReadinessOutput,
  FormatErrorOptions,
} from "./types.js";

// Checker functions
export {
  checkSyncPrerequisites,
  checkQueryPrerequisites,
  checkStatusPrerequisites,
  getReadinessForStatus,
  formatPrerequisiteError,
} from "./checker.js";

// Environment checks (exported for testing and advanced use)
export {
  checkHasSourceFiles,
  checkNodeVersion,
  checkHubNotLocked,
  checkHubExists,
} from "./environment.js";
