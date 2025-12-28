/**
 * Evaluation Runner - orchestrates the complete evaluation pipeline
 */

import { randomUUID } from "node:crypto";
import type {
  BenchmarkSet,
  EvalMode,
  EvalQuestion,
  EvalResponse,
  EvalRun,
  RunConfig,
} from "../types.js";
import { ClaudeCLIExecutor } from "./claude-cli-executor.js";
import { ResponseCollector } from "./response-collector.js";

export interface EvalRunnerOptions {
  /** Callback for progress updates */
  onProgress?: (event: ProgressEvent) => void;
  /** Callback for verbose logging */
  onLog?: (message: string) => void;
}

export interface ProgressEvent {
  type: "start" | "question" | "mode" | "complete" | "error";
  current: number;
  total: number;
  questionId?: string;
  mode?: EvalMode;
  message?: string;
}

/**
 * Main evaluation runner
 */
export class EvalRunner {
  private options: EvalRunnerOptions;
  private executor: ClaudeCLIExecutor | null = null;
  private config: RunConfig | null = null;

  constructor(options: EvalRunnerOptions = {}) {
    this.options = options;
  }

  /**
   * Run evaluation on a benchmark
   */
  async run(benchmark: BenchmarkSet, config: RunConfig): Promise<EvalRun> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const collector = new ResponseCollector();

    // Filter questions if specific IDs provided
    let questions = config.questionIds
      ? benchmark.questions.filter((q) => config.questionIds?.includes(q.id))
      : benchmark.questions;

    // TEMPORARY: Limit to 1 question to avoid rate limits during development
    if (questions.length > 1) {
      this.log(`Limiting to 1 question (was ${questions.length}) to avoid rate limits`);
      questions = questions.slice(0, 1);
    }

    const totalSteps = questions.length * config.modes.length;
    let currentStep = 0;

    this.emit({
      type: "start",
      current: 0,
      total: totalSteps,
      message: `Starting evaluation: ${questions.length} questions, modes: ${config.modes.join(", ")}`,
    });

    try {
      // Initialize Claude CLI executor and store config
      this.executor = new ClaudeCLIExecutor();
      this.config = config;

      this.log("Initialized Claude CLI executor");
      if (config.model) {
        this.log(`Using model: ${config.model}`);
      }
      if (config.modes.includes("enhanced")) {
        this.log("Enhanced mode will use MCP tools via Claude CLI");
      }

      // Run evaluations
      for (const question of questions) {
        for (const mode of config.modes) {
          currentStep++;

          this.emit({
            type: "question",
            current: currentStep,
            total: totalSteps,
            questionId: question.id,
            mode,
            message: `Evaluating ${question.id} (${mode})`,
          });

          const response = await this.evaluateQuestion(question, mode);
          collector.add(response);

          this.log(`Completed ${question.id} (${mode}): ${response.metadata.latencyMs}ms`);
        }
      }

      this.emit({
        type: "complete",
        current: totalSteps,
        total: totalSteps,
        message: "Evaluation complete",
      });

      // Build run result
      const run: EvalRun = {
        id: runId,
        benchmarkId: benchmark.id,
        config,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "completed",
        responses: collector.toArray(),
        pointwiseScores: [], // Filled in by judge step
        pairwiseResults: [], // Filled in by judge step
      };

      return run;
    } catch (error) {
      this.emit({
        type: "error",
        current: currentStep,
        total: totalSteps,
        message: error instanceof Error ? error.message : String(error),
      });

      const run: EvalRun = {
        id: runId,
        benchmarkId: benchmark.id,
        config,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        responses: collector.toArray(),
        pointwiseScores: [],
        pairwiseResults: [],
      };

      return run;
    }
  }

  /**
   * Evaluate a single question
   */
  private async evaluateQuestion(question: EvalQuestion, mode: EvalMode): Promise<EvalResponse> {
    if (!this.executor) {
      throw new Error("Executor not initialized");
    }

    const model = this.config?.model;

    if (mode === "baseline") {
      const result = await this.executor.executeBaseline(question, model);
      return ClaudeCLIExecutor.toEvalResponse(question.id, mode, result);
    }

    // Enhanced mode - Claude CLI will use MCP tools
    const result = await this.executor.executeEnhanced(question, model);
    return ClaudeCLIExecutor.toEvalResponse(question.id, mode, result);
  }

  /**
   * Emit a progress event
   */
  private emit(event: ProgressEvent): void {
    this.options.onProgress?.(event);
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    this.options.onLog?.(message);
  }
}

/**
 * Create and run an evaluation
 */
export async function runEvaluation(
  benchmark: BenchmarkSet,
  config: RunConfig,
  options?: EvalRunnerOptions
): Promise<EvalRun> {
  const runner = new EvalRunner(options);
  return runner.run(benchmark, config);
}
