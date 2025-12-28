/**
 * List command - lists benchmarks, questions, or runs
 */

import { resolve } from "node:path";
import { listBenchmarks, loadBenchmark } from "../../benchmark/question-loader.js";
import { ResultReader } from "../../storage/result-reader.js";

export interface ListCommandOptions {
  benchmark?: string;
  limit: string;
  resultsDir: string;
}

export async function listCommand(type: string, options: ListCommandOptions): Promise<void> {
  const limit = Number.parseInt(options.limit, 10);

  switch (type) {
    case "benchmarks":
      await listBenchmarksCmd();
      break;
    case "questions":
      await listQuestionsCmd(options.benchmark, limit);
      break;
    case "runs":
      await listRunsCmd(options.resultsDir, limit);
      break;
    default:
      console.error(`Unknown type: ${type}`);
      console.error("Valid types: benchmarks, questions, runs");
      process.exit(1);
  }
}

async function listBenchmarksCmd(): Promise<void> {
  const benchmarks = await listBenchmarks();

  if (benchmarks.length === 0) {
    console.log("No benchmarks found.");
    return;
  }

  console.log("\nAvailable Benchmarks:\n");
  console.log(`${"ID".padEnd(20) + "Name".padEnd(30)}Questions`);
  console.log("-".repeat(60));

  for (const b of benchmarks) {
    console.log(b.id.padEnd(20) + b.name.slice(0, 28).padEnd(30) + b.questionCount.toString());
  }

  console.log();
}

async function listQuestionsCmd(benchmarkId?: string, limit?: number): Promise<void> {
  if (!benchmarkId) {
    console.error("Error: --benchmark is required for listing questions");
    process.exit(1);
  }

  let benchmark: Awaited<ReturnType<typeof loadBenchmark>> | undefined;
  try {
    benchmark = await loadBenchmark(benchmarkId);
  } catch (_error) {
    console.error(`Error: Could not find benchmark '${benchmarkId}'`);
    process.exit(1);
  }

  console.log(`\nQuestions in ${benchmark.name}:\n`);
  console.log(`${"ID".padEnd(15) + "Title".padEnd(35) + "Category".padEnd(15)}Difficulty`);
  console.log("-".repeat(75));

  const questions = limit ? benchmark.questions.slice(0, limit) : benchmark.questions;

  for (const q of questions) {
    console.log(
      q.id.padEnd(15) + q.title.slice(0, 33).padEnd(35) + q.category.padEnd(15) + q.difficulty
    );
  }

  if (limit && benchmark.questions.length > limit) {
    console.log(`\n... and ${benchmark.questions.length - limit} more`);
  }

  console.log();
}

async function listRunsCmd(resultsDir: string, limit: number): Promise<void> {
  const reader = new ResultReader({ resultsDir: resolve(resultsDir) });
  const runs = await reader.listRuns(limit);

  if (runs.length === 0) {
    console.log("No evaluation runs found.");
    console.log(`Results directory: ${resolve(resultsDir)}`);
    return;
  }

  console.log("\nRecent Evaluation Runs:\n");
  console.log(
    `${"ID".padEnd(12) + "Benchmark".padEnd(15) + "Date".padEnd(12) + "Status".padEnd(12)}Win Rate`
  );
  console.log("-".repeat(65));

  for (const run of runs) {
    const winRate =
      run.enhancedWinRate !== undefined ? `${(run.enhancedWinRate * 100).toFixed(1)}%` : "-";

    const dateStr = run.startedAt.split("T")[0] ?? run.startedAt.slice(0, 10);

    console.log(
      run.id.slice(0, 8).padEnd(12) +
        run.benchmarkId.slice(0, 13).padEnd(15) +
        dateStr.padEnd(12) +
        run.status.padEnd(12) +
        winRate
    );
  }

  console.log();
}
