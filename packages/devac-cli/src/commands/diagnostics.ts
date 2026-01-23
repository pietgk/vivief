/**
 * Diagnostics Command
 *
 * Top-level command to query all diagnostics from the hub.
 *
 * @see docs/vision/concepts.md for the Four Pillars model
 */

import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import {
  type HubDiagnosticsCommandOptions,
  type HubDiagnosticsCommandResult,
  hubDiagnosticsCommand,
} from "./hub-diagnostics.js";

// Re-export types
export type DiagnosticsCommandOptions = HubDiagnosticsCommandOptions;
export type DiagnosticsCommandResult = HubDiagnosticsCommandResult;

/**
 * Run diagnostics command (delegates to hubDiagnosticsCommand)
 */
export async function diagnosticsCommand(
  options: DiagnosticsCommandOptions
): Promise<DiagnosticsCommandResult> {
  return hubDiagnosticsCommand(options);
}

/**
 * Register the diagnostics command
 */
export function registerDiagnosticsCommand(program: Command): void {
  program
    .command("diagnostics")
    .description("Query all diagnostics from the hub (validation + workflow)")
    .option("--repo <id>", "Filter by repository")
    .option(
      "--source <source>",
      "Filter by source (tsc, eslint, test, coverage, ci-check, github-issue, pr-review)"
    )
    .option("--severity <level>", "Filter by severity (critical, error, warning, suggestion, note)")
    .option("--category <cat>", "Filter by category (validation, workflow)")
    .option("--file <path>", "Filter by file path")
    .option("--resolved", "Show only resolved items")
    .option("--actionable", "Show only actionable items")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const hubDir = await getWorkspaceHubDir();
      const result = await diagnosticsCommand({
        hubDir,
        repoId: options.repo,
        source: options.source,
        severity: options.severity,
        category: options.category,
        filePath: options.file,
        resolved: options.resolved,
        actionable: options.actionable,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });
      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
