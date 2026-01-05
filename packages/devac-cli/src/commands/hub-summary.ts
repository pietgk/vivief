/**
 * Hub Summary Command Implementation
 *
 * Gets summary/counts of validation errors and diagnostics from the central hub.
 * Based on MCP get_validation_summary and get_diagnostics_summary tools.
 */

import {
  type DiagnosticsSummary,
  type ValidationSummary,
  createHubClient,
} from "@pietgk/devac-core";
import { formatOutput, formatSummary } from "./output-formatter.js";

/**
 * Options for hub-summary command
 */
export interface HubSummaryCommandOptions {
  /** Hub directory (required - from workspace) */
  hubDir: string;
  /** Summary type: validation, diagnostics, or counts */
  type: "validation" | "diagnostics" | "counts";
  /** Group by field (for validation/diagnostics) */
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
  /** Diagnostics summary data */
  diagnosticsSummary?: DiagnosticsSummary[];
  /** Counts data */
  counts?: {
    validation?: { errors: number; warnings: number; total: number };
    diagnostics?: {
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
  // Use HubClient (delegates to MCP if running, otherwise direct access)
  const client = createHubClient({ hubDir: options.hubDir });

  try {
    let output: string;
    const result: Partial<HubSummaryCommandResult> = {};

    if (options.type === "validation") {
      const groupBy = (options.groupBy || "source") as "repo" | "file" | "source" | "severity";
      const summary = await client.getValidationSummary(groupBy);
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
    } else if (options.type === "diagnostics") {
      const groupBy = (options.groupBy || "source") as "repo" | "source" | "severity" | "category";
      const summary = await client.getDiagnosticsSummary(groupBy);
      result.diagnosticsSummary = summary;

      if (options.json) {
        output = formatOutput({ summary }, { json: true });
      } else {
        const lines = [`Diagnostics Summary (grouped by ${groupBy}):`];
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
      const validationCounts = await client.getValidationCounts();
      const diagnosticsCounts = await client.getDiagnosticsCounts();
      result.counts = {
        validation: validationCounts,
        diagnostics: diagnosticsCounts,
      };

      if (options.json) {
        output = formatOutput(
          { validation: validationCounts, diagnostics: diagnosticsCounts },
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
            label: "Diagnostics Critical",
            count: diagnosticsCounts.critical,
            icon: "🔴",
          },
          {
            label: "Diagnostics Errors",
            count: diagnosticsCounts.error,
            icon: "❌",
          },
          {
            label: "Diagnostics Warnings",
            count: diagnosticsCounts.warning,
            icon: "⚠️",
          },
          {
            label: "Diagnostics Suggestions",
            count: diagnosticsCounts.suggestion,
            icon: "💡",
          },
          {
            label: "Diagnostics Notes",
            count: diagnosticsCounts.note,
            icon: "📝",
          },
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
  }
}
