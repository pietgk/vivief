/**
 * CLI Command Types
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
