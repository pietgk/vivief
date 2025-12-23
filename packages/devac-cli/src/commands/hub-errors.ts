/**
 * Hub Errors Command Implementation
 *
 * Queries validation errors from the central hub.
 * Based on MCP get_validation_errors tool.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type ValidationError, type ValidationFilter, createCentralHub } from "@pietgk/devac-core";
import { formatOutput, formatValidationIssues } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for hub-errors command
 */
export interface HubErrorsCommandOptions {
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by repository ID */
  repoId?: string;
  /** Filter by severity (error, warning) */
  severity?: "error" | "warning";
  /** Filter by source (tsc, eslint, test) */
  source?: "tsc" | "eslint" | "test";
  /** Filter by file path */
  file?: string;
  /** Maximum results */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from hub-errors command
 */
export interface HubErrorsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of errors found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Validation errors */
  errors?: ValidationError[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run hub-errors command
 */
export async function hubErrorsCommand(
  options: HubErrorsCommandOptions
): Promise<HubErrorsCommandResult> {
  const startTime = Date.now();
  const hubDir = options.hubDir || getDefaultHubDir();
  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();

    const filter: ValidationFilter = {
      repo_id: options.repoId,
      severity: options.severity,
      source: options.source,
      file: options.file,
      limit: options.limit,
    };

    const errors = await hub.getValidationErrors(filter);

    // Convert to ValidationIssue format for formatting
    const issues = errors.map((e) => ({
      file: e.file,
      line: e.line,
      column: e.column,
      message: e.message,
      severity: e.severity,
      source: e.source,
      code: e.code || undefined,
    }));

    const output = options.json
      ? formatOutput({ errors, count: errors.length }, { json: true })
      : formatValidationIssues(issues, { json: false });

    return {
      success: true,
      output,
      count: errors.length,
      timeMs: Date.now() - startTime,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      count: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    await hub.close();
  }
}
