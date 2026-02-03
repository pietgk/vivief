/**
 * Scan Storybook Command
 *
 * Scans Storybook stories for accessibility violations using axe-core.
 *
 * Usage:
 *   browser scan-storybook [options]
 *
 * Options:
 *   -u, --url <url>           Storybook URL (default: http://localhost:6006)
 *   -w, --workers <n>         Parallel workers (default: 4)
 *   -t, --timeout <ms>        Timeout per story (default: 30000)
 *   --wcag <level>            WCAG level: wcag2a, wcag2aa, wcag21aa (default: wcag21aa)
 *   --filter <pattern>        Filter stories by title pattern
 *   --exclude-tags <tags>     Skip stories with these tags (comma-separated)
 *   --headed                  Run browser in headed mode
 *   --json                    Output as JSON
 *   --no-hub                  Skip pushing results to hub
 *   --repo-id <id>            Repository ID (auto-detected from git)
 */

import type { Command } from "commander";
import { detectRepoId, pushResultsToHub } from "./scan-storybook/hub-writer.js";
import { calculateSummary, scanStoriesInParallel } from "./scan-storybook/parallel-scanner.js";
import {
  fetchStoryIndex,
  filterStories,
  parseTagsString,
} from "./scan-storybook/story-discovery.js";
import type { ScanOutput, ScanStorybookOptions, WcagCliLevel } from "./scan-storybook/types.js";
import type { CommandRegister } from "./types.js";
import { printError, printOutput } from "./types.js";

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Print human-readable summary to console
 */
function printTextSummary(output: ScanOutput): void {
  const { summary } = output;

  console.log("\nAccessibility Scan Complete");
  console.log("============================");
  const skippedText = summary.skippedStories > 0 ? ` (${summary.skippedStories} skipped)` : "";
  console.log(`Stories: ${summary.scannedStories}/${summary.totalStories} scanned${skippedText}`);

  const passRate =
    summary.scannedStories > 0
      ? ((summary.passedStories / summary.scannedStories) * 100).toFixed(1)
      : "0.0";
  console.log(`Pass Rate: ${passRate}%`);

  if (summary.errorStories > 0) {
    console.log(`Errors: ${summary.errorStories} stories failed to scan`);
  }

  console.log("");
  console.log(`Violations: ${summary.totalViolations}`);
  if (summary.totalViolations > 0) {
    console.log(`  Critical: ${summary.criticalCount}`);
    console.log(`  Serious:  ${summary.seriousCount}`);
    console.log(`  Moderate: ${summary.moderateCount}`);
    console.log(`  Minor:    ${summary.minorCount}`);
  }

  console.log("");
  console.log(`Time: ${formatDuration(summary.totalTimeMs)}`);

  if (summary.topIssues.length > 0) {
    console.log("");
    console.log("Top Issues:");
    for (const issue of summary.topIssues.slice(0, 5)) {
      console.log(`  - ${issue.ruleId}: ${issue.count}`);
    }
  }

  if (output.hubPush) {
    console.log("");
    console.log(`Hub: Pushed ${output.hubPush.pushed} diagnostics to ${output.hubPush.repoId}`);
  }
}

/**
 * Register the scan-storybook command
 */
