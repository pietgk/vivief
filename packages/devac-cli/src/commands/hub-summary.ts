/**
 * Hub Summary Command Implementation
 *
 * Gets summary/counts of validation errors and feedback from the central hub.
 * Based on MCP get_validation_summary and get_feedback_summary tools.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type FeedbackSummary, type ValidationSummary, createCentralHub } from "@pietgk/devac-core";
import { formatOutput, formatSummary } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for hub-summary command
 */
export interface HubSummaryCommandOptions {
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Summary type: validation, feedback, or counts */
  type: "validation" | "feedback" | "counts";
  /** Group by field (for validation/feedback) */
  groupBy?: "repo" | "file" | "source" | "severity" | "category";
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from hub-summary command
 */
export interface HubSummaryCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Validation summary data */
  validationSummary?: ValidationSummary[];
  /** Feedback summary data */
  feedbackSummary?: FeedbackSummary[];
  /** Counts data */
  counts?: {
    validation?: { errors: number; warnings: number; total: number };
    feedback?: {
      critical: number;
      error: number;
      warning: number;
      suggestion: number;
      note: number;
      total: number;
    };
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Run hub-summary command
 */
export async function hubSummaryCommand(
  options: HubSummaryCommandOptions
): Promise<HubSummaryCommandResult> {
  const startTime = Date.now();
  const hubDir = options.hubDir || getDefaultHubDir();
  const hub = createCentralHub({ hubDir });

  try {
    await hub.init();

    let output: string;
    const result: Partial<HubSummaryCommandResult> = {};

    if (options.type === "validation") {
      const groupBy = (options.groupBy || "source") as "repo" | "file" | "source" | "severity";
      const summary = await hub.getValidationSummary(groupBy);
      result.validationSummary = summary;

      if (options.json) {
        output = formatOutput({ summary }, { json: true });
      } else {
        const lines = [`Validation Summary (grouped by ${groupBy}):`];
        lines.push("-".repeat(40));
        for (const item of summary) {
          lines.push(
            `  ${item.group_key}: ${item.error_count} errors, ${item.warning_count} warnings`
          );
        }
        output = lines.join("\n");
      }
    } else if (options.type === "feedback") {
      const groupBy = (options.groupBy || "source") as "repo" | "source" | "severity" | "category";
      const summary = await hub.getFeedbackSummary(groupBy);
      result.feedbackSummary = summary;

      if (options.json) {
        output = formatOutput({ summary }, { json: true });
      } else {
        const lines = [`Feedback Summary (grouped by ${groupBy}):`];
        lines.push("-".repeat(40));
        for (const item of summary) {
          const details = [];
          if (item.critical_count > 0) details.push(`${item.critical_count} critical`);
          if (item.error_count > 0) details.push(`${item.error_count} errors`);
          if (item.warning_count > 0) details.push(`${item.warning_count} warnings`);
          if (item.suggestion_count > 0) details.push(`${item.suggestion_count} suggestions`);
          if (item.note_count > 0) details.push(`${item.note_count} notes`);
          lines.push(`  ${item.group_key}: ${details.join(", ") || "0 items"}`);
        }
        output = lines.join("\n");
      }
    } else {
      // counts mode
      const validationCounts = await hub.getValidationCounts();
      const feedbackCounts = await hub.getFeedbackCounts();
      result.counts = {
        validation: validationCounts,
        feedback: feedbackCounts,
      };

      if (options.json) {
        output = formatOutput(
          { validation: validationCounts, feedback: feedbackCounts },
          { json: true }
        );
      } else {
        const counts = [
          {
            label: "Validation Errors",
            count: validationCounts.errors,
            icon: "❌",
          },
          {
            label: "Validation Warnings",
            count: validationCounts.warnings,
            icon: "⚠️",
          },
          {
            label: "Feedback Critical",
            count: feedbackCounts.critical,
            icon: "🔴",
          },
          { label: "Feedback Errors", count: feedbackCounts.error, icon: "❌" },
          {
            label: "Feedback Warnings",
            count: feedbackCounts.warning,
            icon: "⚠️",
          },
          {
            label: "Feedback Suggestions",
            count: feedbackCounts.suggestion,
            icon: "💡",
          },
          { label: "Feedback Notes", count: feedbackCounts.note, icon: "📝" },
        ];
        output = formatSummary(counts, { json: false });
      }
    }

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      ...result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    await hub.close();
  }
}
