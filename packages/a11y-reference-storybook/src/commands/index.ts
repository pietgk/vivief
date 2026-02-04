/**
 * CLI Commands
 *
 * All command registration functions are exported here.
 */

export { registerGenerateCommand } from "./generate.js";

// Re-export types
export type {
  CommandRegister,
  CommandResult,
  CommonOptions,
  GenerateOptions,
  AxeRuleMetadata,
  A11yReferenceMetadata,
  StoryEntry,
  RuleManifestEntry,
  A11yRuleManifest,
} from "./types.js";

export { formatOutput, printOutput, printError, printVerbose } from "./types.js";
