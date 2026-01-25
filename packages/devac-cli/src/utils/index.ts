/**
 * CLI Utilities
 */

export { displayCommandResult, success, error } from "./cli-output.js";
export type { CommandResult } from "./cli-output.js";

export { findWorkspaceDir, getWorkspaceHubDir } from "./workspace-discovery.js";

export {
  promptForRecovery,
  applyFixesWithProgress,
  warnNonInteractive,
} from "./recovery-prompt.js";
