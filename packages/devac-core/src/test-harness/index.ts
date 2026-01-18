/**
 * Test Harness Module
 *
 * Provides utilities for integration and E2E testing of the validation system.
 * Used by devac-cli tests to verify validation behavior with real fixtures.
 */

// Hook output schema and validation
export {
  HookOutputSchema,
  HookSpecificOutputSchema,
  DiagnosticsCountsSchema,
  validateHookOutput,
  safeValidateHookOutput,
  extractReminderContent,
  parseDiagnosticsCounts,
  hasIssues,
  type HookOutput,
  type HookSpecificOutput,
  type DiagnosticsCounts,
} from "./hook-output-schema.js";

// Git simulator
export {
  GitSimulator,
  createGitSimulator,
  execGit,
  type GitCommandResult,
  type ChangedFiles,
} from "./git-simulator.js";

// Validation test harness
export {
  ValidationTestHarness,
  createValidationTestHarness,
  getDefaultFixturesBasePath,
  type WorkspaceContext,
  type CreateWorkspaceOptions,
  type ValidationRunOptions,
  type HookAssertionResult,
} from "./validation-harness.js";
