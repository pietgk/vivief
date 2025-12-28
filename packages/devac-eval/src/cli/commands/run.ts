/**
 * Run command - executes evaluations
 */

import { resolve } from "node:path";
import { loadBenchmark } from "../../benchmark/question-loader.js";
import { LLMJudge } from "../../judge/llm-judge.js";
import { calculateMetrics } from "../../judge/metrics.js";
import { EvalRunner } from "../../runner/eval-runner.js";
import { ResultWriter } from "../../storage/result-writer.js";
import type { EvalMode, RunConfig } from "../../types.js";

export interface RunCommandOptions {
  benchmark: string;
  modes: string;
  questions?: string;
  hub: string;
  model?: string;
  output: string;
  verbose?: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  const verbose = options.verbose ?? false;

  // Parse options
  const modes = options.modes.split(",").map((m) => m.trim()) as EvalMode[];
  const questionIds = options.questions?.split(",").map((q) => q.trim());
  const hubPath = options.hub.replace("~", process.env.HOME || "");
  const resultsDir = resolve(options.output);

  log(verbose, `Loading benchmark: ${options.benchmark}`);

  // Load benchmark
  const benchmark = await loadBenchmark(options.benchmark);
  log(verbose, `Loaded ${benchmark.questions.length} questions`);

  // Build run config (using Claude CLI for all LLM calls)
  const config: RunConfig = {
    modes,
    questionIds,
    responseModel: options.model ?? "claude-cli",
    judgeModel: options.model ?? "claude-cli",
    hubPath,
    model: options.model,
  };

  // Track timing for estimates
  let stepStartTime = Date.now();
  let stepCount = 0;
  let totalElapsed = 0;

  // Create runner
  const runner = new EvalRunner({
    onProgress: (event) => {
      if (event.type === "start") {
        console.log(`\nStarting evaluation: ${event.message}`);
        console.log(`Estimated time: ~${event.total * 1.5} minutes (1-2 min per evaluation)\n`);
        stepStartTime = Date.now();
      } else if (event.type === "question") {
        // Calculate timing
        const now = Date.now();
        if (stepCount > 0) {
          const stepTime = now - stepStartTime;
          totalElapsed += stepTime;
          const avgTime = totalElapsed / stepCount;
          const remaining = (event.total - event.current) * avgTime;
          const remainingMin = Math.ceil(remaining / 60000);
          process.stdout.write(
            `\n[${event.current}/${event.total}] ${event.message} (avg: ${Math.round(avgTime / 1000)}s, ~${remainingMin}min left)`
          );
        } else {
          process.stdout.write(`\n[${event.current}/${event.total}] ${event.message}`);
        }
        stepStartTime = now;
        stepCount++;
      } else if (event.type === "complete") {
        const finalTime = Math.round((Date.now() - stepStartTime + totalElapsed) / 1000);
        console.log(`\n\n✓ ${event.message} (total: ${finalTime}s)`);
      } else if (event.type === "error") {
        console.error(`\n\n✗ Error: ${event.message}`);
      }
    },
    onLog: (message) => {
      if (verbose) {
        console.log(`  ${message}`);
      }
    },
  });

  // Run evaluation
  console.log(`\nRunning evaluation on benchmark: ${benchmark.name}`);
  console.log(`Modes: ${modes.join(", ")}`);
  console.log(`Questions: ${questionIds?.length ?? benchmark.questions.length}`);
  console.log("Using Claude CLI for LLM calls");

  const run = await runner.run(benchmark, config);

  if (run.status === "failed") {
    console.error(`\nEvaluation failed: ${run.error}`);
    process.exit(1);
  }

  // Judge responses
  console.log("\nJudging responses...");
  const judge = new LLMJudge();

  const questions = new Map(benchmark.questions.map((q) => [q.id, q]));
  const { pointwiseScores, pairwiseResults } = await judge.judgeRun(
    run,
    questions,
    (current, total, message) => {
      const percent = Math.round((current / total) * 100);
      process.stdout.write(`\r[${percent}%] ${message}          `);
    }
  );

  process.stdout.write("\n");

  // Update run with scores
  run.pointwiseScores = pointwiseScores;
  run.pairwiseResults = pairwiseResults;
  run.summary = calculateMetrics(run);

  // Save results
  console.log("\nSaving results...");
  const writer = new ResultWriter({ resultsDir });
  const runDir = await writer.saveRun(run);

  // Print summary
  console.log(`\n${"=".repeat(50)}`);
  console.log("EVALUATION COMPLETE");
  console.log("=".repeat(50));
  console.log(`\nRun ID: ${run.id}`);
  console.log(`Saved to: ${runDir}`);

  if (run.summary) {
    const { summary } = run;
    const total = summary.enhancedWins + summary.baselineWins + summary.ties;
    const winRate = total > 0 ? (summary.enhancedWins / total) * 100 : 0;

    console.log("\nResults:");
    console.log(`  Total questions: ${summary.totalQuestions}`);
    console.log(`  Enhanced wins: ${summary.enhancedWins}`);
    console.log(`  Baseline wins: ${summary.baselineWins}`);
    console.log(`  Ties: ${summary.ties}`);
    console.log(`  Win rate: ${winRate.toFixed(1)}%`);

    console.log("\nDimension deltas (enhanced - baseline):");
    console.log(`  Correctness: ${formatDelta(summary.deltas.correctness)}`);
    console.log(`  Completeness: ${formatDelta(summary.deltas.completeness)}`);
    console.log(`  Hallucination: ${formatDelta(summary.deltas.hallucination)}`);
    console.log(`  Comprehensibility: ${formatDelta(summary.deltas.comprehensibility)}`);
  }

  console.log(`\nRun 'devac-eval report ${run.id.slice(0, 8)}' for detailed report`);
}

function log(verbose: boolean, message: string): void {
  if (verbose) {
    console.log(message);
  }
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}
