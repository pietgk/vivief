/**
 * CLI Command Types for a11y-reference-storybook
 */

import type { Command } from "commander";

/**
 * Command registration function type
 */
export type CommandRegister = (program: Command) => void;

/**
 * Common command result
 */
export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Output format options
 */
export type OutputFormat = "text" | "json";

/**
 * Common options for commands
 */
export interface CommonOptions {
  json?: boolean;
  verbose?: boolean;
}

/**
 * Options for the generate command
 */
export interface GenerateOptions extends CommonOptions {
  output?: string;
  wcagLevels?: string;
  dryRun?: boolean;
  force?: boolean;
}

/**
 * Axe-core rule metadata
 */
export interface AxeRuleMetadata {
  ruleId: string;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  impact?: "critical" | "serious" | "moderate" | "minor";
  wcag?: string[];
}

/**
 * Story metadata for a11y reference
 */
export interface A11yReferenceMetadata {
  ruleId: string;
  expectedViolations: string[];
  wcag: string[];
  impact: string;
  helpUrl: string;
}

/**
 * Story entry in the manifest
 */
export interface StoryEntry {
  name: string;
  shouldViolate: boolean;
  description?: string;
}

/**
 * Rule entry in the manifest
 */
export interface RuleManifestEntry {
  ruleId: string;
  description: string;
  wcag: string[];
  impact: string;
  helpUrl: string;
  category: "component" | "page";
  stories: {
    violations: string[];
    passes: string[];
  };
}

/**
 * Generated manifest format
 */
export interface A11yRuleManifest {
  generatedAt: string;
  axeCoreVersion: string;
  rules: RuleManifestEntry[];
  summary: {
    totalRules: number;
    componentLevel: number;
    pageLevel: number;
    storiesGenerated: number;
  };
}

/**
 * Format output based on options
 */
export function formatOutput(data: unknown, options?: CommonOptions): string {
  if (options?.json) {
    return JSON.stringify(data, null, 2);
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data === "object" && data !== null) {
    return JSON.stringify(data, null, 2);
  }

  return String(data);
}

/**
 * Print output to console
 */
export function printOutput(data: unknown, options?: CommonOptions): void {
  console.log(formatOutput(data, options));
}

/**
 * Print error to console
 */
export function printError(message: string): void {
  console.error(`Error: ${message}`);
}

/**
 * Print verbose message if verbose mode is enabled
 */
export function printVerbose(message: string, options?: CommonOptions): void {
  if (options?.verbose) {
    console.log(`[verbose] ${message}`);
  }
}
