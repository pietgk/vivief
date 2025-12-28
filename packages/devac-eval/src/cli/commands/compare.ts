/**
 * Compare command - compares two evaluation runs
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ComparisonReporter } from "../../reporter/comparison-reporter.js";
import type { ReportFormat } from "../../reporter/summary-reporter.js";
import { ResultReader } from "../../storage/result-reader.js";

export interface CompareCommandOptions {
  format: string;
  output?: string;
  resultsDir: string;
}

export async function compareCommand(
  runId1: string,
  runId2: string,
  options: CompareCommandOptions
): Promise<void> {
  const resultsDir = resolve(options.resultsDir);
  const format = options.format as ReportFormat;

  const reader = new ResultReader({ resultsDir });

  // Load both runs
  let run1: Awaited<ReturnType<typeof reader.loadRun>> | undefined;
  let run2: Awaited<ReturnType<typeof reader.loadRun>> | undefined;
  try {
    run1 = await reader.loadRun(runId1);
  } catch (_error) {
    console.error(`Error: Could not find run '${runId1}'`);
    process.exit(1);
  }

  try {
    run2 = await reader.loadRun(runId2);
  } catch (_error) {
    console.error(`Error: Could not find run '${runId2}'`);
    process.exit(1);
  }

  if (!run1.summary || !run2.summary) {
    console.error("Error: Both runs must have summaries.");
    process.exit(1);
  }

  // Generate comparison
  const reporter = new ComparisonReporter({ format });
  const report = reporter.compare(run1, run2);

  // Output
  if (options.output) {
    const outputPath = resolve(options.output);
    await writeFile(outputPath, report);
    console.log(`Comparison saved to: ${outputPath}`);
  } else {
    console.log(report);
  }
}
