/**
 * Hub Feedback Command Implementation
 *
 * Queries unified feedback from the central hub.
 * Based on MCP get_all_feedback tool.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type FeedbackCategory,
  type FeedbackFilter,
  type FeedbackSeverity,
  type FeedbackSource,
  type UnifiedFeedback,
  createCentralHub,
} from "@pietgk/devac-core";
import { formatFeedback, formatOutput } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for hub-feedback command
 */
export interface HubFeedbackCommandOptions {
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by repository ID */
  repoId?: string;
  /** Filter by source(s) */
  source?: FeedbackSource | FeedbackSource[];
  /** Filter by severity level(s) */
  severity?: FeedbackSeverity | FeedbackSeverity[];
  /** Filter by category */
  category?: FeedbackCategory | FeedbackCategory[];
  /** Filter by file path (partial match) */
  filePath?: string;
  /** Filter by resolved status */
  resolved?: boolean;
  /** Filter by actionable status */
  actionable?: boolean;
  /** Maximum results */
  limit?: number;
  /** Output in human-readable format */
  pretty?: boolean;
}

/**
 * Result from hub-feedback command
 */
export interface HubFeedbackCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of feedback items found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Feedback items */
  feedback?: UnifiedFeedback[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run hub-feedback command
 */
export async function hubFeedbackCommand(
  options: HubFeedbackCommandOptions
): Promise<HubFeedbackCommandResult> {
  const startTime = Date.now();
  const hubDir = options.hubDir || getDefaultHubDir();
  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();

    const filter: FeedbackFilter = {
      repo_id: options.repoId,
      source: options.source,
      severity: options.severity,
      category: options.category,
      file_path: options.filePath,
      resolved: options.resolved,
      actionable: options.actionable,
      limit: options.limit,
    };

    const feedback = await hub.getFeedback(filter);

    const output = options.pretty
      ? formatFeedback(feedback, { pretty: true })
      : formatOutput({ feedback, count: feedback.length }, { pretty: false });

    return {
      success: true,
      output,
      count: feedback.length,
      timeMs: Date.now() - startTime,
      feedback,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.pretty
      ? `Error: ${errorMessage}`
      : formatOutput({ success: false, error: errorMessage }, { pretty: false });

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
