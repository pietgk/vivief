/**
 * Hub Diagnostics Command Implementation
 *
 * Queries unified diagnostics from the central hub.
 * Based on MCP get_all_diagnostics tool.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type DiagnosticsCategory,
  type DiagnosticsFilter,
  type DiagnosticsSeverity,
  type DiagnosticsSource,
  type UnifiedDiagnostics,
  createCentralHub,
} from "@pietgk/devac-core";
import { formatDiagnostics, formatOutput } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for hub-diagnostics command
 */
export interface HubDiagnosticsCommandOptions {
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by repository ID */
  repoId?: string;
  /** Filter by source(s) */
  source?: DiagnosticsSource | DiagnosticsSource[];
  /** Filter by severity level(s) */
  severity?: DiagnosticsSeverity | DiagnosticsSeverity[];
  /** Filter by category */
  category?: DiagnosticsCategory | DiagnosticsCategory[];
  /** Filter by file path (partial match) */
  filePath?: string;
  /** Filter by resolved status */
  resolved?: boolean;
  /** Filter by actionable status */
  actionable?: boolean;
  /** Maximum results */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from hub-diagnostics command
 */
export interface HubDiagnosticsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of diagnostic items found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Diagnostic items */
  diagnostics?: UnifiedDiagnostics[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run hub-diagnostics command
 */
export async function hubDiagnosticsCommand(
  options: HubDiagnosticsCommandOptions
): Promise<HubDiagnosticsCommandResult> {
  const startTime = Date.now();
  const hubDir = options.hubDir || getDefaultHubDir();
  const hub = createCentralHub({ hubDir, readOnly: true });

  try {
    await hub.init();

    const filter: DiagnosticsFilter = {
      repo_id: options.repoId,
      source: options.source,
      severity: options.severity,
      category: options.category,
      file_path: options.filePath,
      resolved: options.resolved,
      actionable: options.actionable,
      limit: options.limit,
    };

    const diagnostics = await hub.getDiagnostics(filter);

    const output = options.json
      ? formatOutput({ diagnostics, count: diagnostics.length }, { json: true })
      : formatDiagnostics(diagnostics, { json: false });

    return {
      success: true,
      output,
      count: diagnostics.length,
      timeMs: Date.now() - startTime,
      diagnostics,
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
