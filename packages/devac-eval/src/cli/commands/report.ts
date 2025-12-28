/**
 * Report command - generates reports from evaluation runs
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ReportFormat, SummaryReporter } from "../../reporter/summary-reporter.js";
import { ResultReader } from "../../storage/result-reader.js";

export interface ReportCommandOptions {
  format: string;
  output?: string;
  resultsDir: string;
}

export async function reportCommand(runId: string, options: ReportCommandOptions): Promise<void> {
  const resultsDir = resolve(options.resultsDir);
  const format = options.format as ReportFormat;

  // Load run
  const reader = new ResultReader({ resultsDir });

  let run: Awaited<ReturnType<typeof reader.loadRun>> | undefined;
  try {
    run = await reader.loadRun(runId);
  } catch (_error) {
    console.error(`Error: Could not find run '${runId}'`);
    console.error(`Make sure the run ID is correct and results are in ${resultsDir}`);
    process.exit(1);
  }

  if (!run.summary) {
    console.error("Error: Run has no summary. It may not have completed successfully.");
    process.exit(1);
  }

  // Generate report
  const reporter = new SummaryReporter({ format });
  const report = reporter.generate(run);

  // Output
  if (options.output) {
    const outputPath = resolve(options.output);
    await writeFile(outputPath, report);
    console.log(`Report saved to: ${outputPath}`);
  } else {
    console.log(report);
  }
}