export const registerScanStorybookCommand: CommandRegister = (program: Command) => {
  program
    .command("scan-storybook")
    .description("Scan Storybook stories for accessibility violations")
    .option("-u, --url <url>", "Storybook URL", "http://localhost:6006")
    .option("-w, --workers <n>", "Number of parallel workers", "4")
    .option("-t, --timeout <ms>", "Timeout per story in milliseconds", "30000")
    .option("--wcag <level>", "WCAG conformance level (wcag2a, wcag2aa, wcag21aa)", "wcag21aa")
    .option("--filter <pattern>", "Filter stories by title pattern")
    .option("--exclude-tags <tags>", "Skip stories with these tags (comma-separated)")
    .option("--headed", "Run browser in headed mode", false)
    .option("--json", "Output as JSON", false)
    .option("--no-hub", "Skip pushing results to hub")
    .option("--repo-id <id>", "Repository ID (auto-detected from git)")
    .action(async (rawOptions) => {
      try {
        // Parse and validate options
        const options: ScanStorybookOptions = {
          url: rawOptions.url,
          workers: Number.parseInt(rawOptions.workers, 10),
          timeout: Number.parseInt(rawOptions.timeout, 10),
          wcag: rawOptions.wcag as WcagCliLevel,
          filter: rawOptions.filter,
          excludeTags: rawOptions.excludeTags,
          headed: rawOptions.headed,
          json: rawOptions.json,
          hub: rawOptions.hub !== false, // --no-hub sets this to false
          repoId: rawOptions.repoId,
        };

        // Validate workers and timeout
        if (Number.isNaN(options.workers) || options.workers < 1) {
          throw new Error("Workers must be a positive number");
        }
        if (Number.isNaN(options.timeout) || options.timeout < 1000) {
          throw new Error("Timeout must be at least 1000ms");
        }

        // Validate WCAG level
        if (!["wcag2a", "wcag2aa", "wcag21aa"].includes(options.wcag)) {
          throw new Error("WCAG level must be one of: wcag2a, wcag2aa, wcag21aa");
        }

        // Show progress in non-JSON mode
        const showProgress = !options.json;
        if (showProgress) {
          console.log(`Connecting to Storybook at ${options.url}...`);
        }

        // Fetch story index
        const allStories = await fetchStoryIndex(options.url);
        if (showProgress) {
          console.log(`Found ${allStories.length} stories`);
        }

        // Filter stories
        const excludeTags = parseTagsString(options.excludeTags);
        const { included: storiesToScan, excluded: skippedStories } = filterStories(
          allStories,
          options.filter,
          excludeTags
        );

        if (storiesToScan.length === 0) {
          if (showProgress) {
            console.log("No stories to scan after filtering");
          }
          return;
        }

        if (showProgress) {
          const skippedMsg = skippedStories.length > 0 ? ` (${skippedStories.length} skipped)` : "";
          console.log(`Scanning ${storiesToScan.length} stories${skippedMsg}...`);
        }

        // Scan stories
        const startTime = Date.now();
        const results = await scanStoriesInParallel(
          storiesToScan,
          {
            workers: options.workers,
            timeout: options.timeout,
            wcag: options.wcag,
            headed: options.headed,
            storybookUrl: options.url,
          },
          showProgress
            ? (completed, total, current) => {
                const currentText = current ? ` - ${current}` : "";
                process.stdout.write(`\rScanning: ${completed}/${total}${currentText}          `);
              }
            : undefined
        );

        if (showProgress) {
          process.stdout.write("\r"); // Clear progress line
        }

        const totalTimeMs = Date.now() - startTime;

        // Calculate summary
        const summary = calculateSummary(results, skippedStories.length, totalTimeMs);

        // Build output
        const output: ScanOutput = {
          summary,
          results,
        };

        // Push to hub if enabled
        if (options.hub) {
          const repoId = options.repoId || (await detectRepoId());
          if (repoId) {
            try {
              const { pushed } = await pushResultsToHub(results, { repoId });
              output.hubPush = { pushed, repoId };
            } catch (hubError) {
              if (showProgress) {
                const message = hubError instanceof Error ? hubError.message : String(hubError);
                console.warn(`Warning: Failed to push to hub: ${message}`);
              }
            }
          } else if (showProgress) {
            console.warn("Warning: Could not detect repository ID. Use --repo-id to specify.");
          }
        }

        // Output results
        if (options.json) {
          printOutput(output, { json: true });
        } else {
          printTextSummary(output);
        }

        // Exit with error code if violations found
        if (summary.totalViolations > 0) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(message);
        process.exit(1);
      }
    });
};
